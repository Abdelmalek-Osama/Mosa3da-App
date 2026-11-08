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

const bookedRow = z.object({
  appointment_id: z.string().uuid(),
  clinic_date: z.string(),
  scheduled_start: z.string(),
  scheduled_end: z.string(),
});

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

  /** Day-only staff booking: the database assigns the earliest free time (FIFO). */
  async book(input: { patientId: string; date: string; visitReason: VisitReason; visitReasonDetails?: string; notes?: string }) {
    const { data, error } = await this.db.rpc("staff_book_appointment_on_date", {
      p_patient_id: input.patientId,
      p_date: input.date,
      p_visit_reason: input.visitReason,
      p_visit_reason_details: input.visitReasonDetails ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw fromPostgrestError(error);
    return bookedRow.parse(data);
  }

  /** Who occupies time on a date: booked appointments and walk-ins in the queue (staff RLS). */
  async occupants(date: string): Promise<{ start: number; end: number; name: string }[]> {
    const [appts, queue] = await Promise.all([
      this.db
        .from("appointments")
        .select("scheduled_start, scheduled_end, patient:patients!inner(full_name)")
        .eq("clinic_date", date)
        .in("status", ["scheduled", "checked_in"])
        .not("scheduled_start", "is", null),
      this.db
        .from("queue_entries")
        .select("expected_start_at, started_at, estimated_duration_minutes, appointment:appointments(scheduled_start), patient:patients!inner(full_name)")
        .eq("clinic_date", date)
        .in("status", ["arrived", "ready", "current", "late"]),
    ]);
    if (appts.error) throw fromPostgrestError(appts.error);
    if (queue.error) throw fromPostgrestError(queue.error);
    const name = (p: unknown) => (Array.isArray(p) ? p[0] : p) as { full_name: string } | null;
    const out: { start: number; end: number; name: string }[] = [];
    for (const a of appts.data ?? []) {
      out.push({ start: Date.parse(a.scheduled_start as string), end: Date.parse(a.scheduled_end as string), name: name(a.patient)?.full_name ?? "" });
    }
    for (const q of queue.data ?? []) {
      const booked = (Array.isArray(q.appointment) ? q.appointment[0] : q.appointment) as { scheduled_start: string | null } | null;
      const at = (q.started_at ?? q.expected_start_at) as string | null;
      if (booked?.scheduled_start || !at) continue; // booked visits are covered above
      const start = Date.parse(at);
      out.push({ start, end: start + (q.estimated_duration_minutes as number) * 60_000, name: name(q.patient)?.full_name ?? "" });
    }
    return out;
  }

  /** Moves a booking to a day; the earliest free time there is assigned. */
  async reschedule(appointmentId: string, date: string) {
    const { data, error } = await this.db.rpc("staff_reschedule_on_date", { p_appointment_id: appointmentId, p_date: date });
    if (error) throw fromPostgrestError(error);
    return bookedRow.parse(data);
  }

  /** Name and phone for the WhatsApp confirmation. */
  async contact(patientId: string): Promise<{ fullName: string; phone: string } | null> {
    const { data } = await this.db.from("patients").select("full_name, normalized_phone").eq("id", patientId).maybeSingle();
    return data ? { fullName: data.full_name as string, phone: data.normalized_phone as string } : null;
  }

  async patientOf(appointmentId: string): Promise<string | null> {
    const { data } = await this.db.from("appointments").select("patient_id").eq("id", appointmentId).maybeSingle();
    return (data?.patient_id as string | undefined) ?? null;
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
