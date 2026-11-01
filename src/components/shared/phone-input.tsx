"use client";

import { useMemo, useState } from "react";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, dialCode, flagEmoji } from "@/lib/phone-countries";
import { cn } from "@/lib/utils";

interface PhoneInputProps {
  /** Hidden field name that receives the international number (e.g. +966501234567). */
  name?: string;
  id?: string;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  className?: string;
}

function split(value: string | null | undefined): { country: CountryCode; national: string } {
  const parsed = value ? parsePhoneNumberFromString(value) : undefined;
  if (parsed?.country && (PHONE_COUNTRIES as readonly string[]).includes(parsed.country)) {
    return { country: parsed.country, national: parsed.formatNational() };
  }
  return { country: DEFAULT_PHONE_COUNTRY, national: value ?? "" };
}

/** Builds what the server receives: international form when we can, raw text otherwise. */
export function combinePhone(country: CountryCode, national: string): string {
  const raw = national.trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") || digits.startsWith("00")) return raw;
  const parsed = parsePhoneNumberFromString(raw, country);
  if (parsed?.isValid()) return parsed.number;
  return `${dialCode(country)}${digits.replace(/^0+/, "")}`;
}

export function PhoneInput({
  name,
  id,
  defaultValue,
  onChange,
  invalid,
  disabled,
  autoFocus,
  describedBy,
  className,
}: PhoneInputProps) {
  const t = useTranslations("phone");
  const locale = useLocale();
  const initial = useMemo(() => split(defaultValue), [defaultValue]);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [national, setNational] = useState(initial.national);

  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);

  const update = (nextCountry: CountryCode, nextNational: string) => {
    setCountry(nextCountry);
    setNational(nextNational);
    onChange?.(combinePhone(nextCountry, nextNational));
  };

  return (
    <div dir="ltr" className={cn("flex w-full min-w-0 gap-2", className)}>
      <select
        aria-label={t("country")}
        value={country}
        disabled={disabled}
        onChange={(e) => update(e.target.value as CountryCode, national)}
        className={cn(
          "h-10 w-[6.75rem] shrink-0 rounded-md border border-input bg-card px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          invalid && "border-destructive",
        )}
      >
        {PHONE_COUNTRIES.map((c) => (
          <option key={c} value={c} suppressHydrationWarning>
            {`${flagEmoji(c)} ${dialCode(c)}${names ? ` ${names.of(c)}` : ""}`}
          </option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        disabled={disabled}
        value={national}
        placeholder={t("placeholder")}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => update(country, e.target.value)}
        className="tabular min-w-0 flex-1 text-start"
      />
      {name ? <input type="hidden" name={name} value={combinePhone(country, national)} /> : null}
    </div>
  );
}
