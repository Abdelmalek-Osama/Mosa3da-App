import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/i18n/config";
import { clinicDateOf } from "@/lib/format";
import { filterLogs, listConsultationLogs, resolveLogFilter, type ConsultationLog } from "@/server/application/logs/consultation-logs";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { getActor } from "@/server/authorization/actor";

export const dynamic = "force-dynamic";

/** RFC 4180 field; also defuses spreadsheet formulas in names typed by visitors. */
function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === "string") s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function localParts(iso: string | null, timeZone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
}

/** Downloads the filtered consultation logs as CSV (Excel-ready, UTF-8 with BOM). Doctor only. */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  if (actor.role !== "doctor") return NextResponse.json({ error: "You are not allowed to perform this action." }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const settings = await getClinicSettings(actor.supabase);
  const tz = settings.timezone;
  const filter = resolveLogFilter(
    { range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, q: sp.get("q") ?? undefined },
    clinicDateOf(Date.now(), tz),
  );

  const rawLocale = await getLocale().catch(() => "ar");
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations({ locale, namespace: "logs.csv" });
  const tReason = await getTranslations({ locale, namespace: "visitReason" });
  const reasonLabel = (l: ConsultationLog) => (l.visitReason === "other" && l.visitReasonDetails ? l.visitReasonDetails : tReason(l.visitReason));

  const logs = filterLogs(await listConsultationLogs(actor.supabase, filter.from, filter.to), filter.q, reasonLabel);
  // Oldest first reads naturally in a spreadsheet.
  logs.reverse();

  const header = [
    t("date"),
    t("scheduled"),
    t("started"),
    t("ended"),
    t("patient"),
    t("patientEn"),
    t("reason"),
    t("type"),
    t("expected"),
    t("actual"),
    t("variance"),
    t("result"),
  ];
  const lines = logs.map((l) =>
    [
      l.clinicDate,
      localParts(l.scheduledStart, tz),
      localParts(l.startedAt, tz),
      localParts(l.finishedAt, tz),
      l.patientName,
      l.patientNameEn ?? "",
      reasonLabel(l),
      l.isWalkIn ? t("walkIn") : t("booked"),
      l.expectedMinutes,
      l.actualMinutes,
      l.varianceMinutes,
      l.varianceMinutes > 0 ? t("over") : l.varianceMinutes < 0 ? t("under") : t("onTime"),
    ]
      .map(cell)
      .join(","),
  );

  const csv = `﻿${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
  const filename = `consultation-logs_${filter.from}_${filter.to}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
