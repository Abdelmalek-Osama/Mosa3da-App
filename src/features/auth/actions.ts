"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { localizeState } from "@/i18n/localize-state";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SignInState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
}

const staffSignInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(6, "Enter your password"),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin/dashboard";
}

export async function staffSignInAction(prev: SignInState, formData: FormData): Promise<SignInState> {
  return localizeState(await signIn(prev, formData));
}

async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = staffSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: errors.email?.[0], password: errors.password?.[0] } };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    const banned = error?.message.toLowerCase().includes("banned");
    logger.warn("auth.staff_sign_in_failed", { reason: banned ? "inactive" : "credentials" });
    return {
      error: banned
        ? "This account has been deactivated. Please contact the doctor."
        : "Incorrect email or password.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active || (profile.role !== "doctor" && profile.role !== "secretary")) {
    await supabase.auth.signOut();
    return {
      error:
        profile?.role === "patient"
          ? "This sign-in is for clinic staff. Patients sign in from the patient portal."
          : "This account has been deactivated. Please contact the doctor.",
    };
  }

  redirect(safeNext(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
