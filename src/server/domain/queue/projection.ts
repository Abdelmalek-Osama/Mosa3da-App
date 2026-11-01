import { ELIGIBLE_STATUSES } from "./constants";
import type { QueueEntryState } from "./types";

const MINUTE = 60_000;

export interface ProjectionInput {
  entries: readonly QueueEntryState[];
  opensAt: Date;
  now: Date;
}

export interface ProjectionResult {
  /** expected start per entry id; null = not projected (absent / scheduled / terminal) */
  expectedStart: Map<string, Date | null>;
  /** eligible ids in consultation order */
  order: string[];
  /** when the last eligible patient is expected to finish */
  projectedEnd: Date;
}

const isEligible = (e: QueueEntryState) =>
  (ELIGIBLE_STATUSES as readonly string[]).includes(e.status) && e.missedTurnAt === null;

/** Deterministic order: Ready first, then position, created_at, id. */
export function compareEligible(a: QueueEntryState, b: QueueEntryState): number {
  const ready = Number(b.status === "ready") - Number(a.status === "ready");
  if (ready !== 0) return ready;
  const pos = (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
  if (pos !== 0) return pos;
  const created = a.createdAt.getTime() - b.createdAt.getTime();
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * ExpectedStart(1) = anchor
 * ExpectedStart(N) = ExpectedStart(N-1) + Duration(N-1)
 *
 * anchor = Current exists ? max(current.startedAt + current.duration, now)
 *                         : max(opensAt, now)
 *
 * Mirrors public._recalculate_queue (SQL is authoritative; this copy powers unit
 * tests, previews and the DB parity test).
 */
export function projectQueue({ entries, opensAt, now }: ProjectionInput): ProjectionResult {
  const expectedStart = new Map<string, Date | null>();
  const current = entries.find((e) => e.status === "current");

  let cursor: number;
  if (current?.startedAt) {
    expectedStart.set(current.id, current.startedAt);
    cursor = Math.max(current.startedAt.getTime() + current.estimatedDurationMinutes * MINUTE, now.getTime());
  } else {
    cursor = Math.max(opensAt.getTime(), now.getTime());
  }

  const eligible = entries.filter(isEligible).sort(compareEligible);
  for (const entry of eligible) {
    expectedStart.set(entry.id, new Date(cursor));
    cursor += entry.estimatedDurationMinutes * MINUTE;
  }

  for (const entry of entries) {
    if (!expectedStart.has(entry.id)) expectedStart.set(entry.id, null);
  }

  return { expectedStart, order: eligible.map((e) => e.id), projectedEnd: new Date(cursor) };
}

/** Minutes until the expected start, never negative. */
export function minutesUntil(expected: Date | null, now: Date): number | null {
  if (!expected) return null;
  return Math.max(0, Math.ceil((expected.getTime() - now.getTime()) / MINUTE));
}
