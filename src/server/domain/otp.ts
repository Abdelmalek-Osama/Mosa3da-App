import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_LENGTH = 4;
export const OTP_TTL_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

const OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);

/** Cryptographically secure 4-digit code (leading zeros allowed). */
export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

/** HMAC-SHA256(pepper, phone:purpose:code) as hex. Only this hash is stored. */
export function hashOtp(code: string, phone: string, purpose: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`${phone}:${purpose}:${code}`).digest("hex");
}

export function otpMatches(code: string, storedHash: string, phone: string, purpose: string, pepper: string): boolean {
  if (!OTP_PATTERN.test(code) || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(hashOtp(code, phone, purpose, pepper), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
