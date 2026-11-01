import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandLockup } from "@/components/shared/brand";
import { PreferenceControls } from "@/components/theme/locale-switcher";

export default async function PatientAuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("patientAuth");
  return (
    <div className="bg-hero min-h-dvh">
      <header className="keep-palette mx-auto flex max-w-md items-center justify-between gap-2 px-5 pb-6 pt-6">
        <Link href="/patient/login" aria-label={t("home")} className="min-w-0">
          <BrandLockup inverted subtitle={t("portal")} />
        </Link>
        <PreferenceControls onDark />
      </header>
      <main className="mx-auto max-w-md px-4 pb-12">
        <div className="rounded-2xl border bg-card p-5 shadow-soft sm:p-7">{children}</div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t("staffQuestion")}{" "}
          <Link href="/login" className="font-medium text-secondary hover:underline">
            {t("staffLink")}
          </Link>
        </p>
      </main>
    </div>
  );
}
