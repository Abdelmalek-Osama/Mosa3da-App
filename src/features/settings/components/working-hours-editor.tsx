"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { formatClinicDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveWorkingDaysAction } from "@/features/settings/actions";

export interface Period {
  weekday: number;
  start: string;
  end: string;
}

// The working week in most Arab countries starts on Saturday or Sunday.
const DAYS = [6, 0, 1, 2, 3, 4, 5].map((d) => ({ d }));

/** weekday 0 = Sunday → localized long name (2023-01-01 was a Sunday). */
function dayName(weekday: number, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2023, 0, 1 + weekday)),
  );
}

type Row = Period & { key: number };
type Conflict = { appointment_id: string; clinic_date: string; scheduled_start: string; patient_name: string };
let seq = 0;

function minutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

function validate(rows: Row[], msg: { order: string; overlap: string }): Record<number, string> {
  const errors: Record<number, string> = {};
  for (const r of rows) if (minutes(r.end) <= minutes(r.start)) errors[r.key] = msg.order;
  for (const { d } of DAYS) {
    const day = rows.filter((r) => r.weekday === d).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < day.length; i++) if (day[i]!.start < day[i - 1]!.end) errors[day[i]!.key] = msg.overlap;
  }
  return errors;
}

export function WorkingHoursEditor({ initial, readOnly }: { initial: Period[]; readOnly: boolean }) {
  const router = useRouter();
  const t = useTranslations("settings.hours");
  const locale = useLocale();
  const [rows, setRows] = useState<Row[]>(() => initial.map((p) => ({ ...p, key: ++seq })));
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const errors = useMemo(() => validate(rows, { order: t("errOrder"), overlap: t("errOverlap") }), [rows, t]);
  const hasErrors = Object.keys(errors).length > 0;

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const add = (weekday: number) => {
    const last = rows.filter((r) => r.weekday === weekday).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
    const startAt = last ? last.end : "14:30";
    const endH = Math.min(23, Math.floor(minutes(startAt) / 60) + (last ? 2 : 4));
    update([...rows, { key: ++seq, weekday, start: startAt, end: `${String(endH).padStart(2, "0")}:${startAt.slice(3)}` }]);
  };
  const set = (key: number, field: "start" | "end", value: string) => update(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const remove = (key: number) => update(rows.filter((r) => r.key !== key));

  const save = (force = false) =>
    start(async () => {
      const res = await saveWorkingDaysAction(
        rows.map(({ weekday, start: s, end }) => ({ weekday, start: s, end })),
        force,
      );
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      if (!res.data.saved) {
        // Bookings would end up on closed days / outside hours: ask first.
        setConflicts(res.data.conflicts);
        return;
      }
      setConflicts([]);
      toast.success(t("saved"), { description: t("savedBody") });
      setDirty(false);
      router.refresh();
    });

  const totalHours = rows.reduce((sum, r) => sum + Math.max(0, minutes(r.end) - minutes(r.start)), 0) / 60;

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border">
        {DAYS.map(({ d }) => {
          const en = dayName(d, locale);
          const day = rows.filter((r) => r.weekday === d).sort((a, b) => a.start.localeCompare(b.start));
          return (
            <li key={d} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4">
              <div className="flex items-center justify-between sm:w-40 sm:shrink-0 sm:flex-col sm:items-start sm:pt-1.5">
                <span className="font-medium text-navy-900">{en}</span>
                <span className={cn("text-xs font-medium", day.length ? "text-teal-700" : "text-muted-foreground")}>
                  {day.length ? t("open") : t("closed")}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                {day.map((r) => (
                  <div key={r.key}>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={r.start}
                        onChange={(e) => set(r.key, "start", e.target.value)}
                        disabled={readOnly}
                        className="h-9 w-full min-w-0 px-2 text-sm sm:w-36"
                        aria-label={t("start", { day: en })}
                        dir="ltr"
                        aria-invalid={!!errors[r.key]}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={r.end}
                        onChange={(e) => set(r.key, "end", e.target.value)}
                        disabled={readOnly}
                        className="h-9 w-full min-w-0 px-2 text-sm sm:w-36"
                        aria-label={t("end", { day: en })}
                        dir="ltr"
                        aria-invalid={!!errors[r.key]}
                      />
                      {readOnly ? null : (
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => remove(r.key)} aria-label={t("remove", { day: en })}>
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                    {errors[r.key] ? <p className="mt-1 text-xs text-destructive">{errors[r.key]}</p> : null}
                  </div>
                ))}
                {readOnly ? null : (
                  <Button type="button" variant="outline" size="sm" onClick={() => add(d)} className="h-8">
                    <Plus /> {day.length ? t("addAnother") : t("openDay")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t.rich("total", { hours: totalHours.toFixed(1), b: (c) => <span className="tabular font-medium text-navy-900">{c}</span> })}
          {dirty ? <span className="ms-2 text-amber-700">· {t("unsaved")}</span> : null}
        </p>
        {readOnly ? null : (
          <Button onClick={() => save()} disabled={pending || !dirty || hasErrors} className="w-full sm:w-auto">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} {t("save")}
          </Button>
        )}
      </div>
      <AlertDialog open={conflicts.length > 0} onOpenChange={(open) => !open && !pending && setConflicts([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> {t("conflictTitle", { count: conflicts.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("conflictBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
            {conflicts.map((c) => (
              <li key={c.appointment_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span dir="auto" className="min-w-0 truncate font-medium text-navy-900">{c.patient_name}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {formatClinicDate(c.clinic_date, { year: undefined }, locale as Locale)} · {formatTime(c.scheduled_start, undefined, locale as Locale)}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("conflictBack")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                save(true);
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : null} {t("conflictSaveAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
