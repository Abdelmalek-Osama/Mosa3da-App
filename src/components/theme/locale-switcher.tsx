"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setLocaleAction } from "@/i18n/actions";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export function LocaleSwitcher({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const t = useTranslations("prefs");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale === "ar" ? "en" : "ar";

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setLocaleAction(next);
          router.refresh();
        })
      }
      className={cn("h-9 gap-1.5 px-2.5", onDark && "text-navy-100 hover:bg-white/10 hover:text-white", className)}
      aria-label={t("switchLanguage")}
      lang={next}
    >
      <Languages className="h-4 w-4" />
      <span className={cn("text-sm font-medium", next === "ar" && "font-arabic")}>{next === "ar" ? "العربية" : "English"}</span>
    </Button>
  );
}

export function PreferenceControls({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <LocaleSwitcher onDark={onDark} />
      <ThemeToggle onDark={onDark} />
    </div>
  );
}
