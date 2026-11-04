"use client";

import { BellRing, Play, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPhone, formatTime } from "@/lib/format";
import { visitReasonText } from "@/server/domain/queue/constants";
import type { QueueEntryView } from "@/server/domain/queue/types";
import { useQueueController } from "./queue-controller";
import { QueueNumber, StatusBadge } from "./status-badge";

export function NextPanel({ ready }: { ready: QueueEntryView | null }) {
  const { request, pending, hasCurrent, timezone } = useQueueController();
  const t = useTranslations("queue");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;

  return (
    <Card className="relative overflow-hidden border-amber-200">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 to-amber-500" />
      <div className="flex items-center gap-2 px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-amber-700">
        <BellRing className="h-4 w-4" /> {t("next.title")}
      </div>
      {ready ? (
        <div className="space-y-4 px-5 pb-5">
          <div className="flex items-start gap-3">
            <QueueNumber value={ready.queueNumber} className="h-12 min-w-12 bg-amber-50 text-lg text-amber-800 ring-amber-200" />
            <div className="min-w-0 flex-1">
              <div dir="auto" className="truncate text-start text-lg font-semibold text-navy-900">{ready.patientName}</div>
              <div className="text-sm text-muted-foreground">
                {visitReasonText(ready.visitReason, ready.visitReasonDetails, tReason)} · {formatPhone(ready.patientPhone)}
              </div>
            </div>
            <StatusBadge status={ready.status} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{t("next.expected")}</span>
            <span className="tabular font-semibold">
              {formatTime(ready.expectedStartAt, timezone, locale)} · {t("min", { count: ready.estimatedDurationMinutes })}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button size="lg" variant="secondary" onClick={() => request(ready, "start_consultation")} disabled={pending || hasCurrent}>
              <Play /> {t("actions.start_consultation")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => request(ready, "mark_absent")} disabled={pending} aria-label={t("actions.mark_absent")}>
              <UserX /> <span className="hidden sm:inline">{t("next.absent")}</span>
            </Button>
          </div>
          {hasCurrent ? (
            <p className="text-xs text-muted-foreground">{t("next.finishFirst")}</p>
          ) : null}
        </div>
      ) : (
        <p className="px-5 pb-6 pt-4 text-sm text-muted-foreground">{t("next.none")}</p>
      )}
    </Card>
  );
}
