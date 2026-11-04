import "server-only";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { logger } from "@/lib/logger";
import { patientAuthEmail } from "@/lib/auth/patient-identity";
import { serverEnv } from "@/lib/server-env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  generateOtp,
  hashOtp,
  otpMatches,
} from "@/server/domain/otp";
import { getOtpProvider, isDemoOtpDisplayEnabled } from "@/server/integrations/otp";
import { otpMode, type OtpMode } from "@/server/integrations/whatsapp/config";

type Locale = "ar" | "en";

const PURPOSE = "patient_registration" as const;

export interface IssuedOtp {
  phone: string;
  expiresAt: string;
  mode: OtpMode;
  /**
   * demo: shown in a "not sent" demo panel (when enabled).
   * inbound: the code the patient sends to the clinic from her WhatsApp.
   * cloud_api: never set; the code went out by WhatsApp.
   */
  displayCode?: string;
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function findAuthUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  // profiles.email mirrors auth.users.email (set by the on_auth_user_created trigger).
  const { data, error } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return (data?.id as string | undefined) ?? null;
}

/**
 * Step 1. Creates (or refreshes) an INACTIVE patient auth user and issues an OTP.
 * The account cannot use the portal until the OTP is verified.
 */
export async function startPatientRegistration(input: {
  fullName: string;
  fullNameEn?: string;
  phone: string; // normalized E.164
  password: string;
  locale?: Locale;
}): Promise<{ userId: string; authEmail: string; otp: IssuedOtp }> {
  const admin = createSupabaseAdminClient();
  const authEmail = patientAuthEmail(input.phone);

  const { data: existingPatient, error: patientError } = await admin
    .from("patients")
    .select("id, auth_user_id")
    .eq("normalized_phone", input.phone)
    .maybeSingle();
  if (patientError) throw fromPostgrestError(patientError);
  if (existingPatient?.auth_user_id) {
    throw new AppError("CONFLICT", "This phone number is already registered. Please sign in instead.", {
      fieldErrors: { phone: ["Already registered — sign in instead"] },
    });
  }

  const metadata = {
    full_name: input.fullName,
    full_name_en: input.fullNameEn ?? null,
    phone: input.phone,
    contact_email: null,
    locale: input.locale ?? "ar",
  };
  let userId = await findAuthUserIdByEmail(admin, authEmail);

  if (userId) {
    // An unfinished earlier registration: refresh it (only while still inactive).
    const { data: profile } = await admin.from("profiles").select("is_active, role").eq("id", userId).maybeSingle();
    if (profile?.is_active || profile?.role !== "patient") {
      throw new AppError("CONFLICT", "This phone number is already registered. Please sign in instead.");
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password: input.password, user_metadata: metadata });
    if (error) throw new AppError("INTERNAL", "Could not update your registration", { cause: error });
    await admin.from("profiles").update({ full_name: input.fullName }).eq("id", userId);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: authEmail,
      password: input.password,
      email_confirm: true,
      app_metadata: { role: "patient", is_active: false },
      user_metadata: metadata,
    });
    if (error || !data.user) {
      const weak = error?.message.toLowerCase().includes("password");
      throw new AppError(weak ? "VALIDATION" : "INTERNAL", weak ? error!.message : "Could not create your account", {
        cause: error,
        fieldErrors: weak ? { password: [error!.message] } : undefined,
      });
    }
    userId = data.user.id;
    // createUser writes app_metadata after the auth.users insert, so the
    // on_auth_user_created trigger defaults the profile to active. Force the
    // unverified state explicitly until the phone is verified.
    const { error: profileError } = await admin.from("profiles").update({ is_active: false, role: "patient" }).eq("id", userId);
    if (profileError) throw new AppError("INTERNAL", "Could not create your account", { cause: profileError });
  }

  const otp = await issueRegistrationOtp(userId, input.phone, { ignoreCooldown: true, locale: input.locale });
  return { userId, authEmail, otp };
}

