import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { DEFAULT_PHONE_COUNTRY } from "@/lib/phone-countries";

/**
 * Patients sign in with phone + password. Supabase phone auth needs an SMS
 * provider, so each patient gets a deterministic internal email derived from
 * the normalized phone. It is never shown to the patient and never emailed.
 */
export const PATIENT_AUTH_EMAIL_DOMAIN = "patients.mosa3da.app";

/**
 * Any reasonable input → E.164, or null.
 * "+966 50 123 4567", "00966501234567" and national numbers for `country`
 * ("0501234567" with SA) all work. Egyptian local mobiles stay supported for
 * existing data.
 */
export function normalizePhone(raw: string, country: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  const international = trimmed.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  const parsed = international
    ? parsePhoneNumberFromString(`+${digits}`)
    : parsePhoneNumberFromString(digits, country) ?? undefined;
  if (parsed?.isValid()) return parsed.number;

  // Fallbacks for data typed before country support existed.
  if (!international && /^01[0125]\d{8}$/.test(digits)) return `+2${digits}`;
  if (!international && /^20(1[0125]\d{8})$/.test(digits)) return `+${digits}`;
  return international && /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

export function patientAuthEmail(normalizedPhone: string): string {
  return `p${normalizedPhone.replace(/\D/g, "")}@${PATIENT_AUTH_EMAIL_DOMAIN}`;
}
