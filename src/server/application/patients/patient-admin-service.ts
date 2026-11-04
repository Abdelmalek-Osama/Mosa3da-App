import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { VISIT_REASONS } from "@/server/domain/queue/constants";

const PAGE_SIZE = 25;

const patientRow = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  full_name_en: z.string().nullable(),
  normalized_phone: z.string(),
  email: z.string().nullable(),
  date_of_birth: z.string().nullable(),
  auth_user_id: z.string().uuid().nullable(),
  phone_verified_at: z.string().nullable(),
  is_active: z.boolean(),
  preferred_locale: z.enum(["ar", "en"]).catch("ar"),
  created_at: z.string(),
});

export interface PatientSummary {
  id: string;
  fullName: string;
  fullNameEn: string | null;
  phone: string;
  email: string | null;
  dateOfBirth: string | null;
  hasAccount: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  preferredLocale: "ar" | "en";
  createdAt: string;
}

const toSummary = (p: z.infer<typeof patientRow>): PatientSummary => ({
  id: p.id,
  fullName: p.full_name,
  fullNameEn: p.full_name_en,
  phone: p.normalized_phone,
  email: p.email,
  dateOfBirth: p.date_of_birth,
  hasAccount: !!p.auth_user_id,
  phoneVerified: !!p.phone_verified_at,
  isActive: p.is_active,
  preferredLocale: p.preferred_locale,
  createdAt: p.created_at,
});

const SELECT = "id, full_name, full_name_en, normalized_phone, email, date_of_birth, auth_user_id, phone_verified_at, is_active, preferred_locale, created_at";

const historyRow = z.object({
  id: z.string().uuid(),
  clinic_date: z.string(),
  scheduled_start: z.string().nullable(),
  visit_reason: z.enum(VISIT_REASONS),
  visit_reason_details: z.string().nullable(),
  patient_notes: z.string().nullable(),
  status: z.enum(["scheduled", "checked_in", "completed", "cancelled", "no_show"]),
  source: z.enum(["patient_portal", "staff", "walk_in"]),
});

export type PatientVisit = z.infer<typeof historyRow>;

export interface PatientInput {
  fullName: string;
  fullNameEn?: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  preferredLocale?: "ar" | "en";
}

/** Staff-only operations. Authorization: callers run requireStaff(); RLS enforces it again. */
export class PatientAdminService {
  constructor(private readonly db: SupabaseClient) {}

  async list({ query, page = 1 }: { query?: string; page?: number }) {
    let q = this.db
      .from("patients")
      .select(SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    const term = query?.replace(/[%_,()]/g, " ").trim();
    if (term) {
      const digits = term.replace(/\D/g, "").replace(/^0/, "");
      const filters = [`full_name.ilike.%${term}%`];
      if (digits.length >= 3) filters.push(`normalized_phone.ilike.%${digits}%`);
      q = q.or(filters.join(","));
    }

    const { data, error, count } = await q;
    if (error) throw fromPostgrestError(error);
    return {
      patients: z.array(patientRow).parse(data).map(toSummary),
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  async get(id: string) {
    const [p, visits] = await Promise.all([
      this.db.from("patients").select(SELECT).eq("id", id).maybeSingle(),
      this.db
        .from("appointments")
        .select("id, clinic_date, scheduled_start, visit_reason, visit_reason_details, patient_notes, status, source")
        .eq("patient_id", id)
        .order("clinic_date", { ascending: false })
        .order("scheduled_start", { ascending: false, nullsFirst: false })
        .limit(50),
    ]);
    if (p.error) throw fromPostgrestError(p.error);
    if (visits.error) throw fromPostgrestError(visits.error);
    if (!p.data) throw new AppError("NOT_FOUND", "Patient not found.");
    return { patient: toSummary(patientRow.parse(p.data)), visits: z.array(historyRow).parse(visits.data) };
  }

  async create(input: PatientInput, actorId: string) {
    const { data, error } = await this.db
      .from("patients")
      .insert({
        full_name: input.fullName,
        full_name_en: input.fullNameEn ?? null,
        normalized_phone: input.phone,
        email: input.email ?? null,
        date_of_birth: input.dateOfBirth ?? null,
        preferred_locale: input.preferredLocale ?? "ar",
        created_by: actorId,
      })
      .select("id")
      .single();
    if (error) throw fromPostgrestError(error);
    return z.object({ id: z.string().uuid() }).parse(data);
  }

  /** Phone is editable only for records without a portal account (it is the login identity). */
  async update(id: string, input: PatientInput) {
    const { data: existing, error: e1 } = await this.db.from("patients").select("auth_user_id, normalized_phone").eq("id", id).maybeSingle();
    if (e1) throw fromPostgrestError(e1);
    if (!existing) throw new AppError("NOT_FOUND", "Patient not found.");
    if (existing.auth_user_id && existing.normalized_phone !== input.phone) {
      throw new AppError("VALIDATION", "This patient signs in with her phone number, so it can't be changed here.", {
        fieldErrors: { phone: ["Linked to the patient's portal login"] },
      });
    }
    const { error } = await this.db
      .from("patients")
      .update({
        full_name: input.fullName,
        full_name_en: input.fullNameEn ?? null,
        normalized_phone: input.phone,
        email: input.email ?? null,
        date_of_birth: input.dateOfBirth ?? null,
        ...(input.preferredLocale ? { preferred_locale: input.preferredLocale } : {}),
      })
      .eq("id", id);
    if (error) throw fromPostgrestError(error);
  }
}
