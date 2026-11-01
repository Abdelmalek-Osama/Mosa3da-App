"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PhoneInput } from "@/components/shared/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPatientAction, updatePatientAction } from "@/features/patients/staff-actions";

export interface PatientFormValues {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  preferredLocale: "ar" | "en";
}

type Errors = Record<string, string[] | undefined>;

export function PatientFormDialog({
  trigger,
  patientId,
  initial,
  phoneLocked = false,
}: {
  trigger: React.ReactNode;
  patientId?: string;
  initial?: Partial<PatientFormValues>;
  phoneLocked?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("patients.form");
  const editing = !!patientId;
  const empty: PatientFormValues = {
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    dateOfBirth: initial?.dateOfBirth ?? "",
    preferredLocale: initial?.preferredLocale ?? "ar",
  };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, start] = useTransition();
  const [formKey, setFormKey] = useState(0);

  const set = (k: keyof PatientFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = editing ? await updatePatientAction(patientId!, values) : await createPatientAction(values);
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
        return;
      }
      toast.success(editing ? t("updated") : t("registered"));
      setOpen(false);
      if (!editing && "id" in res.data) router.push(`/admin/patients/${res.data.id}`);
      else router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValues(empty);
          setErrors({});
          setFormKey((k) => k + 1);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>
            {editing ? t("editBody") : t("createBody")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field id="pf-name" label={t("fullName")} error={errors.fullName?.[0]}>
            <Input id="pf-name" value={values.fullName} onChange={set("fullName")} autoComplete="off" aria-invalid={!!errors.fullName} autoFocus />
          </Field>
          <Field
            id="pf-phone"
            label={t("phone")}
            error={errors.phone?.[0]}
            hint={phoneLocked ? t("phoneLocked") : t("phoneHint")}
          >
            <PhoneInput
              key={formKey}
              id="pf-phone"
              defaultValue={values.phone}
              onChange={(phone) => setValues((v) => ({ ...v, phone }))}
              disabled={phoneLocked}
              invalid={!!errors.phone}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pf-email" label={t("email")} error={errors.email?.[0]}>
              <Input id="pf-email" type="email" dir="ltr" className="text-start" value={values.email} onChange={set("email")} aria-invalid={!!errors.email} />
            </Field>
            <Field id="pf-dob" label={t("dob")} error={errors.dateOfBirth?.[0]}>
              <Input id="pf-dob" type="date" value={values.dateOfBirth} onChange={set("dateOfBirth")} aria-invalid={!!errors.dateOfBirth} />
            </Field>
          </div>
          <Field id="pf-lang" label={t("language")} error={errors.preferredLocale?.[0]}>
            <select
              id="pf-lang"
              value={values.preferredLocale}
              onChange={(e) => setValues((v) => ({ ...v, preferredLocale: e.target.value === "en" ? "en" : "ar" }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("languageHint")}</p>
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editing ? t("save") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
