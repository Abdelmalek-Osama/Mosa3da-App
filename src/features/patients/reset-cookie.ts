import "server-only";
import { cookies } from "next/headers";
import type { OtpMode } from "@/server/integrations/whatsapp/config";
import { RESET_TTL_MINUTES } from "@/server/application/patients/password-reset-service";

const RESET_COOKIE = "pw_reset";
const COOKIE_PATH = "/patient/forgot";

export interface ResetRequest {
  /** otp_verifications id: ties this browser to its own reset request. */
  id: string;
  phone: string;
  mode: OtpMode;
  expiresAt: string;
  /** demo: the mock code. inbound: the code to send from WhatsApp. Absent in cloud_api mode. */
  code?: string;
}

/** httpOnly, scoped to /patient/forgot and short-lived, like the registration code cookie. */
export function rememberResetRequest(value: ResetRequest) {
  cookies().set(RESET_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: (RESET_TTL_MINUTES + 5) * 60,
  });
}

export function clearResetRequest() {
  cookies().delete({ name: RESET_COOKIE, path: COOKIE_PATH });
}

export function readResetRequest(): ResetRequest | null {
  const raw = cookies().get(RESET_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ResetRequest;
  } catch {
    return null;
  }
}
