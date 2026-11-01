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
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      logger.warn("secretary.create_failed", { reason: exists ? "exists" : error?.message });
      throw new AppError(
        exists ? "CONFLICT" : "INTERNAL",
        exists ? "An account with this email already exists." : "Could not create the account. Please try again.",
        exists ? { fieldErrors: { email: ["Already in use"] } } : {},
      );
    }
    // The auth trigger created the profile from app_metadata; record who created it.
    await admin.from("profiles").update({ created_by: this.doctorId, full_name: input.fullName }).eq("id", data.user.id);
    return { id: data.user.id };
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
