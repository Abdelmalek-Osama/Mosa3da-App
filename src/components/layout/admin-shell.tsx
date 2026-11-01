"use client";

import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { signOutAction } from "@/features/auth/actions";
import { BrandLockup } from "@/components/shared/brand";
import { PreferenceControls } from "@/components/theme/locale-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { initials } from "@/lib/format";
import { AdminNav } from "./admin-nav";

interface AdminShellProps {
  user: { fullName: string; role: "doctor" | "secretary" };
  clinic: { name: string; nameAr: string; doctorName: string };
  children: React.ReactNode;
}

function UserCard({ user }: Pick<AdminShellProps, "user">) {
  const t = useTranslations("shell");
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-500/20 text-sm font-semibold text-teal-200">
        {initials(user.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{user.fullName}</div>
        <div className="text-xs text-navy-300">{t(`roles.${user.role}`)}</div>
      </div>
      <form action={signOutAction}>
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-navy-200 hover:bg-white/10 hover:text-white"
          aria-label={t("signOut")}
        >
          <LogOut className="rtl:-scale-x-100" />
        </Button>
      </form>
    </div>
  );
}

function SidebarBody({ user, clinic, onNavigate }: Omit<AdminShellProps, "children"> & { onNavigate?: () => void }) {
  const locale = useLocale();
  return (
    <div className="keep-palette flex h-full flex-col gap-6 bg-navy-900 p-4">
      <div className="px-1 pt-1">
        <BrandLockup inverted subtitle={locale === "ar" ? clinic.nameAr || clinic.name : clinic.name} />
      </div>
      <div className="flex-1">
        <AdminNav onNavigate={onNavigate} role={user.role} />
      </div>
      <PreferenceControls onDark className="justify-center" />
      <UserCard user={user} />
    </div>
  );
}

export function AdminShell({ user, clinic, children }: AdminShellProps) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <SidebarBody user={user} clinic={clinic} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="keep-palette sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-navy-800 bg-navy-900 px-4 text-white lg:hidden">
          <BrandLockup inverted />
          <div className="flex items-center gap-1">
            <PreferenceControls onDark />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label={t("openMenu")}>
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side={locale === "ar" ? "right" : "left"} className="w-[85%] max-w-xs border-0 p-0">
                <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
                <SidebarBody user={user} clinic={clinic} onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
