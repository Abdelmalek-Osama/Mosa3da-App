import type { QueueAction, QueueStatus } from "./constants";

export interface TransitionContext {
  status: QueueStatus;
  isAbsent: boolean;
  hasCurrent: boolean;
}

/**
 * Mirrors the guards in public.queue_transition. Used by the UI to decide which
 * buttons to render; the database re-checks every rule.
 */
export function allowedActions({ status, isAbsent, hasCurrent }: TransitionContext): QueueAction[] {
  if (status === "finished" || status === "cancelled") return [];

  const actions: QueueAction[] = [];
  const waitingAndPresent = (status === "arrived" || status === "late") && !isAbsent;

  if (status === "scheduled" || isAbsent) actions.push("mark_arrived");
  if (waitingAndPresent) actions.push("mark_ready");
  if (status === "ready") actions.push("mark_absent");
  if (!hasCurrent && (status === "ready" || waitingAndPresent)) actions.push("start_consultation");
  if (status === "current") actions.push("finish_consultation");
  if (status === "arrived" || status === "ready") actions.push("mark_late");
  if (status !== "current") actions.push("cancel");

  return actions;
}

/** Actions that must be confirmed in a dialog before running. */
export const CONFIRM_ACTIONS: ReadonlySet<QueueAction> = new Set([
  "start_consultation",
  "finish_consultation",
  "mark_absent",
  "mark_late",
  "cancel",
]);

export const QUEUE_ACTION_LABELS: Record<QueueAction, string> = {
  mark_arrived: "Mark arrived",
  mark_ready: "Mark ready",
  mark_absent: "Mark absent",
  start_consultation: "Start consultation",
  finish_consultation: "Finish consultation",
  mark_late: "Mark late",
  cancel: "Cancel visit",
};
