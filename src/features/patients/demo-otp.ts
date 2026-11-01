import "server-only";
import { cookies } from "next/headers";
import type { IssuedOtp } from "@/server/application/patients/registration-service";
import type { OtpMode } from "@/server/integrations/whatsapp/config";
import { OTP_TTL_MINUTES } from "@/server/domain/otp";

const OTP_COOKIE = "mosa3da_otp_display";
const COOKIE_PATH = "/patient/verify";

export interface PendingCode {
  mode: OtpMode;
  expiresAt: string;
  /** demo: the mock code. inbound: the code to send from WhatsApp. Absent in cloud_api mode. */
  code?: string;
}

/**
 * Lets /patient/verify show what the patient needs: the demo code, or the code
 * to send from WhatsApp. httpOnly and short-lived. In paid mode the code is
 * never stored here, because it went out by WhatsApp.
 */
export function rememberIssuedOtp(otp: IssuedOtp) {
  const value: PendingCode = { mode: otp.mode, expiresAt: otp.expiresAt, code: otp.displayCode };
  cookies().set(OTP_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: OTP_TTL_MINUTES * 60,
  });
}

export function clearIssuedOtp() {
  cookies().delete({ name: OTP_COOKIE, path: COOKIE_PATH });
}

export function readIssuedOtp(): PendingCode | null {
  const raw = cookies().get(OTP_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingCode;
    return new Date(parsed.expiresAt).getTime() > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}
