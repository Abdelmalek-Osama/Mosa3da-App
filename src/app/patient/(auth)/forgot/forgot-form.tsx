"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import type { PatientFormState } from "@/features/patients/actions";
import { requestResetAction } from "@/features/patients/reset-actions";
import { PhoneInput } from "@/components/shared/phone-input";
import { Field, FormAlert, SubmitButton } from "../form-bits";

export function ForgotForm() {
  const t = useTranslations("patientAuth");
  const [state, action] = useFormState<PatientFormState, FormData>(requestResetAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="phone" label={t("phone")} error={e.phone}>
        <PhoneInput id="phone" name="phone" invalid={!!e.phone} className="[&_input]:h-12 [&_select]:h-12" />
      </Field>
      <FormAlert message={state.error} />
      <SubmitButton pendingLabel={t("forgot.sending")}>{t("forgot.send")}</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/patient/login" className="font-medium text-secondary hover:underline">
          {t("forgot.back")}
        </Link>
      </p>
    </form>
  );
}
