import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";

const settingsSchema = z.object({
  clinic_name: z.string(),
  clinic_name_ar: z.string(),
  doctor_display_name: z.string(),
  timezone: z.string(),
  default_consultation_minutes: z.number().int(),
  whatsapp_threshold_minutes: z.number().int(),
  late_policy_consultations: z.number().int(),
  clinic_address: z.string().nullable(),
  clinic_map_url: z.string().nullable(),
  display_bilingual: z.boolean().default(false),
});

export interface ClinicSettings {
  clinicName: string;
  clinicNameAr: string;
  doctorName: string;
  timezone: string;
  defaultConsultationMinutes: number;
  whatsappThresholdMinutes: number;
  latePolicyConsultations: number;
  clinicAddress: string | null;
  clinicMapUrl: string | null;
  /** Lobby TV layout: false = Arabic only (default), true = Arabic + English columns. */
  displayBilingual: boolean;
}

export async function getClinicSettings(db: SupabaseClient): Promise<ClinicSettings> {
  const { data, error } = await db
    .from("doctor_settings")
    .select(
      "clinic_name, clinic_name_ar, doctor_display_name, timezone, default_consultation_minutes, whatsapp_threshold_minutes, late_policy_consultations, clinic_address, clinic_map_url, display_bilingual",
    )
    .eq("id", 1)
    .single();
  if (error) throw fromPostgrestError(error);
  const s = settingsSchema.parse(data);
  return {
    clinicName: s.clinic_name,
    clinicNameAr: s.clinic_name_ar,
    doctorName: s.doctor_display_name,
    timezone: s.timezone,
    defaultConsultationMinutes: s.default_consultation_minutes,
    whatsappThresholdMinutes: s.whatsapp_threshold_minutes,
    latePolicyConsultations: s.late_policy_consultations,
    clinicAddress: s.clinic_address,
    clinicMapUrl: s.clinic_map_url,
    displayBilingual: s.display_bilingual,
  };
}
