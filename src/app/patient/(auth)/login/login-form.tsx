"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { patientSignInAction, type PatientFormState } from "@/features/patients/actions";
import { PhoneInput } from "@/components/shared/phone-input";
import { Field, FormAlert, PasswordInput, SubmitButton } from "../form-bits";

export function PatientLoginForm({ next }: { next?: string }) {
  const t = useTranslations("patientAuth");
  const [state, action] = useFormState<PatientFormState, FormData>(patientSignInAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="phone" label={t("phone")} error={e.phone}>
        <PhoneInput id="phone" name="phone" invalid={!!e.phone} className="[&_input]:h-12 [&_select]:h-12" />
      </Field>
      <Field id="password" label={t("password")} error={e.password}>
        <PasswordInput id="password" name="password" autoComplete="current-password" aria-invalid={!!e.password} required />
        <div className="text-end">
          <Link href="/patient/forgot" className="text-sm font-medium text-secondary hover:underline">
            {t("login.forgot")}
          </Link>
        </div>
      </Field>
      <FormAlert message={state.error} />
      <SubmitButton pendingLabel={t("login.signingIn")}>{t("login.signIn")}</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        {t("login.newPatient")}{" "}
        <Link href="/patient/register" className="font-medium text-secondary hover:underline">
          {t("login.createAccount")}
        </Link>
      </p>
    </form>
  );
}
