import "server-only";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { patientAuthEmail } from "@/lib/auth/patient-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { otpMode } from "@/server/integrations/whatsapp/config";
import { consumeOtp, issueOtp, type IssuedOtp } from "./registration-service";

/**
 * Self-service password reset (P1-09) for verified visitors. Same OTP machinery
 * as registration with purpose 'password_reset': 4 digits, valid 5 minutes,
 * 60 seconds between resends.
 */
const PURPOSE = "password_reset" as const;
export const RESET_TTL_MINUTES = 5;
export const RESET_RESEND_SECONDS = 60;

export async function requestPasswordReset(phone: string): Promise<IssuedOtp & { id: string }> {
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("email", patientAuthEmail(phone))
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!profile || profile.role !== "patient" || !profile.is_active) {
    throw new AppError("NOT_FOUND", "No account is registered with this number.", {
      fieldErrors: { phone: ["No account with this number"] },
    });
  }
  return issueOtp(profile.id as string, phone, {
    purpose: PURPOSE,
    ttlMinutes: RESET_TTL_MINUTES,
    cooldownSeconds: RESET_RESEND_SECONDS,
  });
}

async function loadRequest(otpId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("otp_verifications")
    .select("id, normalized_phone, auth_user_id, consumed_at")
    .eq("id", otpId)
    .eq("purpose", PURPOSE)
    .maybeSingle();
  if (error) throw fromPostgrestError(error);
  if (!data?.auth_user_id) throw new AppError("NOT_FOUND", "This reset request expired. Start again.");
  return data as { id: string; normalized_phone: string; auth_user_id: string; consumed_at: string | null };
}

/** Free WhatsApp mode: has the visitor's message verified this reset request? */
export async function isResetVerified(otpId: string): Promise<boolean> {
  const row = await loadRequest(otpId);
  return !!row.consumed_at && Date.now() - new Date(row.consumed_at).getTime() < 10 * 60_000;
}

/**
 * Verifies the code (or, in free WhatsApp mode, the visitor's WhatsApp message)
 * and sets the new password. Returns the internal auth email for sign-in.
 */
export async function completePasswordReset({ otpId, code, password }: { otpId: string; code?: string; password: string }) {
  const row = await loadRequest(otpId);
  if (otpMode() === "inbound") {
    // The code is shown on screen in this mode, so typing it proves nothing.
    if (!(await isResetVerified(otpId))) {
      throw new AppError("VALIDATION", "Your number isn't verified yet. Send the code from WhatsApp, then try again.");
    }
  } else {
    if (!code) throw new AppError("VALIDATION", "Enter the 4-digit code", { fieldErrors: { code: ["Enter the 4-digit code"] } });
    await consumeOtp({ phone: row.normalized_phone, purpose: PURPOSE, authUserId: row.auth_user_id, code });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(row.auth_user_id, { password });
  if (error) throw new AppError("INTERNAL", "Could not set the password", { cause: error });
  return { authEmail: patientAuthEmail(row.normalized_phone) };
}

/** Free WhatsApp mode: a reset code that arrived at the clinic's webhook from `fromPhone`. */
export async function verifyInboundResetCode(fromPhone: string, code: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: otp } = await admin
    .from("otp_verifications")
    .select("auth_user_id")
    .eq("normalized_phone", fromPhone)
    .eq("purpose", PURPOSE)
    .is("consumed_at", null)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (!otp?.auth_user_id) return false;
  await consumeOtp({ phone: fromPhone, purpose: PURPOSE, authUserId: otp.auth_user_id as string, code });
  return true;
}
