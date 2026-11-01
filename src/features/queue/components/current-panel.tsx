"use client";

import { Play, Square, Stethoscope } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import type { QueueEntryView } from "@/server/domain/queue/types";
import { ElapsedTimer } from "./elapsed-timer";
import { useQueueController } from "./queue-controller";
import { QueueNumber } from "./status-badge";

export function CurrentPanel({ current, ready }: { current: QueueEntryView | null; ready: QueueEntryView | null }) {
  const { request, pending, timezone } = useQueueController();
  const t = useTranslations("queue");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;

  return (
    <Card className="relative overflow-hidden border-teal-200">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-400 to-teal-600" />
      <div className="flex items-center gap-2 px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-teal-700">
        <Stethoscope className="h-4 w-4" /> {t("current.title")}
      </div>
      {current ? (
        <div className="space-y-4 px-5 pb-5">
          <div className="flex items-start gap-3">
            <QueueNumber value={current.queueNumber} className="h-12 min-w-12 bg-teal-50 text-lg text-teal-800 ring-teal-200" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-navy-900">{current.patientName}</div>
              <div className="text-sm text-muted-foreground">{tReason(current.visitReason)}</div>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-center">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("current.started")}</dt>
              <dd className="tabular text-sm font-semibold">{formatTime(current.startedAt, timezone, locale)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("current.planned")}</dt>
              <dd className="tabular text-sm font-semibold">{t("min", { count: current.estimatedDurationMinutes })}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("current.elapsed")}</dt>
              <dd className="text-sm">
                <ElapsedTimer startedAt={current.startedAt} plannedMinutes={current.estimatedDurationMinutes} />
              </dd>
            </div>
          </dl>
          <Button className="w-full" size="lg" onClick={() => request(current, "finish_consultation")} disabled={pending}>
            <Square /> {t("actions.finish_consultation")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 px-5 pb-5">
          <p className="py-4 text-sm text-muted-foreground">{t("current.none")}</p>
          {ready ? (
            <Button className="w-full" size="lg" variant="secondary" onClick={() => request(ready, "start_consultation")} disabled={pending}>
              <Play /> {t("current.startWith", { name: ready.patientName.split(" ")[0] ?? "", number: ready.queueNumber ?? "" })}
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
