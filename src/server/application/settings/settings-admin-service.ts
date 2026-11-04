import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";

const settingsRow = z.object({
  clinic_name: z.string(),
  clinic_name_ar: z.string(),
  doctor_display_name: z.string(),
  timezone: z.string(),
  default_consultation_minutes: z.number().int(),
  whatsapp_threshold_minutes: z.number().int(),
  late_policy_consultations: z.number().int(),
  booking_horizon_days: z.number().int(),
  cancellation_cutoff_minutes: z.number().int(),
  slot_interval_minutes: z.number().int(),
  clinic_address: z.string().nullable(),
  clinic_map_url: z.string().nullable(),
  updated_at: z.string(),
});

const workingDaysSaveResultSchema = z.object({
  saved: z.boolean(),
  count: z.number().int(),
  conflicts: z.array(
    z.object({
      appointment_id: z.string().uuid(),
      clinic_date: z.string(),
      scheduled_start: z.string(),
      patient_name: z.string(),
    }),
  ),
});
export type WorkingDaysSaveResult = z.infer<typeof workingDaysSaveResultSchema>;

export interface FullClinicSettings {
  clinicName: string;
  clinicNameAr: string;
  doctorName: string;
  timezone: string;
  defaultConsultationMinutes: number;
  whatsappThresholdMinutes: number;
  latePolicyConsultations: number;
  bookingHorizonDays: number;
  cancellationCutoffMinutes: number;
  slotIntervalMinutes: number;
  clinicAddress: string;
  clinicMapUrl: string;
  updatedAt: string;
}

export interface WorkingPeriod {
  weekday: number;
  start: string; // HH:MM
  end: string; // HH:MM
}

export class SettingsAdminService {
  constructor(private readonly db: SupabaseClient) {}

  async get(): Promise<{ settings: FullClinicSettings; periods: WorkingPeriod[] }> {
    const [s, w] = await Promise.all([
      this.db
        .from("doctor_settings")
        .select(
          "clinic_name, clinic_name_ar, doctor_display_name, timezone, default_consultation_minutes, whatsapp_threshold_minutes, late_policy_consultations, booking_horizon_days, cancellation_cutoff_minutes, slot_interval_minutes, clinic_address, clinic_map_url, updated_at",
        )
        .eq("id", 1)
        .single(),
      this.db.from("clinic_working_days").select("weekday, start_time, end_time").eq("is_active", true).order("weekday").order("start_time"),
    ]);
    if (s.error) throw fromPostgrestError(s.error);
    if (w.error) throw fromPostgrestError(w.error);
    const r = settingsRow.parse(s.data);
    return {
      settings: {
        clinicName: r.clinic_name,
        clinicNameAr: r.clinic_name_ar,
        doctorName: r.doctor_display_name,
        timezone: r.timezone,
        defaultConsultationMinutes: r.default_consultation_minutes,
        whatsappThresholdMinutes: r.whatsapp_threshold_minutes,
        latePolicyConsultations: r.late_policy_consultations,
        bookingHorizonDays: r.booking_horizon_days,
        cancellationCutoffMinutes: r.cancellation_cutoff_minutes,
        slotIntervalMinutes: r.slot_interval_minutes,
        clinicAddress: r.clinic_address ?? "",
        clinicMapUrl: r.clinic_map_url ?? "",
        updatedAt: r.updated_at,
      },
      periods: z
        .array(z.object({ weekday: z.number().int(), start_time: z.string(), end_time: z.string() }))
        .parse(w.data)
        .map((p) => ({ weekday: p.weekday, start: p.start_time.slice(0, 5), end: p.end_time.slice(0, 5) })),
    };
  }

  /** RLS: only the doctor's update matches a row. Returns false when nothing was updated. */
  async update(input: Omit<FullClinicSettings, "updatedAt" | "timezone">, actorId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("doctor_settings")
      .update({
        clinic_name: input.clinicName,
        clinic_name_ar: input.clinicNameAr,
        doctor_display_name: input.doctorName,
        default_consultation_minutes: input.defaultConsultationMinutes,
        whatsapp_threshold_minutes: input.whatsappThresholdMinutes,
        late_policy_consultations: input.latePolicyConsultations,
        booking_horizon_days: input.bookingHorizonDays,
        cancellation_cutoff_minutes: input.cancellationCutoffMinutes,
        slot_interval_minutes: input.slotIntervalMinutes,
        clinic_address: input.clinicAddress || null,
        clinic_map_url: input.clinicMapUrl || null,
        updated_by: actorId,
      })
      .eq("id", 1)
      .select("id");
    if (error) throw fromPostgrestError(error);
    return (data?.length ?? 0) > 0;
  }

  /**
   * Replaces the weekly hours. Unless `force`, nothing is saved when upcoming
   * bookings would fall outside the new hours; those bookings are returned instead.
   */
  async saveWorkingDays(periods: WorkingPeriod[], force = false): Promise<WorkingDaysSaveResult> {
    const { data, error } = await this.db.rpc("save_working_days", {
      p_periods: periods.map((p) => ({ weekday: p.weekday, start_time: p.start, end_time: p.end })),
      p_force: force,
    });
    if (error) throw fromPostgrestError(error);
    return workingDaysSaveResultSchema.parse(data);
  }
}
