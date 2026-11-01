"use client";

import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABLES = ["queue_entries", "clinic_sessions", "appointments", "notification_logs"];

export function LiveIndicator({ channel }: { channel: string }) {
  const t = useTranslations("live");
  const status = useRealtimeRefresh({ channel, tables: TABLES });
  const label = t(status === "live" ? "live" : status === "polling" ? "polling" : "connecting");
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          status === "live" ? "animate-pulse-ring bg-teal-500" : status === "polling" ? "bg-amber-500" : "bg-slate-300",
        )}
      />
      {label}
    </span>
  );
}
