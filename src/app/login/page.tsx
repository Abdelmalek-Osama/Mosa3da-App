import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BrandLockup } from "@/components/shared/brand";
import { PreferenceControls } from "@/components/theme/locale-switcher";
import { getActor } from "@/server/authorization/actor";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staffLogin");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const actor = await getActor();
  if (actor && actor.role !== "patient") redirect("/admin/dashboard");
  const t = await getTranslations("staffLogin");

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="keep-palette relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -end-24 -top-24 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -start-16 h-96 w-96 rounded-full bg-navy-500/30 blur-3xl" />
        <BrandLockup inverted subtitle={t("workspace")} />
        <div className="relative max-w-md space-y-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">{t("headline")}</h1>
          <ul className="space-y-4 text-navy-100">
            <li className="flex gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" /> {t("feature1")}</li>
            <li className="flex gap-3"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" /> {t("feature2")}</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" /> {t("feature3")}</li>
          </ul>
        </div>
        <p className="relative text-xs text-navy-300">© {new Date().getFullYear()} Mosa3da</p>
      </section>

      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex justify-end">
          <PreferenceControls />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center space-y-8 py-6">
          <div className="lg:hidden">
            <BrandLockup subtitle={t("workspaceShort")} />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-navy-900">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <LoginForm next={searchParams.next} />
          <p className="text-center text-sm text-muted-foreground">
            {t("areYouPatient")}{" "}
            <Link href="/patient/login" className="font-medium text-secondary hover:underline">
              {t("goToPortal")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
