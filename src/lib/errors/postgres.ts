import { AppError, type AppErrorCode } from "./app-error";

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const SQLSTATE_MAP: Record<string, AppErrorCode> = {
  MQ403: "FORBIDDEN",
  MQ404: "NOT_FOUND",
  MQ409: "CONFLICT",
  MQ412: "STALE",
  MQ422: "VALIDATION",
  "42501": "FORBIDDEN", // insufficient_privilege / RLS
  "23505": "CONFLICT", // unique_violation
  "23P01": "CONFLICT", // exclusion_violation
  "23514": "VALIDATION", // check_violation
  "23503": "CONFLICT", // foreign_key_violation
  "22023": "VALIDATION", // invalid_parameter_value
  PGRST116: "NOT_FOUND",
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  queue_entries_single_current: "Another consultation is already in progress.",
  queue_entries_single_ready: "Another patient is already marked as next.",
  queue_entries_patient_active_key: "This patient is already in today's queue.",
  patients_normalized_phone_key: "A patient with this phone number already exists.",
  appointments_no_slot_overlap: "This time slot is no longer available.",
  appointments_one_active_per_patient_day: "This patient already has an appointment on this day.",
  clinic_services_name_ar_key: "A service with this name already exists.",
};

/** Converts a Supabase/PostgREST error into a typed AppError with a safe message. */
export function fromPostgrestError(error: PostgrestLikeError, fallback = "Something went wrong"): AppError {
  const code = (error.code && SQLSTATE_MAP[error.code]) || "INTERNAL";
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  const constraint = Object.keys(CONSTRAINT_MESSAGES).find((name) => text.includes(name));

  let message: string;
  if (constraint) message = CONSTRAINT_MESSAGES[constraint]!;
  else if (error.code?.startsWith("MQ") && error.message) message = error.message;
  else if (code === "FORBIDDEN") message = "You are not allowed to perform this action.";
  else if (code === "INTERNAL") message = fallback;
  else message = error.message ?? fallback;

  return new AppError(code, message, { cause: error });
}
