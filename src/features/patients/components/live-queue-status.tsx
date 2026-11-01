"use client";

import { Hourglass, Stethoscope, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { formatRelativeMinutes, formatTime } from "@/lib/format";
import type { MyQueueStatus } from "@/features/queue/schemas";

type InQueue = Extract<MyQueueStatus, { in_queue: true }>;

const TONE: Record<InQueue["status"], string> = {
  scheduled: "from-slate-700 to-navy-900",
  arrived: "from-navy-700 to-navy-900",
  ready: "from-amber-500 to-amber-700",
  current: "from-teal-500 to-teal-700",
  late: "from-red-500 to-red-700",
  finished: "from-emerald-600 to-emerald-800",
  cancelled: "from-slate-500 to-slate-700",
};

export function LiveQueueStatus({ status, timeZone }: { status: InQueue; timeZone?: string }) {
  const t = useTranslations("portal.queue");
  const tStatus = useTranslations("patientStatus");
  const tReason = useTranslations("visitReason");
  const tLive = useTranslations("live");
  const locale = useLocale() as Locale;
  const live = useRealtimeRefresh({ channel: "patient-queue", tables: ["queue_entries", "appointments"], pollMs: 15_000 });
  const missed = status.missed_turn && (status.status === "arrived" || status.status === "late");
  const message = missed ? t("missed") : tStatus(status.status);
  const waiting = status.status === "arrived" || status.status === "ready" || status.status === "late";

  return (
    <section
      aria-live="polite"
      className={cn("keep-palette overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-soft", TONE[missed ? "late" : status.status])}
    >
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-white/75">
        <span>{t("todaysVisit")}</span>
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
          <span className={cn("h-2 w-2 rounded-full", live === "live" ? "animate-pulse bg-white" : "bg-white/50")} />
          {live === "live" ? tLive("live") : tLive("polling")}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div>
          <p className="text-xs text-white/75">{t("yourNumber")}</p>
          <p className="tabular text-6xl font-bold leading-none">{status.queue_number ?? "—"}</p>
        </div>
        <p className="min-w-0 flex-1 pb-1 text-sm font-medium leading-snug">{message}</p>
      </div>

      {waiting && !missed ? (
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat icon={Users} label={t("ahead")} value={status.patients_ahead ?? "—"} />
          <Stat icon={Hourglass} label={t("wait")} value={formatRelativeMinutes(status.estimated_wait_minutes, locale)} />
          <Stat icon={Stethoscope} label={t("expected")} value={formatTime(status.expected_start_at, timeZone, locale)} />
        </dl>
      ) : null}

      <p className="mt-4 text-xs text-white/75">
        {tReason(status.visit_reason)}
        {waiting ? ` · ${t("estimates")}` : null}
      </p>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/10 px-2 py-2.5 ring-1 ring-inset ring-white/15">
      <Icon className="mx-auto h-4 w-4 text-white/80" aria-hidden />
      <dd className="tabular mt-1 text-base font-semibold">{value}</dd>
      <dt className="text-[11px] text-white/75">{label}</dt>
    </div>
  );
}

/** Keeps the dashboard live while the patient has nothing in today's queue. */
export function QueueRefreshWatcher() {
  useRealtimeRefresh({ channel: "patient-queue", tables: ["queue_entries", "appointments"], pollMs: 30_000 });
  return null;
}
