import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActor, getPendingPatient } from "@/server/authorization/actor";
import { PatientLoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patientAuth.login");
  return { title: t("metaTitle") };
}

export default async function PatientLoginPage({ searchParams }: { searchParams: { next?: string } }) {
  if (await getPendingPatient()) redirect("/patient/verify");
  const actor = await getActor();
  if (actor?.role === "patient") redirect("/patient/dashboard");
  const t = await getTranslations("patientAuth.login");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PatientLoginForm next={searchParams.next} />
    </div>
  );
}
