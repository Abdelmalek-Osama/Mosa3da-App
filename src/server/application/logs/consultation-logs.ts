import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPostgrestError } from "@/lib/errors/postgres";
import { VISIT_REASONS, VISIT_REASON_LABELS, type VisitReason } from "@/server/domain/queue/constants";

export const LOG_RANGES = ["today", "week", "month", "custom"] as const;
export type LogRange = (typeof LOG_RANGES)[number];

export interface LogFilter {
  range: LogRange;
  /** Inclusive clinic dates (YYYY-MM-DD). */
  from: string;
  to: string;
  q: string;
}

/** One finished consultation: booked time, real time in the room, and the gap. */
export interface ConsultationLog {
  id: string;
  clinicDate: string;
  /** Booked time; null for walk-ins. */
  scheduledStart: string | null;
  arrivedAt: string | null;
  startedAt: string;
  finishedAt: string;
  patientName: string;
  patientNameEn: string | null;
  visitReason: VisitReason;
  visitReasonDetails: string | null;
  isWalkIn: boolean;
  /** The doctor's configured duration for the reason when the visit was booked. */
  expectedMinutes: number;
  /** Start Consultation → End Consultation, in whole minutes. */
  actualMinutes: number;
  /** actual − expected: positive = over, negative = under. */
  varianceMinutes: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 20_000;
const PAGE = 1000;

function addDays(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/**
 * Resolves ?range=&from=&to=&q= into inclusive dates. The clinic week starts
 * on Saturday; "month" is the current calendar month up to today.
 */
export function resolveLogFilter(params: { range?: string; from?: string; to?: string; q?: string }, today: string): LogFilter {
  const range: LogRange = (LOG_RANGES as readonly string[]).includes(params.range ?? "") ? (params.range as LogRange) : "week";
  const q = (params.q ?? "").trim().slice(0, 100);
  if (range === "today") return { range, from: today, to: today, q };
  if (range === "week") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { range, from: addDays(today, -((dow + 1) % 7)), to: today, q };
  }
  if (range === "month") return { range, from: `${today.slice(0, 8)}01`, to: today, q };
  let from = DATE.test(params.from ?? "") ? params.from! : addDays(today, -29);
  let to = DATE.test(params.to ?? "") ? params.to! : today;
  if (from > to) [from, to] = [to, from];
  return { range, from, to, q };
}

const rowSchema = z.object({
  id: z.string().uuid(),
  clinic_date: z.string(),
  visit_reason: z.enum(VISIT_REASONS),
  estimated_duration_minutes: z.number().int(),
  arrived_at: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string(),
  patient: z.object({ full_name: z.string(), full_name_en: z.string().nullable().optional() }).nullable(),
  appointment: z
    .object({
      scheduled_start: z.string().nullable(),
      duration_minutes: z.number().int(),
      visit_reason_details: z.string().nullable(),
      source: z.string(),
    })
    .nullable(),
});

/** Finished consultations between two clinic dates, newest first. */
export async function listConsultationLogs(db: SupabaseClient, from: string, to: string): Promise<ConsultationLog[]> {
  const rows: z.infer<typeof rowSchema>[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await db
      .from("queue_entries")
      .select(
        "id, clinic_date, visit_reason, estimated_duration_minutes, arrived_at, started_at, finished_at, patient:patients(full_name, full_name_en), appointment:appointments(scheduled_start, duration_minutes, visit_reason_details, source)",
      )
      .eq("status", "finished")
      .gte("clinic_date", from)
      .lte("clinic_date", to)
      .order("clinic_date", { ascending: false })
      .order("started_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw fromPostgrestError(error);
    const page = z.array(rowSchema).parse(data);
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  return rows.map((r) => {
    const expected = r.appointment?.duration_minutes ?? r.estimated_duration_minutes;
    const actual = Math.max(0, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 60_000));
    return {
      id: r.id,
      clinicDate: r.clinic_date,
      scheduledStart: r.appointment?.scheduled_start ?? null,
      arrivedAt: r.arrived_at,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      patientName: r.patient?.full_name ?? "—",
      patientNameEn: r.patient?.full_name_en ?? null,
      visitReason: r.visit_reason,
      visitReasonDetails: r.appointment?.visit_reason_details ?? null,
      isWalkIn: !r.appointment || r.appointment.source === "walk_in" || !r.appointment.scheduled_start,
      expectedMinutes: expected,
      actualMinutes: actual,
      varianceMinutes: actual - expected,
    };
  });
}

/** Reason as shown in lists: doctor-added reasons are stored as 'other' + their name. */
export function logReasonLabel(log: Pick<ConsultationLog, "visitReason" | "visitReasonDetails">, locale: "ar" | "en"): string {
  if (log.visitReason === "other" && log.visitReasonDetails) return log.visitReasonDetails;
  return VISIT_REASON_LABELS[log.visitReason][locale];
}

/** Search by patient name (Arabic or English) or visit reason (either language). */
export function filterLogs(logs: ConsultationLog[], q: string, labelOf?: (l: ConsultationLog) => string): ConsultationLog[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return logs;
  return logs.filter((l) =>
    [
      l.patientName,
      l.patientNameEn,
      l.visitReasonDetails,
      labelOf?.(l),
      VISIT_REASON_LABELS[l.visitReason].ar,
      VISIT_REASON_LABELS[l.visitReason].en,
    ]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(needle)),
  );
}

export function summarizeLogs(logs: ConsultationLog[]) {
  if (!logs.length) return { count: 0, avgActual: 0, avgExpected: 0, overCount: 0, underCount: 0, onTimeCount: 0 };
  const sum = (f: (l: ConsultationLog) => number) => logs.reduce((a, l) => a + f(l), 0);
  return {
    count: logs.length,
    avgActual: Math.round(sum((l) => l.actualMinutes) / logs.length),
    avgExpected: Math.round(sum((l) => l.expectedMinutes) / logs.length),
    overCount: logs.filter((l) => l.varianceMinutes > 0).length,
    underCount: logs.filter((l) => l.varianceMinutes < 0).length,
    onTimeCount: logs.filter((l) => l.varianceMinutes === 0).length,
  };
}
