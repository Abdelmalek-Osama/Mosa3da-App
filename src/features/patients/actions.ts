"use server";

import { redirect } from "next/navigation";
import { isAppError } from "@/lib/errors/app-error";
import { localizeState } from "@/i18n/localize-state";
import { logger } from "@/lib/logger";
import { patientAuthEmail } from "@/lib/auth/patient-identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  completePatientVerification,
  isRegistrationVerified,
  issueRegistrationOtp,
  startPatientRegistration,
} from "@/server/application/patients/registration-service";
import { getPendingPatient } from "@/server/authorization/actor";
import { getLocale } from "next-intl/server";
import { clearIssuedOtp, rememberIssuedOtp } from "./demo-otp";
import { otpSchema, patientRegisterSchema, patientSignInSchema } from "./schemas";

export interface PatientFormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string | undefined>;
}

function flatten(errors: Record<string, string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v?.[0]]));
}

async function uiLocale(): Promise<"ar" | "en"> {
  return (await getLocale().catch(() => "ar")) === "en" ? "en" : "ar";
}

function toState(error: unknown, fallback: string): PatientFormState {
  if (isAppError(error)) {
    return { error: error.message, fieldErrors: error.fieldErrors ? flatten(error.fieldErrors) : undefined };
  }
  logger.error("patients.action_failed", { error });
  return { error: fallback };
}

export async function registerPatientAction(prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  return localizeState(await registerPatientActionImpl(prev, formData));
}

async function registerPatientActionImpl(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const parsed = patientRegisterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: flatten(parsed.error.flatten().fieldErrors) };

  try {
    const { authEmail, otp } = await startPatientRegistration({ ...parsed.data, locale: await uiLocale() });
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: parsed.data.password });
    if (error) throw error;
    rememberIssuedOtp(otp);
  } catch (error) {
    return toState(error, "We couldn't create your account. Please try again.");
  }
  redirect("/patient/verify");
}

export async function verifyOtpAction(prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  return localizeState(await verifyOtpActionImpl(prev, formData));
}

async function verifyOtpActionImpl(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const parsed = otpSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { fieldErrors: flatten(parsed.error.flatten().fieldErrors) };

  const pending = await getPendingPatient();
  if (!pending) redirect("/patient/dashboard");

  try {
    await completePatientVerification(pending.userId, parsed.data.code);
    clearIssuedOtp();
  } catch (error) {
    return toState(error, "We couldn't verify the code. Please try again.");
  }
  redirect("/patient/dashboard?welcome=1");
}

export async function resendOtpAction(): Promise<PatientFormState> {
  return localizeState(await resendOtp());
}

async function resendOtp(): Promise<PatientFormState> {
  const pending = await getPendingPatient();
  if (!pending) return { error: "Please sign in again." };
  try {
    const otp = await issueRegistrationOtp(pending.userId, pending.phone, { locale: await uiLocale() });
    rememberIssuedOtp(otp);
    return { notice: otp.mode === "cloud_api" ? "A new code was sent to your WhatsApp." : "A new code was generated." };
  } catch (error) {
    return toState(error, "Could not generate a new code.");
  }
}

/** Polled by the verify page in free WhatsApp mode: has the code arrived from her phone yet? */
export async function checkVerificationAction(): Promise<{ verified: boolean }> {
  const pending = await getPendingPatient();
  if (!pending) {
    // No longer pending: either verified (profile active) or signed out.
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return { verified: !!data.user && (await isRegistrationVerified(data.user.id)) };
  }
  return { verified: false };
}

export async function patientSignInAction(prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  return localizeState(await patientSignInActionImpl(prev, formData));
}

async function patientSignInActionImpl(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const parsed = patientSignInSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { fieldErrors: flatten(parsed.error.flatten().fieldErrors) };

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: patientAuthEmail(parsed.data.phone),
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "Incorrect mobile number or password." };

  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "patient") {
    await supabase.auth.signOut();
    return { error: "This sign-in is for patients. Clinic staff sign in at /login." };
  }

  if (!profile.is_active) {
    const pending = await getPendingPatient();
    if (!pending) {
      await supabase.auth.signOut();
      return { error: "Your account is not active. Please contact the clinic." };
    }
    try {
      rememberIssuedOtp(await issueRegistrationOtp(pending.userId, pending.phone, { locale: await uiLocale() }));
    } catch {
      // Cooldown: an active code already exists; the verify page offers resend.
    }
    redirect("/patient/verify");
  }

  const next = parsed.data.next;
  redirect(next && next.startsWith("/patient/") && !next.startsWith("//") ? next : "/patient/dashboard");
}

export async function patientSignOutAction(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/patient/login");
}
