import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Secretary {
  id: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
}

const BAN_FOREVER = "876000h"; // ~100 years; Supabase Auth refuses sign-in while banned.

/**
 * Secretary provisioning. Every method must be called only after
 * requireDoctor(): account creation and bans use the service-role Admin API.
 * Profile activation goes through the doctor's own RLS-checked client.
 */
export class SecretaryService {
  constructor(
    private readonly db: SupabaseClient,
    private readonly doctorId: string,
  ) {}

  async list(): Promise<Secretary[]> {
    const { data, error } = await this.db
      .from("profiles")
      .select("id, full_name, email, is_active, created_at")
      .eq("role", "secretary")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw fromPostgrestError(error);
    return z
      .array(z.object({ id: z.string().uuid(), full_name: z.string(), email: z.string().nullable(), is_active: z.boolean(), created_at: z.string() }))
      .parse(data)
      .map((s) => ({ id: s.id, fullName: s.full_name, email: s.email, isActive: s.is_active, createdAt: s.created_at }));
  }

  /**
   * Creates a secretary who can sign in immediately. Success is returned only
   * after the profile row is confirmed as an active secretary; on any failure
   * the half-created auth user is deleted so the admin can simply try again.
   *
   * Supabase Auth inserts the user before it stores app_metadata, so the
   * on_auth_user_created trigger can see no role and default to 'patient'.
   * The profile is therefore written explicitly here (service role passes the
   * privilege guard), never left to the trigger.
   */
  async create(input: { fullName: string; email: string; password: string }) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      app_metadata: { role: "secretary", is_active: true },
      user_metadata: { full_name: input.fullName },
    });
    if (error || !data.user) {
      const message = error?.message ?? "";
      logger.warn("secretary.create_failed", { stage: "auth", message });
      if (/already|registered|exists/i.test(message)) {
        throw new AppError("CONFLICT", "An account with this email already exists.", { fieldErrors: { email: ["Already in use"] } });
      }
      if (/password/i.test(message)) {
        throw new AppError("VALIDATION", "This password is too weak. Use at least 8 characters with letters and numbers.", {
          fieldErrors: { password: ["Choose a stronger password"] },
        });
      }
      if (/email/i.test(message)) {
        throw new AppError("VALIDATION", "Enter a valid email address", { fieldErrors: { email: ["Enter a valid email address"] } });
      }
      throw new AppError("INTERNAL", "Could not create the account. Please try again.");
    }

    const userId = data.user.id;
    try {
      const { error: profileError } = await admin.from("profiles").upsert(
        {
          id: userId,
          role: "secretary",
          is_active: true,
          full_name: input.fullName,
          email: input.email,
          created_by: this.doctorId,
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      const { data: saved, error: readError } = await admin.from("profiles").select("role, is_active").eq("id", userId).maybeSingle();
      if (readError) throw readError;
      if (!saved || saved.role !== "secretary" || !saved.is_active) throw new Error("profile not saved as an active secretary");
    } catch (cause) {
      logger.error("secretary.create_failed", { stage: "profile", userId, cause });
      const { error: rollbackError } = await admin.auth.admin.deleteUser(userId);
      if (rollbackError) logger.error("secretary.create_rollback_failed", { userId, message: rollbackError.message });
      throw new AppError("INTERNAL", "The account could not be saved, so it was not created. Please try again.");
    }

    return { id: userId };
  }

  async setActive(id: string, active: boolean) {
    await this.assertSecretary(id);
    const { error } = await this.db.from("profiles").update({ is_active: active }).eq("id", id).eq("role", "secretary");
    if (error) throw fromPostgrestError(error);

    const admin = createSupabaseAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : BAN_FOREVER,
      app_metadata: { role: "secretary", is_active: active },
    });
    if (authError) {
      logger.error("secretary.ban_failed", { id, active, message: authError.message });
      throw new AppError("INTERNAL", "Status saved, but sign-in access could not be updated. Please try again.");
    }
  }

  async resetPassword(id: string, password: string) {
    await this.assertSecretary(id);
    const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(id, { password });
    if (error) throw new AppError("INTERNAL", "Could not reset the password. Please try again.");
  }

  private async assertSecretary(id: string) {
    const { data, error } = await this.db.from("profiles").select("role").eq("id", id).maybeSingle();
    if (error) throw fromPostgrestError(error);
    if (!data || data.role !== "secretary") throw new AppError("NOT_FOUND", "Secretary not found.");
  }
}
