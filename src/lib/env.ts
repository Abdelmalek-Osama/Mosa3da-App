import { z } from "zod";

const publicEnvSchema = z.object({
  supabaseUrl: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  supabaseKey: z
    .string()
    .min(20, "Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  appUrl: z.string().url().default("http://localhost:3000"),
});

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them.
export const publicEnv = publicEnvSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || undefined,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
