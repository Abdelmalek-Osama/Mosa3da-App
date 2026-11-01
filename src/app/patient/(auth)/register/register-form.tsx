"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { registerPatientAction, type PatientFormState } from "@/features/patients/actions";
import { PhoneInput } from "@/components/shared/phone-input";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, PasswordInput, SubmitButton } from "../form-bits";

export function RegisterForm() {
  const t = useTranslations("patientAuth");
  const [state, action] = useFormState<PatientFormState, FormData>(registerPatientAction, {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="fullName" label={t("register.fullName")} error={e.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" className="h-12" placeholder={t("register.fullNamePlaceholder")} aria-invalid={!!e.fullName} required />
      </Field>
      <Field id="phone" label={t("phone")} error={e.phone} hint={t("register.phoneHint")}>
        <PhoneInput id="phone" name="phone" invalid={!!e.phone} className="[&_input]:h-12 [&_select]:h-12" />
      </Field>
      <Field id="password" label={t("password")} error={e.password} hint={t("register.passwordHint")}>
        <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={!!e.password} required />
      </Field>
      <Field id="confirmPassword" label={t("register.confirmPassword")} error={e.confirmPassword}>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" aria-invalid={!!e.confirmPassword} required />
      </Field>
      <FormAlert message={state.error} />
      <SubmitButton pendingLabel={t("register.creating")}>{t("register.create")}</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        {t("register.already")}{" "}
        <Link href="/patient/login" className="font-medium text-secondary hover:underline">
          {t("login.signIn")}
        </Link>
      </p>
    </form>
  );
}
