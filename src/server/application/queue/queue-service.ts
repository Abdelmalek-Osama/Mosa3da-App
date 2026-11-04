import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { fromPostgrestError } from "@/lib/errors/postgres";
import {
  displayBoardSchema,
  myQueueStatusSchema,
  transitionResultSchema,
  walkInResultSchema,
  type DisplayBoard,
  type MyQueueStatus,
} from "@/features/queue/schemas";
import {
  QUEUE_STATUSES,
  VISIT_REASONS,
  type QueueAction,
  type VisitReason,
} from "@/server/domain/queue/constants";
import { projectQueue } from "@/server/domain/queue/projection";
import type { QueueBoard, QueueEntryView } from "@/server/domain/queue/types";

const entryRowSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  session_id: z.string().uuid(),
  clinic_date: z.string(),
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable(),
  queue_number: z.number().int().nullable(),
  position: z.number().int().nullable(),
  visit_reason: z.enum(VISIT_REASONS),
  estimated_duration_minutes: z.number().int(),
  expected_start_at: z.string().nullable(),
  status: z.enum(QUEUE_STATUSES),
  missed_turn_at: z.string().nullable(),
  missed_turn_baseline: z.number().int().nullable(),
  arrived_at: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  staff_notes: z.string().nullable(),
  created_at: z.string(),
  patient: z.object({ full_name: z.string(), normalized_phone: z.string() }),
  appointment: z.object({ visit_reason_details: z.string().nullable() }).nullable().optional(),
});

const sessionRowSchema = z.object({
  id: z.string().uuid(),
  clinic_date: z.string(),
  opens_at: z.string(),
  closes_at: z.string(),
  status: z.enum(["planned", "open", "closed"]),
  finished_consultations_count: z.number().int(),
});

const ENTRY_SELECT = `
  id, version, session_id, clinic_date, patient_id, appointment_id, queue_number, position,
  visit_reason, estimated_duration_minutes, expected_start_at, status, missed_turn_at, missed_turn_baseline,
  arrived_at, started_at, finished_at, staff_notes, created_at,
  patient:patients!inner(full_name, normalized_phone),
  appointment:appointments(visit_reason_details)
`;

function toView(row: z.infer<typeof entryRowSchema>): QueueEntryView {
  return {
    id: row.id,
    version: row.version,
    sessionId: row.session_id,
    clinicDate: row.clinic_date,
    patientId: row.patient_id,
    patientName: row.patient.full_name,
    patientPhone: row.patient.normalized_phone,
    appointmentId: row.appointment_id,
    queueNumber: row.queue_number,
    position: row.position,
    visitReason: row.visit_reason,
    visitReasonDetails: row.appointment?.visit_reason_details ?? null,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    expectedStartAt: row.expected_start_at,
    status: row.status,
    isAbsent: row.missed_turn_at !== null,
    missedTurnBaseline: row.missed_turn_baseline,
    arrivedAt: row.arrived_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    staffNotes: row.staff_notes,
  };
}

const byExpected = (a: QueueEntryView, b: QueueEntryView) =>
  (a.expectedStartAt ?? "9999").localeCompare(b.expectedStartAt ?? "9999") ||
  (a.position ?? 1e9) - (b.position ?? 1e9);

export interface RegisterWalkInParams {
  patientId?: string;
  fullName?: string;
  phone?: string;
  visitReason: VisitReason;
  visitReasonDetails?: string;
  /** Omitted: the database falls back to the clinic default duration. */
  durationMinutes?: number;
  notes?: string;
}

/**
 * Application layer for the queue. All mutations are single RPC calls so the
 * database executes them atomically under a session row lock.
 */
export class QueueService {
  constructor(private readonly db: SupabaseClient) {}

