import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBox } from "@/components/shared/search-box";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogsRangeFilter } from "@/features/logs/components/logs-filters";
import { formatClinicDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConsultationLog, LogFilter } from "@/server/application/logs/consultation-logs";

const PAGE_SIZE = 20;

interface Summary {
  count: number;
  avgActual: number;
  avgExpected: number;
  overCount: number;
}

/** Consultation logs screen: filters, export, summary tiles, paginated table. */
export async function LogsView({
  filter,
  all,
  summary,
  requestedPage,
  timeZone: tz,
  locale,
}: {
  filter: LogFilter;
  /** Every log matching the filter, newest first. */
  all: ConsultationLog[];
  summary: Summary;
  requestedPage: number;
  timeZone: string;
  locale: Locale;
}) {
  const t = await getTranslations("logs");
  const tReason = await getTranslations("visitReason");
  const reasonLabel = (l: ConsultationLog) => (l.visitReason === "other" && l.visitReasonDetails ? l.visitReasonDetails : tReason(l.visitReason));
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, requestedPage));
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const query = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    p.set("range", filter.range);
    if (filter.range === "custom") {
      p.set("from", filter.from);
      p.set("to", filter.to);
    }
    if (filter.q) p.set("q", filter.q);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, String(v));
    }
    return p.toString();
  };

  const period =
    filter.from === filter.to
      ? formatClinicDate(filter.from, {}, locale)
      : `${formatClinicDate(filter.from, { weekday: undefined }, locale)} – ${formatClinicDate(filter.to, { weekday: undefined }, locale)}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button asChild size="lg" className="w-full sm:w-auto" aria-disabled={all.length === 0}>
            <a href={`/admin/logs/export?${query({ page: null })}`} download>
              <Download /> {t("export")}
            </a>
          </Button>
        }
      />

      <Card className="mb-4 space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <LogsRangeFilter range={filter.range} from={filter.from} to={filter.to} />
          <SearchBox placeholder={t("search")} />
        </div>
        <p className="text-sm text-muted-foreground">{period}</p>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("stats.count")} value={String(summary.count)} />
        <Stat label={t("stats.avgActual")} value={t("minutes", { count: summary.avgActual })} />
        <Stat label={t("stats.avgExpected")} value={t("minutes", { count: summary.avgExpected })} />
        <Stat
          label={t("stats.over")}
          value={summary.count ? `${Math.round((summary.overCount / summary.count) * 100)}%` : "—"}
          tone={summary.overCount > summary.count / 2 ? "bad" : undefined}
        />
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <ScrollText className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium text-navy-900">{filter.q ? t("emptySearch") : t("empty")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("emptyBody")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">{t("col.dateTime")}</TableHead>
                <TableHead>{t("col.patient")}</TableHead>
                <TableHead>{t("col.reason")}</TableHead>
                <TableHead className="whitespace-nowrap text-end">{t("col.expected")}</TableHead>
                <TableHead className="whitespace-nowrap text-end">{t("col.actual")}</TableHead>
                <TableHead className="whitespace-nowrap text-end">{t("col.variance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap align-top">
                    <p className="font-medium text-navy-900">{formatClinicDate(l.clinicDate, { weekday: "short", year: undefined }, locale)}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {l.scheduledStart ? formatTime(l.scheduledStart, tz, locale) : t("walkIn")}
                      <span aria-hidden> · </span>
                      {t("inRoom", { start: formatTime(l.startedAt, tz, locale), end: formatTime(l.finishedAt, tz, locale) })}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-[10rem] align-top">
                    <p dir="auto" className="font-medium text-navy-900">
                      {locale === "en" && l.patientNameEn ? l.patientNameEn : l.patientName}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-[9rem] align-top" dir="auto">
                    {reasonLabel(l)}
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap text-end align-top">{t("minutes", { count: l.expectedMinutes })}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-end align-top font-semibold text-navy-900">
                    {t("minutes", { count: l.actualMinutes })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-end align-top">
                    <VariancePill minutes={l.varianceMinutes} onTime={t("onTime")} unit={t("minShort")} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t("pagination")}>
          <p className="text-sm text-muted-foreground">
            {t("showing", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, all.length), total: all.length })}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/logs?${query({ page: page - 1 })}`}>
                  <ChevronLeft className="rtl:-scale-x-100" /> {t("prev")}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="rtl:-scale-x-100" /> {t("prev")}
              </Button>
            )}
            <span className="tabular text-sm text-muted-foreground">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/logs?${query({ page: page + 1 })}`}>
                  {t("next")} <ChevronRight className="rtl:-scale-x-100" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                {t("next")} <ChevronRight className="rtl:-scale-x-100" />
              </Button>
            )}
          </div>
        </nav>
      ) : all.length ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("total", { count: all.length })}</p>
      ) : null}
    </>
  );
}


function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold text-navy-900", tone === "bad" && "text-red-600")}>{value}</p>
    </Card>
  );
}

/** +7 min (over, red) · −2 min (under, green) · on time. */
function VariancePill({ minutes, onTime, unit }: { minutes: number; onTime: string; unit: string }) {
  const tone =
    minutes > 0
      ? "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30"
      : minutes < 0
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
        : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={cn("tabular inline-flex gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tone)}>
      {minutes === 0 ? (
        onTime
      ) : (
        <>
          <bdi dir="ltr">{`${minutes > 0 ? "+" : "−"}${Math.abs(minutes)}`}</bdi>
          {unit}
        </>
      )}
    </span>
  );
}
