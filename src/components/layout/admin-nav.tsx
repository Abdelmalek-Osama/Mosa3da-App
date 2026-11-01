"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, ListOrdered, MonitorPlay, Settings, UserCog, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  /** Key in the "nav" message namespace. */
  label: string;
  icon: LucideIcon;
  external?: boolean;
  doctorOnly?: boolean;
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/admin/queue", label: "queue", icon: ListOrdered },
  { href: "/admin/appointments", label: "appointments", icon: CalendarDays },
  { href: "/admin/patients", label: "patients", icon: Users },
  { href: "/admin/settings", label: "settings", icon: Settings },
  { href: "/admin/secretaries", label: "secretaries", icon: UserCog, doctorOnly: true },
  { href: "/display", label: "display", icon: MonitorPlay, external: true },
];

export function AdminNav({ onNavigate, role }: { onNavigate?: () => void; role: "doctor" | "secretary" }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav className="space-y-1">
      {ADMIN_NAV.filter((item) => !item.doctorOnly || role === "doctor").map((item) => {
        const active = !item.external && pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white",
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className={cn("h-[18px] w-[18px]", active ? "text-teal-300" : "text-navy-300")} />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}
