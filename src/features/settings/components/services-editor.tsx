"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Pencil, Plus, Save, Trash2, Users } from "lucide-react";
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
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addServiceAction,
  deleteServiceAction,
  setServiceActiveAction,
  setShowFeesToAllAction,
  updateServiceAction,
} from "@/features/settings/service-actions";

export interface ServiceRow {
  id: string;
  nameAr: string;
  nameEn: string | null;
  price: number;
  isActive: boolean;
  sortOrder: number;
}

/**
 * Doctor's services & fees. Shown services and their prices appear in the
 * fees pop-up after a visitor's first online booking, or after every booking
 * when "Show to all visitors" is on.
 */
export function ServicesEditor({ initial, readOnly, showToAll }: { initial: ServiceRow[]; readOnly: boolean; showToAll: boolean }) {
  const router = useRouter();
  const t = useTranslations("settings.services");
  const locale = useLocale() as Locale;
  const [rows, setRows] = useState<ServiceRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  const name = (r: ServiceRow) => (locale === "en" ? r.nameEn || r.nameAr : r.nameAr);

  const toggle = (r: ServiceRow) => {
    setBusyId(r.id);
    start(async () => {
      const res = await setServiceActiveAction(r.id, !r.isActive);
      setBusyId(null);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, isActive: !r.isActive } : x)));
      toast.success(r.isActive ? t("hiddenToast") : t("shownToast"));
      router.refresh();
    });
  };

  const remove = (r: ServiceRow) => {
    setBusyId(r.id);
    start(async () => {
      const res = await deleteServiceAction(r.id);
      setBusyId(null);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setRows((rs) => rs.filter((x) => x.id !== r.id));
      toast.success(t("deleted"));
      router.refresh();
    });
  };

  const upsert = (s: ServiceRow) => {
    setRows((rs) => (rs.some((x) => x.id === s.id) ? rs.map((x) => (x.id === s.id ? s : x)) : [...rs, s]));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <ShowToAllToggle initial={showToAll} readOnly={readOnly} />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((r) => (
            <li key={r.id} className={cn("flex flex-wrap items-center gap-3 p-3", !r.isActive && "opacity-60")}>
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <p dir="auto" className="truncate font-medium text-navy-900">
                  {name(r)}
                </p>
                {locale !== "en" && r.nameEn ? (
                  <p dir="ltr" className="truncate text-start text-xs text-muted-foreground">
                    {r.nameEn}
                  </p>
                ) : null}
              </div>
              <span className="tabular shrink-0 font-semibold text-navy-900 max-sm:me-auto">{formatMoney(r.price, locale)}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  r.isActive ? "bg-teal-50 text-teal-800" : "bg-muted text-muted-foreground",
                )}
              >
                {r.isActive ? t("shown") : t("hidden")}
              </span>
              {readOnly ? null : (
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    disabled={busyId === r.id}
                    onClick={() => toggle(r)}
                    aria-label={r.isActive ? t("hide", { name: name(r) }) : t("show", { name: name(r) })}
                    title={r.isActive ? t("hide", { name: name(r) }) : t("show", { name: name(r) })}
                  >
                    {busyId === r.id ? <Loader2 className="animate-spin" /> : r.isActive ? <EyeOff /> : <Eye />}
                  </Button>
                  <ServiceDialog service={r} onSaved={upsert} />
                  <ConfirmDelete name={name(r)} pending={busyId === r.id} onConfirm={() => remove(r)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ServiceDialog onSaved={upsert} />
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
      )}
    </div>
  );
}

function ServiceDialog({ service, onSaved }: { service?: ServiceRow; onSaved: (s: ServiceRow) => void }) {
  const t = useTranslations("settings.services");
  const editing = !!service;
  const [open, setOpen] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [price, setPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const input = { nameAr, nameEn, price: price === "" ? Number.NaN : Number(price), isActive };
      const res = service ? await updateServiceAction(service.id, input) : await addServiceAction(input);
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
        return;
      }
      onSaved(res.data);
      toast.success(editing ? t("savedToast") : t("addedToast"));
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setNameAr(service?.nameAr ?? "");
          setNameEn(service?.nameEn ?? "");
          setPrice(service ? String(service.price) : "");
          setIsActive(service?.isActive ?? true);
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t("editLabel")} title={t("editLabel")}>
            <Pencil />
          </Button>
        ) : (
          <Button type="button" variant="outline">
            <Plus /> {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("dialogBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="svc-ar">{t("nameAr")}</Label>
            <Input
              id="svc-ar"
              dir="rtl"
              lang="ar"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              maxLength={80}
              placeholder={t("nameArPlaceholder")}
              aria-invalid={!!errors.nameAr}
              autoFocus
            />
            {errors.nameAr ? <p className="text-sm text-destructive">{errors.nameAr[0]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-en">{t("nameEn")}</Label>
            <Input
              id="svc-en"
              dir="ltr"
              lang="en"
              className="text-start"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              maxLength={80}
              placeholder="Consultation"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-price">{t("price")}</Label>
            {/* Currency is a separate addon after the number (end side in both directions), never on top of it. */}
            <div
              className={cn(
                "flex h-10 w-48 items-stretch overflow-hidden rounded-md border border-input bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring",
                errors.price && "border-destructive",
              )}
            >
              <input
                id="svc-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="tabular min-w-0 flex-1 bg-transparent px-3 text-start text-base outline-none placeholder:text-muted-foreground md:text-sm"
                placeholder="0"
                aria-invalid={!!errors.price}
                aria-describedby="svc-price-currency"
              />
              <span
                id="svc-price-currency"
                className="flex shrink-0 select-none items-center border-s border-input bg-muted px-3 text-xs font-semibold text-muted-foreground"
              >
                {t("currency")}
              </span>
            </div>
            {errors.price ? <p className="text-sm text-destructive">{errors.price[0]}</p> : null}
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {t("showInList")}
          </label>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <Plus />} {editing ? t("save") : t("addSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDelete({ name, pending, onConfirm }: { name: string; pending: boolean; onConfirm: () => void }) {
  const t = useTranslations("settings.services");
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          aria-label={t("delete", { name })}
          title={t("delete", { name })}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteBody", { name })}</AlertDialogDescription>
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

/** Global switch: fees pop-up after every booking instead of the first one only. */
function ShowToAllToggle({ initial, readOnly }: { initial: boolean; readOnly: boolean }) {
  const t = useTranslations("settings.services");
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setShowFeesToAllAction(next);
      if (!res.ok) {
        setOn(!next);
        toast.error(res.error.message);
        return;
      }
      toast.success(next ? t("showAllOnToast") : t("showAllOffToast"));
      router.refresh();
    });
  };

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", on ? "border-teal-200 bg-teal-50/50" : "bg-muted/30")}>
      <Users className={cn("mt-0.5 h-5 w-5 shrink-0", on ? "text-teal-700" : "text-muted-foreground")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p id="fees-all-label" className="font-medium text-navy-900">
          {t("showAll")}
        </p>
        <p id="fees-all-help" className="mt-0.5 text-sm text-muted-foreground">
          {t("showAllHelp")}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="fees-all-label"
        aria-describedby="fees-all-help"
        disabled={readOnly || pending}
        onClick={toggle}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
          on ? "bg-teal-600" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-[1.375rem] rtl:-translate-x-[1.375rem]" : "translate-x-0.5 rtl:-translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