  private async rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw fromPostgrestError(error);
    return schema.parse(data);
  }

  openSession(date?: string): Promise<string> {
    return this.rpc("open_clinic_session", { p_date: date ?? null }, z.string().uuid());
  }

  registerWalkIn(params: RegisterWalkInParams) {
    return this.rpc(
      "register_walk_in",
      {
        p_full_name: params.fullName ?? null,
        p_phone: params.phone ?? null,
        p_visit_reason: params.visitReason,
        p_visit_reason_details: params.visitReasonDetails ?? null,
        p_duration_minutes: params.durationMinutes ?? null,
        p_notes: params.notes ?? null,
        p_patient_id: params.patientId ?? null,
      },
      walkInResultSchema,
    );
  }

  transition(entryId: string, action: QueueAction, expectedVersion?: number, reason?: string) {
    return this.rpc(
      "queue_transition",
      {
        p_entry_id: entryId,
        p_action: action,
        p_expected_version: expectedVersion ?? null,
        p_reason: reason ?? null,
      },
      transitionResultSchema,
    );
  }

  /** Current status and lock version of one entry (staff RLS). */
  async getEntryState(entryId: string): Promise<{ status: (typeof QUEUE_STATUSES)[number]; version: number } | null> {
    const { data, error } = await this.db.from("queue_entries").select("status, version").eq("id", entryId).maybeSingle();
    if (error) throw fromPostgrestError(error);
    return data ? z.object({ status: z.enum(QUEUE_STATUSES), version: z.number().int() }).parse(data) : null;
  }

  reorder(entryId: string, newIndex: number, expectedVersion?: number) {
    return this.rpc(
      "reorder_queue_entry",
      { p_entry_id: entryId, p_new_index: newIndex, p_expected_version: expectedVersion ?? null },
      z.object({ queue_entry_id: z.string().uuid(), position: z.number().int(), version: z.number().int() }).passthrough(),
    );
  }

  updateDuration(entryId: string, durationMinutes: number, expectedVersion?: number) {
    return this.rpc(
      "update_queue_entry_duration",
      { p_entry_id: entryId, p_duration_minutes: durationMinutes, p_expected_version: expectedVersion ?? null },
      z.object({ queue_entry_id: z.string().uuid(), version: z.number().int() }).passthrough(),
    );
  }

  /** Staff board for a clinic date (defaults to clinic today). Opens/syncs the session first. */
  async getBoard(date?: string): Promise<QueueBoard> {
    const sessionId = await this.openSession(date);

    const [sessionRes, entriesRes] = await Promise.all([
      this.db
        .from("clinic_sessions")
        .select("id, clinic_date, opens_at, closes_at, status, finished_consultations_count")
        .eq("id", sessionId)
        .single(),
      this.db.from("queue_entries").select(ENTRY_SELECT).eq("session_id", sessionId).order("position", { nullsFirst: false }),
    ]);

    if (sessionRes.error) throw fromPostgrestError(sessionRes.error);
    if (entriesRes.error) throw fromPostgrestError(entriesRes.error);

    const session = sessionRowSchema.parse(sessionRes.data);
    const rows = z.array(entryRowSchema).parse(entriesRes.data);
    // Stored expected times only move when someone acts on the queue. Re-project
    // at read time (same formula as _recalculate_queue) so ETAs never sit in the past.
    const live = projectQueue({
      entries: rows.map((r) => ({
        id: r.id,
        status: r.status,
        position: r.position,
        createdAt: new Date(r.created_at),
        estimatedDurationMinutes: r.estimated_duration_minutes,
        startedAt: r.started_at ? new Date(r.started_at) : null,
        missedTurnAt: r.missed_turn_at ? new Date(r.missed_turn_at) : null,
        missedTurnBaseline: r.missed_turn_baseline,
      })),
      opensAt: new Date(session.opens_at),
      now: new Date(),
    });
    const entries = rows.map((r) => {
      const view = toView(r);
      const projected = live.order.includes(r.id) ? live.expectedStart.get(r.id) : undefined;
      return projected ? { ...view, expectedStartAt: projected.toISOString() } : view;
    });

    const current = entries.find((e) => e.status === "current") ?? null;
    const ready = entries.find((e) => e.status === "ready") ?? null;
    const waiting = entries
      .filter((e) => (e.status === "arrived" || e.status === "late") && !e.isAbsent)
      .sort(byExpected);
    const absent = entries.filter((e) => e.isAbsent && e.status !== "finished" && e.status !== "cancelled");
    const scheduled = entries.filter((e) => e.status === "scheduled").sort(byExpected);
    const done = entries
      .filter((e) => e.status === "finished" || e.status === "cancelled")
      .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));

    return {
      session: {
        id: session.id,
        clinicDate: session.clinic_date,
        opensAt: session.opens_at,
        closesAt: session.closes_at,
        status: session.status,
        finishedConsultationsCount: session.finished_consultations_count,
      },
      current,
      ready,
      waiting,
      scheduled,
      absent,
      done,
      stats: {
        waiting: waiting.length + (ready ? 1 : 0) + absent.length,
        late: entries.filter((e) => e.status === "late").length,
        finished: entries.filter((e) => e.status === "finished").length,
        cancelled: entries.filter((e) => e.status === "cancelled").length,
        scheduled: scheduled.length,
      },
    };
  }

  getMyStatus(): Promise<MyQueueStatus> {
    return this.rpc("get_my_queue_status", {}, myQueueStatusSchema);
  }

  getDisplayBoard(): Promise<DisplayBoard> {
    return this.rpc("get_display_board", {}, displayBoardSchema);
  }

  async searchPatients(query: string) {
    const term = query.replace(/[%_,()]/g, " ").trim();
    const digits = term.replace(/\D/g, "");
    const filters = [`full_name.ilike.%${term}%`];
    if (digits.length >= 3) filters.push(`normalized_phone.ilike.%${digits.replace(/^0/, "")}%`);

    const { data, error } = await this.db
      .from("patients")
      .select("id, full_name, normalized_phone")
      .eq("is_active", true)
      .or(filters.join(","))
      .order("full_name")
      .limit(10);
    if (error) throw fromPostgrestError(error);

    return z
      .array(z.object({ id: z.string().uuid(), full_name: z.string(), normalized_phone: z.string() }))
      .parse(data)
      .map((p) => ({ id: p.id, fullName: p.full_name, phone: p.normalized_phone }));
  }
}

export function assertFound<T>(value: T | null | undefined, message = "Not found"): T {
  if (value === null || value === undefined) throw new AppError("NOT_FOUND", message);
  return value;
}
