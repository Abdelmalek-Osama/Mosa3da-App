"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isAppError } from "@/lib/errors/app-error";
import { localizeState } from "@/i18n/localize-state";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  completePasswordReset,
  isResetVerified,
  requestPasswordReset,
} from "@/server/application/patients/password-reset-service";
import { clearResetRequest, readResetRequest, rememberResetRequest } from "./reset-cookie";
import type { PatientFormState } from "./actions";
import { otpCodeSchema, patientSignInSchema } from "./schemas";

const requestSchema = patientSignInSchema.pick({ phone: true });

const resetSchema = z
  .object({
    code: otpCodeSchema.optional(),
    password: z.string().min(8, "Use at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" });

function toState(error: unknown, fallback: string): PatientFormState {
  if (isAppError(error)) {
    return {
      error: error.message,
      fieldErrors: error.fieldErrors ? Object.fromEntries(Object.entries(error.fieldErrors).map(([k, v]) => [k, v?.[0]])) : undefined,
    };
  }
  logger.error("patients.reset_failed", { error });
  return { error: fallback };
}

async function issue(phone: string) {
  const otp = await requestPasswordReset(phone);
  rememberResetRequest({ id: otp.id, phone, mode: otp.mode, expiresAt: otp.expiresAt, code: otp.displayCode });
}

/** Step 1: mobile number → 4-digit code (5 minutes). */
export async function requestResetAction(prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  return localizeState(await requestResetImpl(prev, formData));
}

async function requestResetImpl(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const parsed = requestSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) return { fieldErrors: { phone: parsed.error.flatten().fieldErrors.phone?.[0] } };
  try {
    await issue(parsed.data.phone);
  } catch (error) {
    return toState(error, "We couldn't send a code. Please try again.");
  }
  redirect("/patient/forgot/reset");
}

/** Resend (the page enforces a 60-second countdown; the server enforces it too). */
export async function resendResetAction(): Promise<PatientFormState> {
  const request = readResetRequest();
  if (!request) return localizeState({ error: "This reset request expired. Start again." });
  try {
    await issue(request.phone);
    return localizeState({ notice: "A new code was generated." });
  } catch (error) {
    return localizeState(toState(error, "Could not generate a new code."));
  }
}

/** Free WhatsApp mode: polled until the visitor's message verifies the request. */
export async function checkResetVerifiedAction(): Promise<{ verified: boolean }> {
  const request = readResetRequest();
  if (!request) return { verified: false };
  return { verified: await isResetVerified(request.id).catch(() => false) };
}

/** Step 2: code + new password → password updated and the visitor is signed in. */
export async function resetPasswordAction(prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  return localizeState(await resetPasswordImpl(prev, formData));
}

async function resetPasswordImpl(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const request = readResetRequest();
  if (!request) return { error: "This reset request expired. Start again." };

  const parsed = resetSchema.safeParse({
    code: formData.get("code") || undefined,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0]])) };
  }

  try {
    const { authEmail } = await completePasswordReset({ otpId: request.id, code: parsed.data.code, password: parsed.data.password });
    clearResetRequest();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: parsed.data.password });
    if (error) return { error: "Password changed. Please sign in with your new password." };
  } catch (error) {
    return toState(error, "We couldn't reset your password. Please try again.");
  }
  redirect("/patient/dashboard");
}
