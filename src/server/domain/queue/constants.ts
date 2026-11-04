export const QUEUE_STATUSES = [
  "scheduled",
  "arrived",
  "ready",
  "current",
  "late",
  "finished",
  "cancelled",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** Statuses that take part in the waiting-time projection. */
export const ELIGIBLE_STATUSES = ["ready", "arrived", "late"] as const satisfies readonly QueueStatus[];
export const TERMINAL_STATUSES = ["finished", "cancelled"] as const satisfies readonly QueueStatus[];

export const QUEUE_ACTIONS = [
  "mark_arrived",
  "mark_ready",
  "mark_absent",
  "start_consultation",
  "finish_consultation",
  "mark_late",
  "cancel",
] as const;
export type QueueAction = (typeof QUEUE_ACTIONS)[number];

export const VISIT_REASONS = [
  "pregnancy_confirmation",
  "routine_antenatal",
  "pregnancy_follow_up",
  "ultrasound",
  "ultrasound_4d",
  "postpartum",
  "gynecology",
  "other",
] as const;
export type VisitReason = (typeof VISIT_REASONS)[number];

export const VISIT_REASON_LABELS: Record<VisitReason, { en: string; ar: string }> = {
  pregnancy_confirmation: { en: "Pregnancy confirmation", ar: "تأكيد الحمل" },
  routine_antenatal: { en: "Routine antenatal consultation", ar: "متابعة حمل دورية" },
  pregnancy_follow_up: { en: "Pregnancy follow-up", ar: "متابعة الحمل" },
  ultrasound: { en: "Ultrasound", ar: "فحص بالموجات فوق الصوتية" },
  ultrasound_4d: { en: "4D ultrasound", ar: "فحص رباعي الأبعاد" },
  postpartum: { en: "Postpartum consultation", ar: "متابعة ما بعد الولادة" },
  gynecology: { en: "Gynecology consultation", ar: "استشارة نسائية" },
  other: { en: "Other", ar: "أخرى" },
};

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  ready: "Ready",
  current: "Consulting",
  late: "Late",
  finished: "Finished",
  cancelled: "Cancelled",
};

/** Patient-facing wording (no queue jargon). */
export const QUEUE_STATUS_PATIENT_LABELS: Record<QueueStatus, string> = {
  scheduled: "Booked — please check in at reception when you arrive",
  arrived: "You are checked in and waiting",
  ready: "You are next — please stay close to the consultation room",
  current: "You are with the doctor now",
  late: "You missed your turn — you have been moved to the end of the queue",
  finished: "Your visit is complete",
  cancelled: "This visit was cancelled",
};

export const DEFAULT_CONSULTATION_MINUTES = 20;
export const DEFAULT_LATE_POLICY_CONSULTATIONS = 2;

/** "Other" (and doctor-added reasons, booked as other) show their own text. */
export function visitReasonText(reason: VisitReason, details: string | null | undefined, tReason: (r: VisitReason) => string): string {
  return reason === "other" && details?.trim() ? details.trim() : tReason(reason);
}