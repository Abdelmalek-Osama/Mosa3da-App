import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { intlLocale, type Locale } from "@/i18n/config";

export const DEFAULT_TIMEZONE = "Africa/Cairo";

/** Unicode isolates keep LTR fragments (phones, codes) in order inside RTL text. */
export const ltr = (value: string) => `⁦${value}⁩`;

export function formatTime(iso: string | null | undefined, timeZone = DEFAULT_TIMEZONE, locale: Locale = "en"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? intlLocale(locale) : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
}

/** Clinic fees are quoted in Egyptian pounds. */
export const CLINIC_CURRENCY = "EGP";

/** 400 → "EGP 400" / "400 ج.م." (Latin digits in both languages). */
export function formatMoney(amount: number, locale: Locale = "en", currency = CLINIC_CURRENCY): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** `YYYY-MM-DD` clinic date → "Sunday, 1 November 2026" / "الأحد، 1 نوفمبر 2026" */
export function formatClinicDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions = {},
  locale: Locale = "en",
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

const RELATIVE = {
  en: { now: "now", min: "min", h: "h" },
  ar: { now: "الآن", min: "د", h: "س" },
} as const;

export function formatRelativeMinutes(minutes: number | null | undefined, locale: Locale = "en"): string {
  const l = RELATIVE[locale];
  if (minutes === null || minutes === undefined) return "—";
  if (minutes <= 0) return l.now;
  if (minutes < 60) return `${minutes} ${l.min}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ${l.h} ${m} ${l.min}` : `${h} ${l.h}`;
}

/** E.164 → "+966 50 123 4567", wrapped so it never reorders inside Arabic text. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return ltr(parsed?.isValid() ? parsed.formatInternational() : e164);
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function elapsedSince(iso: string | null, now: number): { minutes: number; label: string } {
  if (!iso) return { minutes: 0, label: "00:00" };
  const total = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return { minutes: mm, label: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` };
}

/** Calendar date (`YYYY-MM-DD`) of an instant in the clinic timezone. */
export function clinicDateOf(at: string | number | Date = Date.now(), timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(
    new Date(at),
  );
}
