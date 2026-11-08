import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";

/** A priced service the doctor manages (Settings → Services & fees). */
export interface ClinicService {
  id: string;
  nameAr: string;
  nameEn: string | null;
  price: number;
  isActive: boolean;
  sortOrder: number;
}

const rowSchema = z.object({
  id: z.string().uuid(),
  name_ar: z.string(),
  name_en: z.string().nullable(),
  price: z.union([z.number(), z.string()]).transform(Number),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

const COLUMNS = "id, name_ar, name_en, price, is_active, sort_order";

const toService = (r: z.infer<typeof rowSchema>): ClinicService => ({
  id: r.id,
  nameAr: r.name_ar,
  nameEn: r.name_en,
  price: r.price,
  isActive: r.is_active,
  sortOrder: r.sort_order,
});

/**
 * Staff get every service; visitors get the shown ones only (RLS).
 * Empty when the services migration isn't applied yet.
 */
export async function listClinicServices(db: SupabaseClient, { activeOnly = false } = {}): Promise<ClinicService[]> {
  let query = db.from("clinic_services").select(COLUMNS).order("sort_order").order("created_at");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) return [];
  return z.array(rowSchema).parse(data).map(toService);
}

export async function addClinicService(
  db: SupabaseClient,
  input: { nameAr: string; nameEn?: string; price: number; isActive: boolean },
  actorId: string,
): Promise<ClinicService> {
  const { data: last } = await db.from("clinic_services").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const nextOrder = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1;
  const { data, error } = await db
    .from("clinic_services")
    .insert({
      name_ar: input.nameAr,
      name_en: input.nameEn ?? null,
      price: input.price,
      is_active: input.isActive,
      sort_order: nextOrder,
      updated_by: actorId,
    })
    .select(COLUMNS)
    .single();
  if (error) throw fromPostgrestError(error);
  return toService(rowSchema.parse(data));
}

/** RLS lets only the doctor's update match. Returns false when nothing was updated. */
export async function updateClinicService(
  db: SupabaseClient,
  id: string,
  input: { nameAr: string; nameEn?: string; price: number; isActive: boolean },
  actorId: string,
): Promise<ClinicService | null> {
  const { data, error } = await db
    .from("clinic_services")
    .update({
      name_ar: input.nameAr,
      name_en: input.nameEn ?? null,
      price: input.price,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq("id", id)
    .select(COLUMNS);
  if (error) throw fromPostgrestError(error);
  const row = data?.[0];
  return row ? toService(rowSchema.parse(row)) : null;
}

export async function setClinicServiceActive(db: SupabaseClient, id: string, isActive: boolean, actorId: string): Promise<boolean> {
  const { data, error } = await db
    .from("clinic_services")
    .update({ is_active: isActive, updated_at: new Date().toISOString(), updated_by: actorId })
    .eq("id", id)
    .select("id");
  if (error) throw fromPostgrestError(error);
  return (data?.length ?? 0) > 0;
}

export async function deleteClinicService(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db.from("clinic_services").delete().eq("id", id).select("id");
  if (error) throw fromPostgrestError(error);
  return (data?.length ?? 0) > 0;
}
