import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { VISIT_REASONS, type VisitReason } from "@/server/domain/queue/constants";

const calendarSchema = z.object({
  timezone: z.string(),
  default_duration_minutes: z.number().int(),
  cancellation_cutoff_minutes: z.number().int(),
  dates: z.array(z.object({ date: z.string(), free: z.number().int() })),
});

export interface BookingCalendar {
  timezone: string;
  durationMinutes: number;
  cancellationCutoffMinutes: number;
  dates: { date: string; free: number }[];
}

export interface Slot {
  start: string;
  end: string;
  available: boolean;
}

const appointmentSchema = z.object({
  id: z.string().uuid(),
  clinic_date: z.string(),
  scheduled_start: z.string().nullable(),
  duration_minutes: z.number().int(),
  visit_reason: z.enum(VISIT_REASONS),
  visit_reason_details: z.string().nullable(),
  patient_notes: z.string().nullable(),
  status: z.enum(["scheduled", "checked_in", "completed", "cancelled", "no_show"]),
  source: z.enum(["patient_portal", "staff", "walk_in"]),
  created_at: z.string(),
});

export interface PatientAppointment {
  id: string;
  clinicDate: string;
  scheduledStart: string | null;
  durationMinutes: number;
  visitReason: VisitReason;
  visitReasonDetails: string | null;
  notes: string | null;
  status: z.infer<typeof appointmentSchema>["status"];
  source: z.infer<typeof appointmentSchema>["source"];
}

export class BookingService {
  constructor(private readonly db: SupabaseClient) {}

  async getCalendar(): Promise<BookingCalendar> {
    const { data, error } = await this.db.rpc("get_booking_calendar");
    if (error) throw fromPostgrestError(error);
    const c = calendarSchema.parse(data);
    return {
      timezone: c.timezone,
      durationMinutes: c.default_duration_minutes,
      cancellationCutoffMinutes: c.cancellation_cutoff_minutes,
      dates: c.dates,
    };
  }

  async getSlots(date: string): Promise<Slot[]> {
    const { data, error } = await this.db.rpc("get_available_slots", { p_date: date });
    if (error) throw fromPostgrestError(error);
    return z
      .array(z.object({ slot_start: z.string(), slot_end: z.string(), available: z.boolean() }))
      .parse(data)
      .map((s) => ({ start: s.slot_start, end: s.slot_end, available: s.available }));
  }

  async book(input: { slotStart: string; visitReason: VisitReason; visitReasonDetails?: string; notes?: string }) {
    const { data, error } = await this.db.rpc("book_appointment", {
      p_slot_start: input.slotStart,
      p_visit_reason: input.visitReason,
      p_visit_reason_details: input.visitReasonDetails ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw fromPostgrestError(error);
    return z
      .object({ appointment_id: z.string().uuid(), clinic_date: z.string(), scheduled_start: z.string(), scheduled_end: z.string() })
      .parse(data);
  }

  async cancelMine(appointmentId: string, reason?: string) {
    const { error } = await this.db.rpc("cancel_my_appointment", { p_appointment_id: appointmentId, p_reason: reason ?? null });
    if (error) throw fromPostgrestError(error);
  }

  /** RLS restricts this to the caller's own appointments. */
  async listMine(): Promise<PatientAppointment[]> {
    const { data, error } = await this.db
      .from("appointments")
      .select("id, clinic_date, scheduled_start, duration_minutes, visit_reason, visit_reason_details, patient_notes, status, source, created_at")
      .order("clinic_date", { ascending: false })
      .order("scheduled_start", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw fromPostgrestError(error);
    return z
      .array(appointmentSchema)
      .parse(data)
      .map((a) => ({
        id: a.id,
        clinicDate: a.clinic_date,
        scheduledStart: a.scheduled_start,
        durationMinutes: a.duration_minutes,
        visitReason: a.visit_reason,
        visitReasonDetails: a.visit_reason_details,
        notes: a.patient_notes,
        status: a.status,
        source: a.source,
      }));
  }
}

export function canCancelOnline(a: PatientAppointment, cutoffMinutes: number, now = Date.now()): boolean {
  return a.status === "scheduled" && !!a.scheduledStart && new Date(a.scheduledStart).getTime() - now >= cutoffMinutes * 60_000;
}

export function isUpcoming(a: PatientAppointment, today: string): boolean {
  return (a.status === "scheduled" || a.status === "checked_in") && a.clinicDate >= today;
}
