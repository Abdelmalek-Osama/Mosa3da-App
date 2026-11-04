import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { VISIT_REASONS, type VisitReason } from "@/server/domain/queue/constants";

/** Per-reason consultation length and visibility, configured by the doctor (P3-19). */
export interface VisitReasonSetting {
  reason: VisitReason;
  durationMinutes: number;
  isActive: boolean;
  sortOrder: number;
}

const rowSchema = z.object({
  reason: z.enum(VISIT_REASONS),
  default_duration_minutes: z.number().int(),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

export async function listVisitReasons(db: SupabaseClient): Promise<VisitReasonSetting[]> {
  const { data, error } = await db
    .from("visit_reason_settings")
    .select("reason, default_duration_minutes, is_active, sort_order")
    .order("sort_order")
    .order("reason");
  if (error) throw fromPostgrestError(error);
  return z
    .array(rowSchema)
    .parse(data)
    .map((r) => ({ reason: r.reason, durationMinutes: r.default_duration_minutes, isActive: r.is_active, sortOrder: r.sort_order }));
}

export async function reasonDuration(db: SupabaseClient, reason: VisitReason): Promise<number | undefined> {
  const { data, error } = await db.from("visit_reason_settings").select("default_duration_minutes").eq("reason", reason).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return (data?.default_duration_minutes as number | undefined) ?? undefined;
}

/** RLS lets only the doctor's update match. Returns false when nothing was updated. */
export async function saveVisitReasons(db: SupabaseClient, rows: VisitReasonSetting[], actorId: string): Promise<boolean> {
  let updated = 0;
  for (const r of rows) {
    const { data, error } = await db
      .from("visit_reason_settings")
      .update({
        default_duration_minutes: r.durationMinutes,
        is_active: r.isActive,
        sort_order: r.sortOrder,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      })
      .eq("reason", r.reason)
      .select("reason");
    if (error) throw fromPostgrestError(error);
    updated += data?.length ?? 0;
  }
  return updated > 0;
}
