"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center shadow-soft">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
      <h2 className="mt-3 text-lg font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("body")}</p>
      <Button className="mt-5" onClick={reset}>
        <RotateCcw /> {t("retry")}
      </Button>
    </div>
  );
}
