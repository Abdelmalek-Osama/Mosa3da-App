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
});

export interface ClinicSettings {
  clinicName: string;
  clinicNameAr: string;
  doctorName: string;
  timezone: string;
  defaultConsultationMinutes: number;
  whatsappThresholdMinutes: number;
  latePolicyConsultations: number;
}

export async function getClinicSettings(db: SupabaseClient): Promise<ClinicSettings> {
  const { data, error } = await db
    .from("doctor_settings")
    .select(
      "clinic_name, clinic_name_ar, doctor_display_name, timezone, default_consultation_minutes, whatsapp_threshold_minutes, late_policy_consultations",
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
  };
}
