import { z } from "zod";

const password = z.string().min(8, "At least 8 characters").max(72, "Maximum 72 characters");

export const createSecretarySchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password,
});
export type CreateSecretaryInput = z.input<typeof createSecretarySchema>;

export const resetPasswordSchema = z.object({ id: z.string().uuid(), password });
export const setActiveSchema = z.object({ id: z.string().uuid(), active: z.boolean() });
