import { z } from "zod";
import { normalizePhone } from "@/lib/auth/patient-identity";
import { arabicTripleNameSchema, optionalEnglishNameSchema } from "@/lib/names";

const optional = (s: z.ZodType<string, z.ZodTypeDef, string>) =>
  z
    .union([s, z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined));

export const staffPatientSchema = z.object({
  fullName: arabicTripleNameSchema,
  fullNameEn: optionalEnglishNameSchema,
  phone: z
    .string()
    .trim()
    .min(1, "Enter a mobile number")
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Enter a valid mobile number, e.g. 010 1234 5678" });
        return z.NEVER;
      }
      return n;
    }),
  email: optional(z.string().trim().toLowerCase().email("Enter a valid email")),
  preferredLocale: z.enum(["ar", "en"]).default("ar"),
  dateOfBirth: optional(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker")
      .refine((d) => d >= "1900-01-01" && d <= new Date().toISOString().slice(0, 10), "Enter a valid date of birth"),
  ),
});
export type StaffPatientInput = z.input<typeof staffPatientSchema>;
