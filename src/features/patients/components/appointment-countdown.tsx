"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";

/** "متبقي على موعدك: 3 ساعات و15 دقيقة", updated every 30 seconds (P2-18). */
export function AppointmentCountdown({ at }: { at: string }) {
  const t = useTranslations("portal.countdown");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;
  const total = Math.ceil((new Date(at).getTime() - now) / 60_000);
  if (total <= 0) return null;

  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const parts = [
    days ? t("days", { count: days }) : null,
    hours ? t("hours", { count: hours }) : null,
    minutes && !days ? t("minutes", { count: minutes }) : null,
  ].filter(Boolean);

  return (
    <p className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800" aria-live="polite">
      <Hourglass className="h-4 w-4 shrink-0" aria-hidden />
      {t("left", { time: parts.join(t("and")) })}
    </p>
  );
}
