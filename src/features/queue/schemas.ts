import { z } from "zod";
import { arabicTripleNameSchema, optionalEnglishNameSchema } from "@/lib/names";
import { QUEUE_ACTIONS, QUEUE_STATUSES, VISIT_REASONS } from "@/server/domain/queue/constants";

const uuid = z.string().uuid();
const version = z.coerce.number().int().positive().optional();
const duration = z.coerce
  .number({ invalid_type_error: "Enter a duration in minutes" })
  .int()
  .min(5, "Minimum 5 minutes")
  .max(180, "Maximum 180 minutes");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maximum ${max} characters`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const walkInSchema = z
  .object({
    mode: z.enum(["existing", "new"]),
    patientId: uuid.optional(),
    fullName: z.string().trim().max(120).optional(),
    fullNameEn: optionalEnglishNameSchema,
    phone: z.string().trim().max(32).optional(),
    visitReason: z.enum(VISIT_REASONS),
    visitReasonDetails: optionalText(200),
    durationMinutes: duration.default(20),
    notes: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "existing" && !value.patientId) {
      ctx.addIssue({ code: "custom", path: ["patientId"], message: "Select a patient" });
    }
    if (value.mode === "new") {
      const name = arabicTripleNameSchema.safeParse(value.fullName ?? "");
      if (!name.success) {
        ctx.addIssue({ code: "custom", path: ["fullName"], message: name.error.issues[0]?.message ?? "Enter the full name in Arabic" });
      }
      if (!value.phone || value.phone.replace(/\D/g, "").length < 8) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number" });
      }
    }
    if (value.visitReason === "other" && !value.visitReasonDetails) {
      ctx.addIssue({ code: "custom", path: ["visitReasonDetails"], message: "Describe the visit reason" });
    }
  });
export type WalkInInput = z.input<typeof walkInSchema>;

export const transitionSchema = z.object({
  entryId: uuid,
  action: z.enum(QUEUE_ACTIONS),
  expectedVersion: version,
  /** Status the screen showed; lets the server retry a stale version safely. */
  expectedStatus: z.enum(QUEUE_STATUSES).optional(),
  reason: optionalText(500),
});
export type TransitionInput = z.input<typeof transitionSchema>;

export const reorderSchema = z.object({
  entryId: uuid,
  newIndex: z.coerce.number().int().min(1),
  expectedVersion: version,
});
export type ReorderInput = z.input<typeof reorderSchema>;

export const durationSchema = z.object({
  entryId: uuid,
  durationMinutes: duration,
  expectedVersion: version,
});
export type DurationInput = z.input<typeof durationSchema>;

export const patientSearchSchema = z.object({
  query: z.string().trim().min(2, "Type at least 2 characters").max(60),
});

// ---- RPC response contracts ---------------------------------------------------
export const walkInResultSchema = z.object({
  queue_entry_id: uuid,
  patient_id: uuid,
  patient_created: z.boolean(),
  queue_number: z.number().int().nullable(),
  status: z.string(),
  expected_start_at: z.string().nullable(),
});

export const transitionResultSchema = z.object({
  queue_entry_id: uuid,
  status: z.string(),
  version: z.number().int(),
  expected_start_at: z.string().nullable(),
  late_transitions: z.number().int(),
});

export const myQueueStatusSchema = z.union([
  z.object({ in_queue: z.literal(false) }),
  z.object({
    in_queue: z.literal(true),
    queue_number: z.number().int().nullable(),
    status: z.enum(["scheduled", "arrived", "ready", "current", "late", "finished", "cancelled"]),
    missed_turn: z.boolean(),
    patients_ahead: z.number().int().nullable(),
    expected_start_at: z.string().nullable(),
    estimated_wait_minutes: z.number().int().nullable(),
    visit_reason: z.enum(VISIT_REASONS),
  }),
]);
export type MyQueueStatus = z.infer<typeof myQueueStatusSchema>;

/** name_ar / name_en are full names (lobby P2-14); display_name is kept for older payloads. */
const displayPerson = z.object({
  queue_number: z.number().int().nullable(),
  display_name: z.string(),
  name_ar: z.string().optional(),
  name_en: z.string().nullable().optional(),
});

export const displayBoardSchema = z.object({
  clinic: z.object({
    name: z.string(),
    name_ar: z.string(),
    doctor: z.string(),
    timezone: z.string(),
    bilingual: z.boolean().default(false),
  }),
  session_open: z.boolean(),
  current: displayPerson.extend({ started_at: z.string().nullable() }).nullable(),
  next: displayPerson.extend({ expected_start_at: z.string().nullable() }).nullable(),
  waiting: z.array(
    displayPerson.extend({ expected_start_at: z.string().nullable(), is_late: z.boolean() }),
  ),
  /** Today's online bookings that have not checked in yet (P2-15). */
  booked: z
    .array(z.object({ name_ar: z.string(), name_en: z.string().nullable(), slot_start: z.string(), slot_end: z.string().nullable() }))
    .default([]),
  generated_at: z.string(),
});
export type DisplayBoard = z.infer<typeof displayBoardSchema>;