/** Issues a fresh OTP, invalidating any previous one. */
export async function issueRegistrationOtp(
  authUserId: string,
  phone: string,
  { ignoreCooldown = false, locale = "ar" as Locale }: { ignoreCooldown?: boolean; locale?: Locale } = {},
): Promise<IssuedOtp> {
  const admin = createSupabaseAdminClient();

  const { data: active } = await admin
    .from("otp_verifications")
    .select("id, created_at")
    .eq("normalized_phone", phone)
    .eq("purpose", PURPOSE)
    .is("consumed_at", null)
    .maybeSingle();

  if (active && !ignoreCooldown) {
    const age = (Date.now() - new Date(active.created_at as string).getTime()) / 1000;
    if (age < OTP_RESEND_COOLDOWN_SECONDS) {
      throw new AppError("CONFLICT", `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - age)} seconds before requesting a new code.`);
    }
  }
  if (active) {
    await admin.from("otp_verifications").update({ consumed_at: new Date().toISOString() }).eq("id", active.id);
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  const { error } = await admin.from("otp_verifications").insert({
    normalized_phone: phone,
    purpose: PURPOSE,
    code_hash: hashOtp(code, phone, PURPOSE, serverEnv("OTP_PEPPER")),
    auth_user_id: authUserId,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw fromPostgrestError(error, "Could not create a verification code");

  const delivery = await getOtpProvider().deliver({ phone, code, expiresAt, purpose: PURPOSE, locale });
  const base = { phone, expiresAt: expiresAt.toISOString() };
  if (delivery.delivered) return { ...base, mode: "cloud_api" };
  if (delivery.channel === "inbound") return { ...base, mode: "inbound", displayCode: delivery.displayCode };
  return { ...base, mode: "demo", displayCode: isDemoOtpDisplayEnabled() ? delivery.demoCode : undefined };
}

/** True once the signed-in registration has been verified (used by the verify page poll). */
export async function isRegistrationVerified(authUserId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("profiles").select("is_active").eq("id", authUserId).maybeSingle();
  return data?.is_active === true;
}

export type InboundVerificationResult = "verified" | "no_pending_code" | "rejected";

/**
 * Free WhatsApp mode: a code that arrived at the clinic's webhook FROM `fromPhone`.
 * The sender's number is what proves ownership, so only a pending code issued
 * for that same number can be used.
 */
export async function verifyInboundWhatsAppCode(fromPhone: string, code: string): Promise<InboundVerificationResult> {
  const admin = createSupabaseAdminClient();
  const { data: otp, error } = await admin
    .from("otp_verifications")
    .select("auth_user_id")
    .eq("normalized_phone", fromPhone)
    .eq("purpose", PURPOSE)
    .is("consumed_at", null)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!otp?.auth_user_id) return "no_pending_code";
  try {
    await completePatientVerification(otp.auth_user_id as string, code, { via: "whatsapp" });
    return "verified";
  } catch (e) {
    logger.warn("otp.inbound_rejected", { reason: e instanceof Error ? e.message : String(e) });
    return "rejected";
  }
}

/**
 * Step 2. Verifies the code for the signed-in pending user, then activates the
 * profile and creates or links the patient record (existing walk-in records
 * with the same phone are linked, never duplicated).
 */
export async function completePatientVerification(
  authUserId: string,
  code: string,
  { via = "form" }: { via?: "form" | "whatsapp" } = {},
): Promise<void> {
  // In free WhatsApp mode the code is shown on screen, so typing it proves nothing.
  if (via === "form" && otpMode() === "inbound") {
    throw new AppError("VALIDATION", "Your number isn't verified yet. Send the code from WhatsApp, then try again.");
  }
  const admin = createSupabaseAdminClient();

  const { data: userRes, error: userError } = await admin.auth.admin.getUserById(authUserId);
  if (userError || !userRes.user) throw new AppError("UNAUTHENTICATED", "Please register again.");
  const meta = userRes.user.user_metadata as {
    full_name?: string;
    full_name_en?: string | null;
    phone?: string;
    contact_email?: string | null;
    locale?: string;
  };
  const preferredLocale: Locale = meta.locale === "en" ? "en" : "ar";
  const phone = meta.phone;
  if (!phone) throw new AppError("INTERNAL", "Registration is missing a phone number");

  const { data: otp, error } = await admin
    .from("otp_verifications")
    .select("id, code_hash, attempts, max_attempts, expires_at")
    .eq("normalized_phone", phone)
    .eq("purpose", PURPOSE)
    .eq("auth_user_id", authUserId)
    .is("consumed_at", null)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!otp) throw new AppError("NOT_FOUND", "No active code. Request a new one.");
  if (new Date(otp.expires_at as string).getTime() < Date.now()) {
    throw new AppError("VALIDATION", "This code has expired. Request a new one.", { fieldErrors: { code: ["Code expired"] } });
  }
  if ((otp.attempts as number) >= (otp.max_attempts as number)) {
    throw new AppError("VALIDATION", "Too many attempts. Request a new code.", { fieldErrors: { code: ["Too many attempts"] } });
  }

  if (!otpMatches(code, otp.code_hash as string, phone, PURPOSE, serverEnv("OTP_PEPPER"))) {
    await admin.from("otp_verifications").update({ attempts: (otp.attempts as number) + 1 }).eq("id", otp.id).eq("attempts", otp.attempts);
    const left = (otp.max_attempts as number) - (otp.attempts as number) - 1;
    throw new AppError("VALIDATION", left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many attempts. Request a new code.", {
      fieldErrors: { code: ["Incorrect code"] },
    });
  }

  // Consume first (conditional) so a code can only ever be used once.
  const consumed = await admin
    .from("otp_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otp.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!consumed.data) throw new AppError("CONFLICT", "This code was already used.");

  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("patients")
    .select("id, auth_user_id, email")
    .eq("normalized_phone", phone)
    .maybeSingle();

  if (existing?.auth_user_id && existing.auth_user_id !== authUserId) {
    throw new AppError("CONFLICT", "This phone number is already registered. Please sign in instead.");
  }

  if (existing) {
    const { error: linkError } = await admin
      .from("patients")
      .update({
        auth_user_id: authUserId,
        phone_verified_at: now,
        email: existing.email ?? meta.contact_email ?? null,
        preferred_locale: preferredLocale,
        ...(meta.full_name_en ? { full_name_en: meta.full_name_en } : {}),
      })
      .eq("id", existing.id);
    if (linkError) throw fromPostgrestError(linkError);
  } else {
    const { error: insertError } = await admin.from("patients").insert({
      full_name: meta.full_name ?? "Patient",
      full_name_en: meta.full_name_en ?? null,
      normalized_phone: phone,
      email: meta.contact_email ?? null,
      auth_user_id: authUserId,
      phone_verified_at: now,
      preferred_locale: preferredLocale,
    });
    if (insertError) throw fromPostgrestError(insertError);
  }

  const { error: activateError } = await admin.from("profiles").update({ is_active: true }).eq("id", authUserId);
  if (activateError) throw fromPostgrestError(activateError);
  await admin.auth.admin.updateUserById(authUserId, { app_metadata: { role: "patient", is_active: true } });

  logger.info("patients.verified", { linkedExisting: !!existing });
}
