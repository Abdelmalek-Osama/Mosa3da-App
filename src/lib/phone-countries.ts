import { getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

/** Egypt (the clinic's country) first, then Arab League countries, then a few common expatriate origins. */
export const PHONE_COUNTRIES = [
  "EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "LB", "IQ", "SY", "PS", "YE",
  "SD", "LY", "TN", "DZ", "MA", "MR", "SO", "DJ", "KM",
  "TR", "PK", "IN", "GB", "US",
] as const satisfies readonly CountryCode[];

const envCountry = process.env.NEXT_PUBLIC_DEFAULT_PHONE_COUNTRY?.toUpperCase();
export const DEFAULT_PHONE_COUNTRY: CountryCode = (PHONE_COUNTRIES as readonly string[]).includes(envCountry ?? "")
  ? (envCountry as CountryCode)
  : "EG";

export function dialCode(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

export function flagEmoji(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
