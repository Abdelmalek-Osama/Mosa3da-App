"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updateClinicSettingsAction } from "@/features/settings/actions";
import type { ClinicSettingsInput } from "@/features/settings/schemas";

type Values = { [K in keyof ClinicSettingsInput]: string };

const NUMBER_FIELDS: { key: keyof Values; unit: "min" | "visits" | "days"; min: number; max: number }[] = [
  { key: "defaultConsultationMinutes", unit: "min", min: 5, max: 180 },
  { key: "slotIntervalMinutes", unit: "min", min: 5, max: 120 },
  { key: "whatsappThresholdMinutes", unit: "min", min: 5, max: 240 },
  { key: "latePolicyConsultations", unit: "visits", min: 1, max: 10 },
  { key: "bookingHorizonDays", unit: "days", min: 1, max: 365 },
  { key: "cancellationCutoffMinutes", unit: "min", min: 0, max: 10080 },
];

export function ClinicSettingsForm({ initial, readOnly }: { initial: ClinicSettingsInput; readOnly: boolean }) {
  const router = useRouter();
  const t = useTranslations("settings.form");
  const toStrings = (v: ClinicSettingsInput) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) as Values;
  const [values, setValues] = useState<Values>(toStrings(initial));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateClinicSettingsAction(values);
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
        return;
      }
      setErrors({});
      toast.success(t("saved"));
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset disabled={readOnly || pending} className="grid gap-4 sm:grid-cols-2">
        <Field id="cs-name" label={t("clinicName")} error={errors.clinicName?.[0]}>
          <Input id="cs-name" dir="ltr" lang="en" className="text-start" value={values.clinicName} onChange={set("clinicName")} />
        </Field>
        <Field id="cs-name-ar" label={t("clinicNameAr")} error={errors.clinicNameAr?.[0]}>
          <Input id="cs-name-ar" dir="rtl" lang="ar" className="font-arabic" value={values.clinicNameAr} onChange={set("clinicNameAr")} />
        </Field>
        <Field id="cs-doctor" label={t("doctorName")} error={errors.doctorName?.[0]} className="sm:col-span-2">
          <Input id="cs-doctor" value={values.doctorName} onChange={set("doctorName")} />
        </Field>
      </fieldset>
      <Separator />
      <fieldset disabled={readOnly || pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NUMBER_FIELDS.map((f) => (
          <Field key={f.key} id={`cs-${f.key}`} label={t(`${f.key}.label`)} error={errors[f.key]?.[0]} hint={t(`${f.key}.hint`)}>
            <div className="relative">
              <Input id={`cs-${f.key}`} type="number" inputMode="numeric" min={f.min} max={f.max} value={values[f.key]} onChange={set(f.key)} className="pe-16" />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t(`unit.${f.unit}`)}</span>
            </div>
          </Field>
        ))}
      </fieldset>
      {readOnly ? null : (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} {t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}

function Field({ id, label, error, hint, className, children }: { id: string; label: string; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
