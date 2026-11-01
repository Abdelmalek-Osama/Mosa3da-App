import { useTranslations } from "next-intl";
import type { QueueStatus } from "@/server/domain/queue/constants";
import { cn } from "@/lib/utils";

const STYLES: Record<QueueStatus, string> = {
  scheduled: "bg-slate-100 text-slate-600 ring-slate-200",
  arrived: "bg-blue-50 text-blue-700 ring-blue-200",
  ready: "bg-amber-50 text-amber-800 ring-amber-200",
  current: "bg-teal-50 text-teal-800 ring-teal-200",
  late: "bg-red-50 text-red-700 ring-red-200",
  finished: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-slate-50 text-slate-500 ring-slate-200",
};

const DOT: Record<QueueStatus, string> = {
  scheduled: "bg-status-scheduled",
  arrived: "bg-status-arrived",
  ready: "bg-status-ready",
  current: "bg-status-current",
  late: "bg-status-late",
  finished: "bg-status-finished",
  cancelled: "bg-status-cancelled",
};

export function StatusBadge({
  status,
  absent = false,
  className,
}: {
  status: QueueStatus;
  absent?: boolean;
  className?: string;
}) {
  const t = useTranslations("queueStatus");
  if (absent) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", "bg-orange-50 text-orange-700 ring-orange-200", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
        {t("missedTurn")}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", STYLES[status], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[status], status === "current" && "animate-pulse")} />
      {t(status)}
    </span>
  );
}

export function QueueNumber({ value, className }: { value: number | null; className?: string }) {
  return (
    <span
      className={cn(
        "tabular inline-grid h-9 min-w-9 place-items-center rounded-lg bg-navy-50 px-2 text-sm font-bold text-navy-800 ring-1 ring-inset ring-navy-100",
        className,
      )}
    >
      {value === null ? "—" : `#${value}`}
    </span>
  );
}
