import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/authorization/actor";
import { ForgotForm } from "./forgot-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patientAuth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const actor = await getActor();
  if (actor?.role === "patient") redirect("/patient/dashboard");
  const t = await getTranslations("patientAuth.forgot");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ForgotForm />
    </div>
  );
}
