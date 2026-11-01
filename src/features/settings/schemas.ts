import { z } from "zod";

const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ invalid_type_error: `Enter ${label}` })
    .int(`Whole minutes only`)
    .min(min, `Minimum ${min}`)
    .max(max, `Maximum ${max}`);

export const clinicSettingsSchema = z.object({
  clinicName: z.string().trim().min(2, "Enter the clinic name").max(120),
  clinicNameAr: z.string().trim().min(2, "Enter the Arabic name").max(120),
  doctorName: z.string().trim().min(2, "Enter the doctor's display name").max(120),
  defaultConsultationMinutes: int(5, 180, "a duration"),
  whatsappThresholdMinutes: int(5, 240, "a threshold"),
  latePolicyConsultations: int(1, 10, "a number"),
  bookingHorizonDays: int(1, 365, "a number of days"),
  cancellationCutoffMinutes: int(0, 10080, "a number of minutes"),
  slotIntervalMinutes: int(5, 120, "an interval"),
});
export type ClinicSettingsInput = { [K in keyof z.output<typeof clinicSettingsSchema>]: string | number };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const workingDaysSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), start: time, end: time }))
  .max(28)
  .superRefine((periods, ctx) => {
    periods.forEach((p, i) => {
      if (p.end <= p.start) ctx.addIssue({ code: "custom", path: [i], message: "End time must be after start time" });
    });
    for (let d = 0; d < 7; d++) {
      const day = periods.filter((p) => p.weekday === d).sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < day.length; i++) {
        if (day[i]!.start < day[i - 1]!.end) {
          ctx.addIssue({ code: "custom", path: [periods.indexOf(day[i]!)], message: "Overlaps with another period on this day" });
        }
      }
    }
  });
export type WorkingDaysInput = z.input<typeof workingDaysSchema>;
