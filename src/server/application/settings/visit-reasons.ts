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

/**
 * A reason the doctor added. Booked as visit_reason 'other' with
 * visit_reason_details = labelAr, which every list shows instead of "Other".
 */
export interface CustomVisitReason {
  id: string;
  labelAr: string;
  labelEn: string | null;
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

const customSchema = z.object({
  id: z.string().uuid(),
  label_ar: z.string(),
  label_en: z.string().nullable(),
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

/** Empty when the custom-reasons migration isn't applied yet. */
export async function listCustomVisitReasons(db: SupabaseClient): Promise<CustomVisitReason[]> {
  const { data, error } = await db
    .from("custom_visit_reasons")
    .select("id, label_ar, label_en, default_duration_minutes, is_active, sort_order")
    .order("sort_order")
    .order("created_at");
  if (error) return [];
  return z
    .array(customSchema)
    .parse(data)
    .map((r) => ({
      id: r.id,
      labelAr: r.label_ar,
      labelEn: r.label_en,
      durationMinutes: r.default_duration_minutes,
      isActive: r.is_active,
      sortOrder: r.sort_order,
    }));
}

/** Duration for a reason; for 'other', a matching custom reason wins. */
export async function reasonDuration(db: SupabaseClient, reason: VisitReason, details?: string): Promise<number | undefined> {
  if (reason === "other" && details?.trim()) {
    const key = details.trim().toLowerCase();
    const custom = (await listCustomVisitReasons(db)).find(
      (c) => c.isActive && (c.labelAr.trim().toLowerCase() === key || c.labelEn?.trim().toLowerCase() === key),
    );
    if (custom) return custom.durationMinutes;
  }
  const { data, error } = await db.from("visit_reason_settings").select("default_duration_minutes").eq("reason", reason).maybeSingle();
  if (error) throw fromPostgrestError(error);
  return (data?.default_duration_minutes as number | undefined) ?? undefined;
}

/** RLS lets only the doctor's update match. Returns false when nothing was updated. */
export async function saveVisitReasons(
  db: SupabaseClient,
  rows: VisitReasonSetting[],
  custom: Pick<CustomVisitReason, "id" | "durationMinutes" | "isActive" | "sortOrder">[],
  actorId: string,
): Promise<boolean> {
  let updated = 0;
  const now = new Date().toISOString();
  for (const r of rows) {
    const { data, error } = await db
      .from("visit_reason_settings")
      .update({ default_duration_minutes: r.durationMinutes, is_active: r.isActive, sort_order: r.sortOrder, updated_at: now, updated_by: actorId })
      .eq("reason", r.reason)
      .select("reason");
    if (error) throw fromPostgrestError(error);
    updated += data?.length ?? 0;
  }
  for (const c of custom) {
    const { data, error } = await db
      .from("custom_visit_reasons")
      .update({ default_duration_minutes: c.durationMinutes, is_active: c.isActive, sort_order: c.sortOrder, updated_at: now })
      .eq("id", c.id)
      .select("id");
    if (error) throw fromPostgrestError(error);
    updated += data?.length ?? 0;
  }
  return updated > 0;
}

export async function addCustomVisitReason(
  db: SupabaseClient,
  input: { labelAr: string; labelEn?: string; durationMinutes: number },
  actorId: string,
): Promise<CustomVisitReason> {
  const { data, error } = await db
    .from("custom_visit_reasons")
    .insert({
      label_ar: input.labelAr,
      label_en: input.labelEn ?? null,
      default_duration_minutes: input.durationMinutes,
      sort_order: 100,
      created_by: actorId,
    })
    .select("id, label_ar, label_en, default_duration_minutes, is_active, sort_order")
    .single();
  if (error) throw fromPostgrestError(error);
  const r = customSchema.parse(data);
  return { id: r.id, labelAr: r.label_ar, labelEn: r.label_en, durationMinutes: r.default_duration_minutes, isActive: r.is_active, sortOrder: r.sort_order };
}

/** Past bookings keep the reason's name as text, so deleting is always safe. */
export async function deleteCustomVisitReason(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db.from("custom_visit_reasons").delete().eq("id", id).select("id");
  if (error) throw fromPostgrestError(error);
  return (data?.length ?? 0) > 0;
}
