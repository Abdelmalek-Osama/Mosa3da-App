import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { readResetRequest } from "@/features/patients/reset-cookie";
import { formatPhone } from "@/lib/format";
import { RESET_RESEND_SECONDS, RESET_TTL_MINUTES } from "@/server/application/patients/password-reset-service";
import { otpMode, whatsAppConfig } from "@/server/integrations/whatsapp/config";
import { ResetForm } from "./reset-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patientAuth.forgot");
  return { title: t("resetTitle") };
}
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const request = readResetRequest();
  if (!request) redirect("/patient/forgot");
  const t = await getTranslations("patientAuth.forgot");
  const mode = otpMode();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t("resetTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t.rich(mode === "inbound" ? "resetSubtitleInbound" : mode === "cloud_api" ? "resetSubtitleSent" : "resetSubtitle", {
            number: formatPhone(request.phone),
            phone: (chunks) => <span className="tabular whitespace-nowrap font-medium text-foreground">{chunks}</span>,
          })}
        </p>
      </div>
      <ResetForm
        key={request.id}
        mode={mode}
        code={request.mode === mode ? (request.code ?? null) : null}
        issuedAt={new Date(request.expiresAt).getTime() - RESET_TTL_MINUTES * 60_000}
        resendSeconds={RESET_RESEND_SECONDS}
        clinicWhatsApp={mode === "inbound" ? (whatsAppConfig().clinicNumber ?? null) : null}
      />
    </div>
  );
}
