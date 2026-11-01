import { DEFAULT_LATE_POLICY_CONSULTATIONS } from "./constants";
import type { QueueEntryState } from "./types";

/**
 * Late Patient Policy (mirrors public._apply_late_policy):
 *  1. Staff mark the Ready patient absent → missedTurnBaseline = finishedCount at that moment.
 *     The consultation that caused the miss already finished, so it is NOT counted.
 *  2. Each later finished consultation increments finishedCount.
 *  3. When finishedCount >= baseline + N (default 2) and the patient is still absent,
 *     they become Late and move to the end of the eligible queue.
 *  4. If they return earlier, staff mark them arrived and the policy is cancelled.
 */
export function consultationsSinceMissedTurn(entry: QueueEntryState, finishedCount: number): number | null {
  if (entry.missedTurnAt === null || entry.missedTurnBaseline === null) return null;
  return Math.max(0, finishedCount - entry.missedTurnBaseline);
}

export function shouldBecomeLate(
  entry: QueueEntryState,
  finishedCount: number,
  required = DEFAULT_LATE_POLICY_CONSULTATIONS,
): boolean {
  if (entry.status !== "arrived") return false;
  const since = consultationsSinceMissedTurn(entry, finishedCount);
  return since !== null && since >= required;
}

export function findLateTransitions(
  entries: readonly QueueEntryState[],
  finishedCount: number,
  required = DEFAULT_LATE_POLICY_CONSULTATIONS,
): string[] {
  return entries
    .filter((e) => shouldBecomeLate(e, finishedCount, required))
    .sort((a, b) => a.missedTurnAt!.getTime() - b.missedTurnAt!.getTime() || (a.id < b.id ? -1 : 1))
    .map((e) => e.id);
}

/** Remaining consultations before the patient is moved to Late (for UI hints). */
export function consultationsUntilLate(
  entry: QueueEntryState,
  finishedCount: number,
  required = DEFAULT_LATE_POLICY_CONSULTATIONS,
): number | null {
  const since = consultationsSinceMissedTurn(entry, finishedCount);
  return since === null ? null : Math.max(0, required - since);
}
