"use client";

import { useState, useTransition } from "react";
import { Languages, Loader2, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setDisplayBilingualAction } from "@/features/display/actions";

/** Staff switch for the lobby TV layout. The TV picks it up on its next poll (≤ 5 s). */
export function DisplayModeToggle({ initial }: { initial: boolean }) {
  const t = useTranslations("displayMode");
  const [bilingual, setBilingual] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const res = await setDisplayBilingualAction(!bilingual);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setBilingual(res.data.bilingual);
      toast.success(res.data.bilingual ? t("nowBilingual") : t("nowArabic"));
    });

  return (
    <Button type="button" variant="outline" onClick={toggle} disabled={pending} aria-pressed={bilingual} title={t("hint")}>
      {pending ? <Loader2 className="animate-spin" /> : bilingual ? <Languages /> : <Monitor />}
      {bilingual ? t("bilingual") : t("arabic")}
    </Button>
  );
}
