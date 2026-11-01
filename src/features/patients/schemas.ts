import { z } from "zod";
import { normalizePhone } from "@/lib/auth/patient-identity";

const phone = z
  .string()
  .trim()
  .min(1, "Enter your mobile number")
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid mobile number, e.g. 010 0123 4567" });
      return z.NEVER;
    }
    return normalized;
  });

export const patientRegisterSchema = z
  .object({
    fullName: z.string().trim().min(3, "Enter your full name").max(120),
    phone,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => v || undefined)
      .pipe(z.string().email("Enter a valid email").optional()),
    password: z.string().min(8, "Use at least 8 characters").max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" });

export const patientSignInSchema = z.object({
  phone,
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export const otpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
