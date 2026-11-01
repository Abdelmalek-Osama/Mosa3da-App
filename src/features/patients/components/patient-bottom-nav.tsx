"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarPlus, Home } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/patient/dashboard", key: "home", icon: Home },
  { href: "/patient/book-appointment", key: "book", icon: CalendarPlus },
  { href: "/patient/my-appointments", key: "visits", icon: CalendarDays },
] as const;

export function PatientBottomNav() {
  const t = useTranslations("portal.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-teal-700" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full", active && "bg-teal-50")}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
