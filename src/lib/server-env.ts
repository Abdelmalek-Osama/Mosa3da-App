import "server-only";
import { z } from "zod";

const secret = (name: string) =>
  z.string({ required_error: `${name} is not set` }).min(16, `${name} must be at least 16 characters`);

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: secret("SUPABASE_SERVICE_ROLE_KEY"),
  CRON_SECRET: secret("CRON_SECRET"),
  OTP_PEPPER: secret("OTP_PEPPER"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Lazily validated so a missing secret fails only the feature that needs it,
 * with a clear message, instead of crashing every route at boot.
 */
export function serverEnv<K extends keyof ServerEnv>(key: K): ServerEnv[K] {
  const result = serverEnvSchema.shape[key].safeParse(process.env[key]);
  if (!result.success) {
    throw new Error(`[env] ${result.error.issues[0]?.message ?? `${key} is invalid`}`);
  }
  return result.data as ServerEnv[K];
}
