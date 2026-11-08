import { z } from "zod";
import { VISIT_REASONS } from "@/server/domain/queue/constants";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

export const bookAppointmentSchema = z
  .object({
    /** Visitors pick a day only; the clinic assigns the earliest free time (FIFO). */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day"),
    visitReason: z.enum(VISIT_REASONS, { errorMap: () => ({ message: "Choose a reason for your visit" }) }),
    visitReasonDetails: z.string().trim().max(200).optional().transform((v) => v || undefined),
    notes: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  })
  .refine((v) => v.visitReason !== "other" || !!v.visitReasonDetails, {
    path: ["visitReasonDetails"],
    message: "Please describe the reason",
  });
export type BookAppointmentInput = z.input<typeof bookAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().transform((v) => v || undefined),
});

export const rescheduleSchema = z.object({
  appointmentId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day"),
});

export const staffBookSchema = z
  .object({
    patientId: z.string().uuid({ message: "Select a patient" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day"),
    visitReason: z.enum(VISIT_REASONS, { errorMap: () => ({ message: "Choose a visit reason" }) }),
    visitReasonDetails: z.string().trim().max(200).optional().transform((v) => v || undefined),
    notes: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  })
  .refine((v) => v.visitReason !== "other" || !!v.visitReasonDetails, {
    path: ["visitReasonDetails"],
    message: "Please describe the reason",
  });
export type StaffBookInput = z.input<typeof staffBookSchema>;
