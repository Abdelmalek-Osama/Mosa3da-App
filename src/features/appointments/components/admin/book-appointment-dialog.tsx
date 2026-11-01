"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { searchPatientsAction } from "@/features/queue/actions";
import { staffBookAppointmentAction, staffGetSlotsAction } from "@/features/appointments/staff-actions";
import { formatClinicDate, formatPhone, formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { VISIT_REASONS, type VisitReason } from "@/server/domain/queue/constants";
import type { Slot } from "@/server/application/appointments/booking-service";

interface PatientRef {
  id: string;
  fullName: string;
  phone: string;
}

type Errors = Record<string, string[] | undefined>;

export function BookAppointmentDialog({
  timezone,
  today,
  defaultDate,
  patient: fixedPatient,
  trigger,
}: {
  timezone: string;
  today: string;
  defaultDate?: string;
  patient?: PatientRef;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("appointments.book");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<PatientRef | null>(fixedPatient ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState(defaultDate && defaultDate >= today ? defaultDate : today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [reason, setReason] = useState<VisitReason | "">("");
  const [details, setDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, start] = useTransition();

  function reset() {
    setPatient(fixedPatient ?? null);
    setQuery("");
    setResults([]);
    setDate(defaultDate && defaultDate >= today ? defaultDate : today);
    setSlotStart(null);
    setReason("");
    setDetails("");
    setNotes("");
    setErrors({});
  }

  useEffect(() => {
    if (!open || patient || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      const res = await searchPatientsAction(query);
      setSearching(false);
      if (res.ok) setResults(res.data);
    }, 250);
    return () => clearTimeout(id);
  }, [query, patient, open]);

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    setSlots(null);
    setSlotError(null);
    setSlotStart(null);
    staffGetSlotsAction(date).then((res) => {
      if (cancelled) return;
      if (res.ok) setSlots(res.data);
      else setSlotError(res.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [date, open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!patient) local.patientId = [t("errPatient")];
    if (!slotStart) local.slotStart = [t("errTime")];
    if (!reason) local.visitReason = [t("errReason")];
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    start(async () => {
      const res = await staffBookAppointmentAction({
        patientId: patient!.id,
        slotStart: slotStart!,
        visitReason: reason as VisitReason,
        visitReasonDetails: reason === "other" ? details : undefined,
        notes,
      });
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
        if (res.error.code === "CONFLICT") staffGetSlotsAction(date).then((r) => r.ok && setSlots(r.data));
        return;
      }
      toast.success(t("booked"), {
        description: t("bookedBody", {
          name: patient!.fullName,
          date: formatClinicDate(res.data.clinic_date, { year: undefined }, locale),
          time: formatTime(res.data.scheduled_start, timezone, locale),
        }),
      });
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  const free = slots?.filter((s) => s.available) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <CalendarPlus /> {t("trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="ba-search">{t("patient")}</Label>
            {patient ? (
              <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-accent/60 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{patient.fullName}</div>
                  <div className="tabular text-xs text-muted-foreground">{formatPhone(patient.phone)}</div>
                </div>
                {fixedPatient ? null : (
                  <Button type="button" size="icon" variant="ghost" onClick={() => setPatient(null)} aria-label={t("change")}>
                    <X />
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="ba-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className="ps-9" autoComplete="off" aria-invalid={!!errors.patientId} />
                  {searching ? <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
                </div>
                {results.length ? (
                  <ul className="max-h-44 overflow-y-auto rounded-lg border">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setPatient(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start text-sm hover:bg-muted">
                          <span className="truncate font-medium">{p.fullName}</span>
                          <span className="tabular shrink-0 text-xs text-muted-foreground">{formatPhone(p.phone)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query.trim().length >= 2 && !searching ? (
                  <p className="text-xs text-muted-foreground">{t("noMatch")}</p>
                ) : null}
                {errors.patientId ? <p className="text-sm text-destructive">{errors.patientId[0]}</p> : null}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ba-date">{t("date")}</Label>
            <Input id="ba-date" type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-full sm:w-56" />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label>{t("time")}</Label>
              {slots ? <span className="text-xs text-muted-foreground">{t("free", { count: free.length })}</span> : null}
            </div>
            {slotError ? (
              <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{slotError}</p>
            ) : !slots ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">{t("closed")}</p>
            ) : free.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">{t("noFree")}</p>
            ) : (
              <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setSlotStart(s.start)}
                    aria-pressed={s.start === slotStart}
                    className={cn(
                      "tabular h-10 rounded-lg border text-sm font-medium transition-colors",
                      s.start === slotStart ? "border-teal-600 bg-teal-600 text-white" : "bg-card hover:border-teal-400 hover:bg-teal-50",
                      !s.available && "cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground line-through hover:border-border hover:bg-muted/40",
                    )}
                  >
                    {formatTime(s.start, timezone, locale)}
                  </button>
                ))}
              </div>
            )}
            {errors.slotStart ? <p className="text-sm text-destructive">{errors.slotStart[0]}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("reason")}</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as VisitReason)}>
                <SelectTrigger aria-invalid={!!errors.visitReason}>
                  <SelectValue placeholder={t("selectReason")} />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tReason(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.visitReason ? <p className="text-sm text-destructive">{errors.visitReason[0]}</p> : null}
            </div>
            {reason === "other" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ba-details">{t("describe")}</Label>
                <Input id="ba-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={200} aria-invalid={!!errors.visitReasonDetails} />
                {errors.visitReasonDetails ? <p className="text-sm text-destructive">{errors.visitReasonDetails[0]}</p> : null}
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ba-notes">{t("notes")}</Label>
              <Textarea id="ba-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
