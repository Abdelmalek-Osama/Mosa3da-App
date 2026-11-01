import Link from "next/link";
import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/shared/brand";
import { PreferenceControls } from "@/components/theme/locale-switcher";
import { patientSignOutAction } from "@/features/patients/actions";
import { PatientBottomNav } from "./patient-bottom-nav";

export async function PatientPortalShell({ fullName, children }: { fullName: string; children: React.ReactNode }) {
  const t = await getTranslations("portal");
  const firstName = fullName.split(/\s+/)[0] ?? "";
  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="keep-palette sticky top-0 z-30 border-b border-navy-800 bg-navy-900/95 text-white backdrop-blur supports-[backdrop-filter]:bg-navy-900/85">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-2 px-4">
          <Link href="/patient/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label={t("home")}>
            <BrandMark className="h-8 w-8 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-semibold">
                <span className="font-arabic">مساعدة</span> <span className="font-sans text-teal-200">Mosa3da</span>
              </span>
              <span className="block truncate text-[11px] text-navy-200">{t("hi", { name: firstName })}</span>
            </span>
          </Link>
          <div className="flex items-center">
            <PreferenceControls onDark />
            <form action={patientSignOutAction}>
              <button
                type="submit"
                aria-label={t("signOut")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-navy-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              >
                <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                <span className="hidden sm:inline">{t("signOut")}</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-xl px-4 py-5">{children}</main>
      <PatientBottomNav />
    </div>
  );
}
