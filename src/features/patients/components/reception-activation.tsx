"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkReceptionVerifiedAction,
  finishReceptionActivationAction,
  sendReceptionCodeAction,
} from "@/features/patients/reception-actions";
import { formatPhone } from "@/lib/format";

type Step =
  | { kind: "idle" }
  | { kind: "sent"; userId: string; mode: "demo" | "inbound" | "cloud_api"; displayCode: string | null }
  | { kind: "done"; password: string; fullName: string; phone: string };

/**
 * Reception portal activation: send a 4-digit code to the visitor's WhatsApp
 * (or show it in demo mode), verify it, then show a generated password ONCE
 * with a one-tap WhatsApp welcome message. Nothing is claimed as "sent" unless
 * WhatsApp actually sent it.
 */
export function ReceptionActivation({ fullName, phone }: { fullName: string; phone: string }) {
  const t = useTranslations("reception");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Free WhatsApp mode: wait for the visitor's message to verify the number.
  useEffect(() => {
    if (step.kind !== "sent" || step.mode !== "inbound") return;
    const id = setInterval(async () => {
      const res = await checkReceptionVerifiedAction(step.userId);
      if (res.ok && res.data.verified) finish(step.userId);
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function send() {
    setError(null);
    start(async () => {
      const res = await sendReceptionCodeAction({ fullName, phone });
      if (!res.ok) {
        setError(res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat()[0] ?? res.error.message : res.error.message);
        return;
      }
      setCode("");
      setStep({ kind: "sent", userId: res.data.userId, mode: res.data.mode, displayCode: res.data.displayCode });
    });
  }

  function finish(userId: string, typed?: string) {
    setError(null);
    start(async () => {
      const res = await finishReceptionActivationAction({ userId, code: typed });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setStep({ kind: "done", ...res.data });
      toast.success(t("activated"));
    });
  }

  if (step.kind === "done") {
    const message = t("welcome", {
      name: step.fullName.split(" ")[0] ?? step.fullName,
      url: `${window.location.origin}/patient/login`,
      phone: formatPhone(step.phone),
      password: step.password,
    });
    const href = `https://wa.me/${step.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
    return (
      <div className="space-y-3 rounded-lg border border-teal-200 bg-accent/50 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-teal-800">
          <ShieldCheck className="h-4 w-4" /> {t("activated")}
        </p>
        <div className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground">{t("password")}</span>
          <span className="tabular select-all font-mono text-base font-semibold tracking-wider" dir="ltr">
            {step.password}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("copy")}
            onClick={() => void navigator.clipboard?.writeText(step.password).then(() => toast.success(t("copied")))}
          >
            <Copy />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("passwordOnce")}</p>
        <Button asChild type="button" variant="secondary" className="w-full">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> {t("sendWelcome")}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">{t("welcomeNote")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-teal-700" /> {t("title")}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={send} disabled={pending || !phone || fullName.trim().length < 3}>
          {pending && step.kind === "idle" ? <Loader2 className="animate-spin" /> : null}
          {step.kind === "sent" ? t("resend") : t("send")}
        </Button>
      </div>
      {step.kind === "idle" ? <p className="text-xs text-muted-foreground">{t("hint")}</p> : null}

      {step.kind === "sent" ? (
        <div className="space-y-2">
          {step.mode === "cloud_api" ? <p className="text-xs text-teal-800">{t("sentWhatsApp")}</p> : null}
          {step.mode === "demo" ? (
            <p className="text-xs text-amber-800">
              {t("demoCode")}{" "}
              <span className="tabular font-mono text-sm font-semibold" dir="ltr">
                {step.displayCode ?? "—"}
              </span>
            </p>
          ) : null}
          {step.mode === "inbound" ? (
            <p className="text-xs text-muted-foreground">
              {t("inbound")}{" "}
              <span className="tabular font-mono text-sm font-semibold text-foreground" dir="ltr">
                {step.displayCode}
              </span>{" "}
              <Loader2 className="inline h-3 w-3 animate-spin" />
            </p>
          ) : (
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••"
                aria-label={t("codeLabel")}
                className="tabular w-28 text-center tracking-[0.4em]"
                dir="ltr"
              />
              <Button type="button" onClick={() => finish(step.userId, code)} disabled={pending || code.length !== 4}>
                {pending ? <Loader2 className="animate-spin" /> : <Check />} {t("verify")}
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
