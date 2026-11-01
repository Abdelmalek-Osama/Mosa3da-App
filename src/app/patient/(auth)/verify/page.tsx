import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { readIssuedOtp } from "@/features/patients/demo-otp";
import { formatPhone } from "@/lib/format";
import { getActor, getPendingPatient } from "@/server/authorization/actor";
import { otpMode, whatsAppConfig } from "@/server/integrations/whatsapp/config";
import { VerifyForm } from "./verify-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patientAuth.verify");
  return { title: t("metaTitle") };
}
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const pending = await getPendingPatient();
  if (!pending) {
    const actor = await getActor();
    redirect(actor?.role === "patient" ? "/patient/dashboard" : "/patient/login");
  }

  const t = await getTranslations("patientAuth.verify");
  const mode = otpMode();
  const issued = readIssuedOtp();
  const subtitleKey = mode === "inbound" ? "subtitleInbound" : mode === "cloud_api" ? "subtitleSent" : "subtitleEnter";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t.rich(subtitleKey, {
            number: formatPhone(pending.phone),
            phone: (chunks) => <span className="tabular whitespace-nowrap font-medium text-foreground">{chunks}</span>,
          })}</p>
      </div>
      <VerifyForm
        mode={mode}
        code={issued?.mode === mode ? (issued.code ?? null) : null}
        clinicWhatsApp={mode === "inbound" ? (whatsAppConfig().clinicNumber ?? null) : null}
      />
    </div>
  );
}
