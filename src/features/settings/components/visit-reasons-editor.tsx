"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveVisitReasonsAction } from "@/features/settings/visit-reason-actions";
import type { VisitReason } from "@/server/domain/queue/constants";

interface Row {
  reason: VisitReason;
  durationMinutes: string;
  isActive: boolean;
}

/**
 * Doctor's table of visit reasons (P3-19): expected duration per reason, whether
 * reception and the portal offer it, and the order. Reception never picks a
 * duration by hand; the reason's duration is used automatically.
 */
export function VisitReasonsEditor({
  initial,
  readOnly,
}: {
  initial: { reason: VisitReason; durationMinutes: number; isActive: boolean }[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("settings.reasons");
  const tReason = useTranslations("visitReason");
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => ({ ...r, durationMinutes: String(r.durationMinutes) })));
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    update(next);
  };
  const set = (i: number, patch: Partial<Row>) => update(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      const res = await saveVisitReasonsAction(
        rows.map((r, i) => ({ reason: r.reason, durationMinutes: Number(r.durationMinutes), isActive: r.isActive, sortOrder: i + 1 })),
      );
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t("saved"));
      setDirty(false);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border">
        {rows.map((r, i) => (
          <li key={r.reason} className={cn("flex flex-wrap items-center gap-3 p-3", !r.isActive && "opacity-60")}>
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-600"
                checked={r.isActive}
                disabled={readOnly}
                onChange={(e) => set(i, { isActive: e.target.checked })}
                aria-label={t("offered", { reason: tReason(r.reason) })}
              />
              <span className="truncate font-medium text-navy-900">{tReason(r.reason)}</span>
            </label>
            <div className="relative w-28">
              <Input
                type="number"
                inputMode="numeric"
                min={5}
                max={180}
                value={r.durationMinutes}
                disabled={readOnly}
                onChange={(e) => set(i, { durationMinutes: e.target.value })}
                className="pe-12"
                aria-label={t("duration", { reason: tReason(r.reason) })}
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t("min")}</span>
            </div>
            {readOnly ? null : (
              <div className="flex">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("up")}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t("down")}>
                  <ArrowDown />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {readOnly ? null : (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{dirty ? <span className="text-amber-700">{t("unsaved")}</span> : t("hint")}</p>
          <Button onClick={save} disabled={pending || !dirty} className="w-full sm:w-auto">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} {t("save")}
          </Button>
        </div>
      )}
    </div>
  );
}
