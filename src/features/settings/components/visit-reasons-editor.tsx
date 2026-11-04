"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { addVisitReasonAction, deleteVisitReasonAction, saveVisitReasonsAction } from "@/features/settings/visit-reason-actions";
import type { VisitReason } from "@/server/domain/queue/constants";

type Row =
  | { kind: "builtin"; key: string; reason: VisitReason; durationMinutes: string; isActive: boolean }
  | { kind: "custom"; key: string; id: string; labelAr: string; labelEn: string | null; durationMinutes: string; isActive: boolean };

/**
 * Doctor's list of visit reasons: expected duration, whether reception and the
 * portal offer it, order, plus adding new reasons and deleting added ones.
 * Built-in reasons can only be hidden. Reception never picks a duration by hand.
 */
export function VisitReasonsEditor({
  initial,
  custom,
  readOnly,
}: {
  initial: { reason: VisitReason; durationMinutes: number; isActive: boolean; sortOrder: number }[];
  custom: { id: string; labelAr: string; labelEn: string | null; durationMinutes: number; isActive: boolean; sortOrder: number }[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("settings.reasons");
  const tReason = useTranslations("visitReason");
  const locale = useLocale();
  const [rows, setRows] = useState<Row[]>(() =>
    [
      ...initial.map((r) => ({ order: r.sortOrder, row: { kind: "builtin" as const, key: r.reason, reason: r.reason, durationMinutes: String(r.durationMinutes), isActive: r.isActive } })),
      ...custom.map((c) => ({
        order: c.sortOrder,
        row: { kind: "custom" as const, key: `custom:${c.id}`, id: c.id, labelAr: c.labelAr, labelEn: c.labelEn, durationMinutes: String(c.durationMinutes), isActive: c.isActive },
      })),
    ]
      .sort((a, b) => a.order - b.order)
      .map((x) => x.row),
  );
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const label = (r: Row) => (r.kind === "builtin" ? tReason(r.reason) : locale === "en" ? r.labelEn || r.labelAr : r.labelAr);
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
  const set = (i: number, patch: Partial<Pick<Row, "durationMinutes" | "isActive">>) =>
    update(rows.map((r, k) => (k === i ? ({ ...r, ...patch } as Row) : r)));

  const save = () =>
    start(async () => {
      const res = await saveVisitReasonsAction({
        builtin: rows.flatMap((r, i) =>
          r.kind === "builtin" ? [{ reason: r.reason, durationMinutes: Number(r.durationMinutes), isActive: r.isActive, sortOrder: i + 1 }] : [],
        ),
        custom: rows.flatMap((r, i) =>
          r.kind === "custom" ? [{ id: r.id, durationMinutes: Number(r.durationMinutes), isActive: r.isActive, sortOrder: i + 1 }] : [],
        ),
      });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t("saved"));
      setDirty(false);
      router.refresh();
    });

  const removeCustom = (id: string) =>
    start(async () => {
      const res = await deleteVisitReasonAction(id);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setRows((rs) => rs.filter((r) => !(r.kind === "custom" && r.id === id)));
      toast.success(t("deleted"));
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border">
        {rows.map((r, i) => (
          <li key={r.key} className={cn("flex flex-wrap items-center gap-3 p-3", !r.isActive && "opacity-60")}>
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal-600"
                checked={r.isActive}
                disabled={readOnly}
                onChange={(e) => set(i, { isActive: e.target.checked })}
                aria-label={t("offered", { reason: label(r) })}
              />
              <span dir="auto" className="truncate font-medium text-navy-900">
                {label(r)}
              </span>
              {r.kind === "custom" ? <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800">{t("added")}</span> : null}
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
                aria-label={t("duration", { reason: label(r) })}
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t("min")}</span>
            </div>
            {readOnly ? null : (
              <div className="flex items-center">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("up")}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={t("down")}>
                  <ArrowDown />
                </Button>
                {r.kind === "custom" ? (
                  <ConfirmDelete name={label(r)} pending={pending} onConfirm={() => removeCustom(r.id)} />
                ) : (
                  <span className="h-9 w-9" aria-hidden />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {readOnly ? null : (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <AddReasonDialog
            onAdded={(c) => {
              setRows((rs) => [
                ...rs,
                { kind: "custom", key: `custom:${c.id}`, id: c.id, labelAr: c.labelAr, labelEn: c.labelEn, durationMinutes: String(c.durationMinutes), isActive: c.isActive },
              ]);
              router.refresh();
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">{dirty ? <span className="text-amber-700">{t("unsaved")}</span> : t("hint")}</p>
            <Button onClick={save} disabled={pending || !dirty} className="w-full sm:w-auto">
              {pending ? <Loader2 className="animate-spin" /> : <Save />} {t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmDelete({ name, pending, onConfirm }: { name: string; pending: boolean; onConfirm: () => void }) {
  const t = useTranslations("settings.reasons");
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label={t("delete", { reason: name })}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteBody", { reason: name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            <Trash2 /> {t("deleteConfirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AddReasonDialog({
  onAdded,
}: {
  onAdded: (c: { id: string; labelAr: string; labelEn: string | null; durationMinutes: number; isActive: boolean }) => void;
}) {
  const t = useTranslations("settings.reasons");
  const [open, setOpen] = useState(false);
  const [labelAr, setLabelAr] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [duration, setDuration] = useState("20");
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await addVisitReasonAction({ labelAr, labelEn, durationMinutes: Number(duration) });
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
        return;
      }
      onAdded(res.data);
      toast.success(t("addedToast"));
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setLabelAr("");
          setLabelEn("");
          setDuration("20");
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Plus /> {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="vr-ar">{t("nameAr")}</Label>
            <Input id="vr-ar" dir="rtl" lang="ar" value={labelAr} onChange={(e) => setLabelAr(e.target.value)} maxLength={80} aria-invalid={!!errors.labelAr} autoFocus />
            {errors.labelAr ? <p className="text-sm text-destructive">{errors.labelAr[0]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vr-en">{t("nameEn")}</Label>
            <Input id="vr-en" dir="ltr" lang="en" className="text-start" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vr-min">{t("defaultDuration")}</Label>
            <div className="relative w-32">
              <Input id="vr-min" type="number" inputMode="numeric" min={5} max={180} value={duration} onChange={(e) => setDuration(e.target.value)} className="pe-12" aria-invalid={!!errors.durationMinutes} />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t("min")}</span>
            </div>
            {errors.durationMinutes ? <p className="text-sm text-destructive">{errors.durationMinutes[0]}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} {t("addSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
