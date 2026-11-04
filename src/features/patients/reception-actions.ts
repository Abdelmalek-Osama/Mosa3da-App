"use server";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action-result";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { normalizePhone } from "@/lib/auth/patient-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  completePatientVerification,
  isRegistrationVerified,
  startPatientRegistration,
} from "@/server/application/patients/registration-service";
import { requireStaff } from "@/server/authorization/actor";
import { otpCodeSchema } from "./schemas";

/**
 * Reception activation (P0-04): a visitor at the desk gets a portal account
 * without typing a password. Reuses the self-registration flow: a pending
 * account + 4-digit code, then verification links/creates her patient record.
 * The password is generated here, set through the Auth Admin API (stored only
 * as a hash by Supabase) and returned ONCE to the secretary. It is never logged.
 */

const startSchema = z.object({
  fullName: z.string().trim().min(3, "Enter the visitor's full name").max(120),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const normalized = normalizePhone(v);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "Enter a valid mobile number, e.g. 010 0123 4567" });
        return z.NEVER;
      }
      return normalized;
    }),
});

const finishSchema = z.object({
  userId: z.string().uuid(),
  code: otpCodeSchema.optional(),
});

/** Readable, strong temporary password (no look-alike characters). */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export async function sendReceptionCodeAction(input: z.input<typeof startSchema>) {
  return runAction("reception.send_code", async () => {
    await requireStaff();
    const data = parseInput(startSchema, input);
    // A throwaway password: the real one is generated after verification.
    const { userId, otp } = await startPatientRegistration({ fullName: data.fullName, phone: data.phone, password: generatePassword() + "9" });
    return { userId, mode: otp.mode, displayCode: otp.displayCode ?? null, expiresAt: otp.expiresAt };
  });
}

export async function finishReceptionActivationAction(input: z.input<typeof finishSchema>) {
  return runAction("reception.finish", async () => {
    await requireStaff();
    const data = parseInput(finishSchema, input);
    const admin = createSupabaseAdminClient();

    const { data: profile, error } = await admin.from("profiles").select("role, full_name, phone").eq("id", data.userId).maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!profile || profile.role !== "patient") throw new AppError("NOT_FOUND", "Registration not found. Send a new code.");

    if (data.code) {
      await completePatientVerification(data.userId, data.code);
    } else {
      // Free WhatsApp mode: the visitor sent the code from her phone. Only a
      // verification that just happened may set the password here.
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data: recent } = await admin
        .from("otp_verifications")
        .select("id")
        .eq("auth_user_id", data.userId)
        .gte("consumed_at", since)
        .limit(1);
      if (!(await isRegistrationVerified(data.userId)) || !recent?.length) {
        throw new AppError("VALIDATION", "Not verified yet. Ask the visitor to send the code from her WhatsApp, then try again.");
      }
    }

    const password = generatePassword();
    const { error: pwError } = await admin.auth.admin.updateUserById(data.userId, { password });
    if (pwError) throw new AppError("INTERNAL", "Could not set the password", { cause: pwError });

    return { password, fullName: profile.full_name as string, phone: (profile.phone as string | null) ?? "" };
  });
}

/** Free-mode poll: has the visitor's WhatsApp message verified the number yet? */
export async function checkReceptionVerifiedAction(userId: string) {
  return runAction("reception.check", async () => {
    await requireStaff();
    return { verified: await isRegistrationVerified(z.string().uuid().parse(userId)) };
  });
}
