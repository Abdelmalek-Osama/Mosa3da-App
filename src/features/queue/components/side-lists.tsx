"use client";

import { CalendarCheck2, CheckCheck, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import { consultationsUntilLate } from "@/server/domain/queue/late-policy";
import type { QueueEntryView } from "@/server/domain/queue/types";
import { EntryActionsMenu } from "./entry-actions-menu";
import { useQueueController } from "./queue-controller";
import { QueueNumber, StatusBadge } from "./status-badge";

function toState(e: QueueEntryView) {
  return {
    id: e.id,
    status: e.status,
    position: e.position,
    createdAt: new Date(0),
    estimatedDurationMinutes: e.estimatedDurationMinutes,
    startedAt: null,
    missedTurnAt: e.isAbsent ? new Date(0) : null,
    missedTurnBaseline: e.missedTurnBaseline,
  };
}

export function AbsentList({ entries }: { entries: QueueEntryView[] }) {
  const { request, pending, finishedCount, latePolicyConsultations } = useQueueController();
  const t = useTranslations("queue.absent");
  if (!entries.length) return null;
  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UserX className="h-4 w-4 text-orange-600" /> {t("title")}</CardTitle>
        <CardDescription>{t("body", { count: latePolicyConsultations })}</CardDescription>
      </CardHeader>
      <ul className="space-y-2 px-3 pb-3">
        {entries.map((e) => {
          const remaining = consultationsUntilLate(toState(e), finishedCount, latePolicyConsultations);
          return (
            <li key={e.id} className="flex items-center gap-3 rounded-lg bg-orange-50/60 p-3">
              <QueueNumber value={e.queueNumber} />
              <div className="min-w-0 flex-1">
                <div dir="auto" className="truncate text-start font-medium">{e.patientName}</div>
                <div className="text-xs text-orange-700">
                  {remaining === 0 ? t("nextFinish") : t("untilLate", { count: remaining })}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => request(e, "mark_arrived")} disabled={pending}>
                <UserCheck /> {t("returned")}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function ScheduledList({ entries }: { entries: QueueEntryView[] }) {
  const { request, pending, timezone } = useQueueController();
  const t = useTranslations("queue.scheduled");
  const locale = useLocale() as Locale;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CalendarCheck2 className="h-4 w-4 text-navy-500" /> {t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      {entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="space-y-2 px-3 pb-3">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="tabular w-20 shrink-0 text-sm font-semibold text-navy-800">{formatTime(e.expectedStartAt, timezone, locale)}</div>
              <div dir="auto" className="min-w-0 flex-1 truncate text-start font-medium">{e.patientName}</div>
              <Button size="sm" variant="outline" onClick={() => request(e, "mark_arrived")} disabled={pending}>
                <UserCheck /> {t("arrived")}
              </Button>
              <EntryActionsMenu entry={e} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DoneList({ entries }: { entries: QueueEntryView[] }) {
  const { timezone } = useQueueController();
  const t = useTranslations("queue.done");
  const locale = useLocale() as Locale;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CheckCheck className="h-4 w-4 text-emerald-600" /> {t("title")}</CardTitle>
      </CardHeader>
      {entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="divide-y px-5 pb-3">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="tabular w-10 font-semibold text-muted-foreground">#{e.queueNumber ?? "—"}</span>
              <span dir="auto" className="min-w-0 flex-1 truncate text-start">{e.patientName}</span>
              <span className="tabular text-xs text-muted-foreground">{e.finishedAt ? formatTime(e.finishedAt, timezone, locale) : ""}</span>
              <StatusBadge status={e.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
