import { z } from "zod";
import { VISIT_REASONS } from "@/server/domain/queue/constants";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

export const bookAppointmentSchema = z
  .object({
    slotStart: z.string().datetime({ offset: true, message: "Choose a time" }),
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
  slotStart: z.string().datetime({ offset: true, message: "Choose a time" }),
});

export const staffBookSchema = z
  .object({
    patientId: z.string().uuid({ message: "Select a patient" }),
    slotStart: z.string().datetime({ offset: true, message: "Choose a time" }),
    visitReason: z.enum(VISIT_REASONS, { errorMap: () => ({ message: "Choose a visit reason" }) }),
    visitReasonDetails: z.string().trim().max(200).optional().transform((v) => v || undefined),
    notes: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  })
  .refine((v) => v.visitReason !== "other" || !!v.visitReasonDetails, {
    path: ["visitReasonDetails"],
    message: "Please describe the reason",
  });
export type StaffBookInput = z.input<typeof staffBookSchema>;
