import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { VISIT_REASONS, type VisitReason } from "@/server/domain/queue/constants";

const row = z.object({
  id: z.string().uuid(),
  clinic_date: z.string(),
  scheduled_start: z.string().nullable(),
  duration_minutes: z.number().int(),
  visit_reason: z.enum(VISIT_REASONS),
  visit_reason_details: z.string().nullable(),
  patient_notes: z.string().nullable(),
  status: z.enum(["scheduled", "checked_in", "completed", "cancelled", "no_show"]),
  source: z.enum(["patient_portal", "staff", "walk_in"]),
  cancellation_reason: z.string().nullable(),
  patient: z.object({ id: z.string().uuid(), full_name: z.string(), normalized_phone: z.string() }),
});

export type AppointmentStatus = z.infer<typeof row>["status"];

export interface AdminAppointment {
  id: string;
  clinicDate: string;
  scheduledStart: string | null;
  durationMinutes: number;
  visitReason: VisitReason;
  visitReasonDetails: string | null;
  notes: string | null;
  status: AppointmentStatus;
  source: z.infer<typeof row>["source"];
  cancellationReason: string | null;
  patient: { id: string; fullName: string; phone: string };
}

export class AppointmentAdminService {
  constructor(private readonly db: SupabaseClient) {}

  async listForDate(date: string): Promise<AdminAppointment[]> {
    const { data, error } = await this.db
      .from("appointments")
      .select(
        "id, clinic_date, scheduled_start, duration_minutes, visit_reason, visit_reason_details, patient_notes, status, source, cancellation_reason, patient:patients!inner(id, full_name, normalized_phone)",
      )
      .eq("clinic_date", date)
      .order("scheduled_start", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw fromPostgrestError(error);
    return z
      .array(row)
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
        cancellationReason: a.cancellation_reason,
        patient: { id: a.patient.id, fullName: a.patient.full_name, phone: a.patient.normalized_phone },
      }));
  }

  /** Booked (non-cancelled) counts per date for the week strip. */
  async countsBetween(from: string, to: string): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from("appointments")
      .select("clinic_date")
      .gte("clinic_date", from)
      .lte("clinic_date", to)
      .in("status", ["scheduled", "checked_in", "completed"]);
    if (error) throw fromPostgrestError(error);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.clinic_date as string] = (counts[r.clinic_date as string] ?? 0) + 1;
    return counts;
  }

  async book(input: { patientId: string; slotStart: string; visitReason: VisitReason; visitReasonDetails?: string; notes?: string }) {
    const { data, error } = await this.db.rpc("staff_book_appointment", {
      p_patient_id: input.patientId,
      p_slot_start: input.slotStart,
      p_visit_reason: input.visitReason,
      p_visit_reason_details: input.visitReasonDetails ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw fromPostgrestError(error);
    return z.object({ appointment_id: z.string().uuid(), clinic_date: z.string(), scheduled_start: z.string() }).parse(data);
  }

  async reschedule(appointmentId: string, slotStart: string) {
    const { data, error } = await this.db.rpc("staff_reschedule_appointment", { p_appointment_id: appointmentId, p_slot_start: slotStart });
    if (error) throw fromPostgrestError(error);
    return z.object({ appointment_id: z.string().uuid(), clinic_date: z.string(), scheduled_start: z.string() }).parse(data);
  }

  async cancel(appointmentId: string, reason?: string) {
    const { error } = await this.db.rpc("staff_cancel_appointment", { p_appointment_id: appointmentId, p_reason: reason ?? null });
    if (error) throw fromPostgrestError(error);
  }

  async checkIn(appointmentId: string) {
    const { data, error } = await this.db.rpc("check_in_appointment", { p_appointment_id: appointmentId });
    if (error) throw fromPostgrestError(error);
    return z.object({ queue_entry_id: z.string().uuid(), status: z.string() }).passthrough().parse(data);
  }
}
