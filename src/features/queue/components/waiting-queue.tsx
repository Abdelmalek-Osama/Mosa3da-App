"use client";

import { Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QueueEntryView } from "@/server/domain/queue/types";
import { EntryActionsMenu } from "./entry-actions-menu";
import { useQueueController } from "./queue-controller";
import { QueueNumber, StatusBadge } from "./status-badge";

export function WaitingQueue({ entries }: { entries: QueueEntryView[] }) {
  const { timezone } = useQueueController();
  const t = useTranslations("queue");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;
  const time = (iso: string | null) => formatTime(iso, timezone, locale);
  const total = entries.length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-secondary" /> {t("waiting.title")}
          </CardTitle>
          <CardDescription>{t("waiting.body")}</CardDescription>
        </div>
        <span className="tabular rounded-full bg-navy-50 px-3 py-1 text-sm font-semibold text-navy-800">{total}</span>
      </CardHeader>

      {total === 0 ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">{t("waiting.none")}</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden px-2 pb-2 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">{t("col.number")}</TableHead>
                  <TableHead>{t("col.patient")}</TableHead>
                  <TableHead>{t("col.reason")}</TableHead>
                  <TableHead className="text-end">{t("col.duration")}</TableHead>
                  <TableHead className="text-end">{t("col.expected")}</TableHead>
                  <TableHead>{t("col.status")}</TableHead>
                  <TableHead className="w-12"><span className="sr-only">{t("col.actions")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, i) => (
                  <TableRow key={entry.id} className={cn(entry.status === "ready" && "bg-amber-50/50")}>
                    <TableCell><QueueNumber value={entry.queueNumber} /></TableCell>
                    <TableCell>
                      <div className="font-medium text-navy-900">{entry.patientName}</div>
                      <div className="tabular text-xs text-muted-foreground">{formatPhone(entry.patientPhone)}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tReason(entry.visitReason)}</TableCell>
                    <TableCell className="tabular text-end">{t("min", { count: entry.estimatedDurationMinutes })}</TableCell>
                    <TableCell className="tabular text-end font-semibold">{time(entry.expectedStartAt)}</TableCell>
                    <TableCell><StatusBadge status={entry.status} /></TableCell>
                    <TableCell><EntryActionsMenu entry={entry} index={i + 1} total={total} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 px-3 pb-3 md:hidden">
            {entries.map((entry, i) => (
              <li key={entry.id} className={cn("flex items-center gap-3 rounded-lg border bg-card p-3", entry.status === "ready" && "border-amber-200 bg-amber-50/40")}>
                <QueueNumber value={entry.queueNumber} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-navy-900">{entry.patientName}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular font-semibold text-foreground">{time(entry.expectedStartAt)}</span>
                    <span>· {t("min", { count: entry.estimatedDurationMinutes })}</span>
                    <span className="truncate">· {tReason(entry.visitReason)}</span>
                  </div>
                  <div className="mt-1.5"><StatusBadge status={entry.status} /></div>
                </div>
                <EntryActionsMenu entry={entry} index={i + 1} total={total} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
