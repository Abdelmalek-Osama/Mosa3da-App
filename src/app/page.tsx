import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarHeart, MonitorPlay, Stethoscope } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BrandLockup } from "@/components/shared/brand";
import { PreferenceControls } from "@/components/theme/locale-switcher";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/authorization/actor";

export default async function Home() {
  const actor = await getActor();
  if (actor) redirect(actor.role === "patient" ? "/patient/dashboard" : "/admin/dashboard");
  const t = await getTranslations("landing");

  const links = [
    { href: "/patient/login", icon: CalendarHeart, key: "patients", primary: true },
    { href: "/login", icon: Stethoscope, key: "staff" },
    { href: "/display", icon: MonitorPlay, key: "display" },
  ] as const;

  return (
    <div className="bg-hero min-h-dvh [--hero-height:480px]">
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:pt-10">
        <div className="keep-palette flex items-center justify-between gap-3">
          <BrandLockup inverted subtitle={t("subtitle")} />
          <PreferenceControls onDark />
        </div>
        <h1 className="mt-12 text-3xl font-semibold leading-snug tracking-tight text-white sm:text-4xl">{t("headline")}</h1>
        <p className="mt-3 max-w-xl text-base text-[#c4d4ec]">{t("lead")}</p>
        <ul className="mt-10 grid gap-3 sm:grid-cols-3">
          {links.map(({ href, icon: Icon, key, ...rest }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex h-full flex-col gap-3 rounded-2xl border p-5 shadow-soft transition-colors",
                  "primary" in rest ? "border-teal-300 bg-teal-50 hover:bg-teal-100" : "bg-card hover:border-teal-300",
                )}
              >
                <span className="keep-palette grid h-10 w-10 place-items-center rounded-xl bg-navy-900 text-white">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold text-navy-900">{t(`${key}.title`)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t(`${key}.body`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
