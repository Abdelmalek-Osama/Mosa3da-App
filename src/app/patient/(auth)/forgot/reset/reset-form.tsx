"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FlaskConical, MessageCircle, RefreshCw } from "lucide-react";
import type { PatientFormState } from "@/features/patients/actions";
import { checkResetVerifiedAction, resendResetAction, resetPasswordAction } from "@/features/patients/reset-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Field, FormAlert, PasswordInput, SubmitButton } from "../../form-bits";

type Mode = "demo" | "inbound" | "cloud_api";

export function ResetForm({
  mode,
  code,
  issuedAt,
  resendSeconds,
  clinicWhatsApp,
}: {
  mode: Mode;
  code: string | null;
  issuedAt: number;
  resendSeconds: number;
  clinicWhatsApp: string | null;
}) {
  const t = useTranslations("patientAuth.forgot");
  const tv = useTranslations("patientAuth.verify");
  const router = useRouter();
  const [state, action] = useFormState<PatientFormState, FormData>(resetPasswordAction, {});
  const [resendState, setResendState] = useState<PatientFormState>({});
  const [resending, startResend] = useTransition();
  const [verified, setVerified] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const e = state.fieldErrors ?? {};

  // 60-second resend countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const wait = Math.max(0, Math.ceil((issuedAt + resendSeconds * 1000 - now) / 1000));

  // Free WhatsApp mode: wait until the visitor's message verifies the request.
  useEffect(() => {
    if (mode !== "inbound" || verified) return;
    const id = setInterval(async () => {
      const res = await checkResetVerifiedAction();
      if (res.verified) setVerified(true);
    }, 3000);
    return () => clearInterval(id);
  }, [mode, verified]);

  function resend() {
    startResend(async () => {
      setResendState(await resendResetAction());
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {mode === "demo" && code ? (
        <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
            <FlaskConical className="h-4 w-4" /> {tv("demoBadge")}
          </div>
          <div dir="ltr" className="tabular mt-2 text-start text-3xl font-bold tracking-[0.4em] text-amber-900 rtl:text-end">
            {code}
          </div>
          <p className="mt-1 text-xs text-amber-800">{tv("demoNote")}</p>
        </div>
      ) : null}

      {mode === "inbound" && code && clinicWhatsApp ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div dir="ltr" className="tabular text-center text-3xl font-bold tracking-[0.4em] text-navy-900">
            {code}
          </div>
          <Button asChild variant="secondary" className="h-12 w-full">
            <a href={`https://wa.me/${clinicWhatsApp}?text=${encodeURIComponent(t("prefill", { code }))}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> {tv("openWhatsApp")}
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">{verified ? tv("verified") : tv("waiting")}</p>
        </div>
      ) : null}

      <form action={action} className="space-y-4" noValidate>
        {mode === "inbound" ? null : (
          <Field id="code" label={t("code")} error={e.code}>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              placeholder="••••"
              dir="ltr"
              className="tabular h-12 text-center text-xl tracking-[0.5em]"
              aria-invalid={!!e.code}
              required
            />
          </Field>
        )}
        <Field id="password" label={t("newPassword")} error={e.password} hint={t("passwordHint")}>
          <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={!!e.password} required />
        </Field>
        <Field id="confirmPassword" label={t("confirmPassword")} error={e.confirmPassword}>
          <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" aria-invalid={!!e.confirmPassword} required />
        </Field>
        <FormAlert message={state.error} />
        <SubmitButton pendingLabel={t("saving")}>{t("save")}</SubmitButton>
      </form>

      <FormAlert message={resendState.notice} tone="info" />
      <FormAlert message={resendState.error} />
      <Button type="button" variant="ghost" className="w-full" disabled={resending || wait > 0} onClick={resend}>
        <RefreshCw className={cn(resending && "animate-spin")} /> {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
      </Button>
    </div>
  );
}
