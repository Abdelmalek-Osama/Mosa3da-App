import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";

export const appRoleSchema = z.enum(["doctor", "secretary", "patient"]);
export type AppRole = z.infer<typeof appRoleSchema>;

const profileSchema = z.object({
  id: z.string().uuid(),
  role: appRoleSchema,
  full_name: z.string(),
  is_active: z.boolean(),
});

export interface Actor {
  userId: string;
  role: AppRole;
  fullName: string;
  supabase: SupabaseServerClient;
}

/**
 * Resolves the caller from the cookie session (verified with the Auth server
 * via getUser, never trusting the cookie payload alone) and loads the role
 * from the profiles table.
 */
export async function getActor(): Promise<Actor | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !data) return null;
  const profile = profileSchema.parse(data);
  if (!profile.is_active) return null;

  return { userId: profile.id, role: profile.role, fullName: profile.full_name, supabase };
}

async function requireRole(allowed: readonly AppRole[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  if (!allowed.includes(actor.role)) {
    throw new AppError("FORBIDDEN", "You are not allowed to perform this action.");
  }
  return actor;
}

export const requireStaff = () => requireRole(["doctor", "secretary"]);
export const requireDoctor = () => requireRole(["doctor"]);
export const requirePatient = () => requireRole(["patient"]);

export interface PendingPatient {
  userId: string;
  phone: string;
  fullName: string;
}

/**
 * A signed-in patient who registered but has not verified their phone yet:
 * an inactive patient profile, or an active one with no linked patients row
 * (older registrations whose profile was created active by the auth trigger).
 */
export async function getPendingPatient(): Promise<PendingPatient | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  if (!data || data.role !== "patient") return null;
  if (data.is_active) {
    const { data: linked, error } = await supabase.from("patients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (error || linked) return null;
  }

  const meta = user.user_metadata as { phone?: string; full_name?: string };
  if (!meta.phone) return null;
  return { userId: user.id, phone: meta.phone, fullName: meta.full_name ?? "" };
}
