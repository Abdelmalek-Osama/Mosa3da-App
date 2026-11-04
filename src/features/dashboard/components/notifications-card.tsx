"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Check, Clock, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { runNotificationSimulationAction } from "@/features/queue/actions";
import { markNotificationOpenedAction } from "@/features/notifications/actions";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/server/application/dashboard/dashboard-service";

type StatusKey = "pending" | "queued" | "sent" | "failed" | "skipped" | "simulated";

const STATUS_STYLE: Record<StatusKey, string> = {
  pending: "bg-amber-50 text-amber-700",
  queued: "bg-blue-50 text-blue-700",
  sent: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  skipped: "bg-slate-100 text-slate-600",
  simulated: "bg-slate-100 text-slate-600",
};

function statusKey(n: NotificationItem): StatusKey {
  if (n.channel === "whatsapp_simulated") return n.status === "sent" ? "simulated" : n.status;
  if (n.channel === "whatsapp" && n.status === "pending") return "queued";
  return n.status;
}

export function NotificationsCard({
  items,
  thresholdMinutes,
  timezone,
  autoSend,
}: {
  items: NotificationItem[];
  thresholdMinutes: number;
  timezone: string;
  autoSend: boolean;
}) {
  const t = useTranslations("reminders");
  const locale = useLocale() as "ar" | "en";
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await runNotificationSimulationAction();
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      const count = res.data.channel === "whatsapp" ? res.data.sent : res.data.enqueued;
      toast.success(t(res.data.channel === "whatsapp" ? "toastNewAuto" : "toastNew", { count }), {
        description: res.data.enqueued === 0 ? t("toastNoneDesc") : res.data.channel === "whatsapp_link" ? t("toastLinkDesc") : undefined,
      });
      router.refresh();
    });
  }

  function opened(id: string) {
    // The link opens natively (no popup blocking); this only records it.
    void markNotificationOpenedAction(id).then(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-secondary" /> {t("title")}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                autoSend ? "bg-emerald-100 text-emerald-800" : "bg-teal-100 text-teal-800",
              )}
            >
              {autoSend ? t("badgeAuto") : t("badgeLink")}
            </span>
          </CardTitle>
          <CardDescription>{t(autoSend ? "descAuto" : "descLink", { minutes: thresholdMinutes })}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t("refresh")}
        </Button>
      </CardHeader>
      {items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2 px-3 pb-3">
          {items.map((n) => {
            const key = statusKey(n);
            const Icon = n.kind === "appointment" ? CalendarClock : Clock;
            return (
              <li key={n.id} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t(n.kind === "appointment" ? "appointment" : "turn")} />
                    <span dir="auto" className="truncate text-sm font-medium">{n.patientName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-xs text-muted-foreground">{formatTime(n.sentAt ?? n.createdAt, timezone, locale)}</span>
                    {n.waLink ? null : (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[key])}>{t(`status.${key}`)}</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" dir="auto">
                  {n.message}
                </p>
                {n.waLink ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {n.openedAt ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-700">
                        <Check className="h-3.5 w-3.5" /> {t("opened", { time: formatTime(n.openedAt, timezone, locale) })}
                      </span>
                    ) : (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE.pending)}>{t("status.pending")}</span>
                    )}
                    <Button
                      asChild
                      size="sm"
                      variant={n.openedAt ? "outline" : "default"}
                      className={cn(!n.openedAt && "bg-[#1fa855] text-white hover:bg-[#178a45]")}
                    >
                      <a href={n.waLink} target="_blank" rel="noopener noreferrer" onClick={() => opened(n.id)}>
                        <Send className="rtl:-scale-x-100" /> {n.openedAt ? t("resendLink") : t("send")}
                      </a>
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
