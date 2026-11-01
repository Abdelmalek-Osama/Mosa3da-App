"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, FlaskConical, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import {
  checkVerificationAction,
  resendOtpAction,
  verifyOtpAction,
  type PatientFormState,
} from "@/features/patients/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FormAlert, SubmitButton } from "../form-bits";

const LENGTH = 6;
const POLL_MS = 3000;

type Mode = "demo" | "inbound" | "cloud_api";

export function VerifyForm({ mode, code, clinicWhatsApp }: { mode: Mode; code: string | null; clinicWhatsApp: string | null }) {
  const t = useTranslations("patientAuth.verify");
  const router = useRouter();
  const [resendState, setResendState] = useState<PatientFormState>({});
  const [resending, startResend] = useTransition();

  function resend() {
    startResend(async () => {
      const res = await resendOtpAction();
      setResendState(res);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {mode === "inbound" ? (
        <InboundPanel code={code} clinicWhatsApp={clinicWhatsApp} />
      ) : (
        <>
          {mode === "demo" && code ? (
            <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
                <FlaskConical className="h-4 w-4" /> {t("demoBadge")}
              </div>
              <div dir="ltr" className="tabular mt-2 text-start text-3xl font-bold tracking-[0.4em] text-amber-900 rtl:text-end">
                {code}
              </div>
              <p className="mt-1 text-xs text-amber-800">{t("demoNote")}</p>
            </div>
          ) : null}
          <CodeEntry key={code ?? "none"} />
        </>
      )}

      <FormAlert message={resendState.notice} tone="info" />
      <FormAlert message={resendState.error} />
      <Button type="button" variant="ghost" className="w-full" disabled={resending} onClick={resend}>
        <RefreshCw className={cn(resending && "animate-spin")} /> {t("resend")}
      </Button>
    </div>
  );
}

/** Free mode: the patient sends the code from her own WhatsApp; the webhook verifies it. */
function InboundPanel({ code, clinicWhatsApp }: { code: string | null; clinicWhatsApp: string | null }) {
  const t = useTranslations("patientAuth.verify");
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!code) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      const res = await checkVerificationAction().catch(() => ({ verified: false }));
      if (res.verified && !stopped) {
        stopped = true;
        setVerified(true);
        router.replace("/patient/dashboard?welcome=1");
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, router]);

  if (!code || !clinicWhatsApp) return <FormAlert message={t("noCode")} />;

  const href = `https://wa.me/${clinicWhatsApp}?text=${encodeURIComponent(t("prefill", { code }))}`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 text-center shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("inboundTitle")}</div>
        <div dir="ltr" className="tabular mt-1 text-4xl font-bold tracking-[0.35em] text-navy-900">
          {code}
        </div>
      </div>

      <ol className="space-y-2 text-sm">
        {(["inboundStep1", "inboundStep2", "inboundStep3"] as const).map((key, i) => (
          <li key={key} className="flex items-start gap-3">
            <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
              {i + 1}
            </span>
            <span className="pt-0.5 text-muted-foreground">{t(key)}</span>
          </li>
        ))}
      </ol>

      <Button asChild size="lg" className="w-full bg-[#1fa855] text-white hover:bg-[#178a45]">
        <a href={href} target="_blank" rel="noopener noreferrer">
          <MessageCircle /> {t("openWhatsApp")}
        </a>
      </Button>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg p-3 text-sm",
          verified ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground",
        )}
      >
        {verified ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        {verified ? t("verified") : t("waiting")}
      </div>
    </div>
  );
}

function CodeEntry() {
  const t = useTranslations("patientAuth.verify");
  const [state, action] = useFormState<PatientFormState, FormData>(verifyOtpAction, {});
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const value = digits.join("");

  useEffect(() => refs.current[0]?.focus(), []);

  function setAt(i: number, raw: string) {
    // Accept Arabic-Indic digits from Arabic keyboards.
    const clean = raw
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, LENGTH).split("");
      setDigits(Array.from({ length: LENGTH }, (_, k) => next[k] ?? ""));
      refs.current[Math.min(next.length, LENGTH - 1)]?.focus();
      return;
    }
    setDigits((d) => d.map((x, k) => (k === i ? clean : x)));
    if (clean && i < LENGTH - 1) refs.current[i + 1]?.focus();
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="code" value={value} />
      <div dir="ltr" className="flex justify-between gap-2" role="group" aria-label={t("codeGroup")}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={LENGTH}
            aria-label={t("digit", { n: i + 1 })}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className={cn(
              "tabular h-14 w-full min-w-0 rounded-lg border bg-card text-center text-2xl font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-ring",
              state.fieldErrors?.code && "border-destructive",
            )}
          />
        ))}
      </div>
      <FormAlert message={state.fieldErrors?.code && !state.error ? state.fieldErrors.code : state.error} />
      <SubmitButton pendingLabel={t("verifying")}>{t("verify")}</SubmitButton>
    </form>
  );
}
