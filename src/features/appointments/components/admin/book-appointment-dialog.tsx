"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarPlus, Loader2, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PhoneInput } from "@/components/shared/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { searchPatientsAction } from "@/features/queue/actions";
import { staffBookAppointmentAction, staffGetSlotsAction, staffRescheduleAppointmentAction } from "@/features/appointments/staff-actions";
import { createPatientAction } from "@/features/patients/staff-actions";
import { formatClinicDate, formatPhone, formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { reasonOptionLabel, useVisitReasons } from "@/features/settings/use-visit-reasons";
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
  reschedule,
}: {
  timezone: string;
  today: string;
  defaultDate?: string;
  patient?: PatientRef;
  trigger?: React.ReactNode;
  /** Move this existing booking to a new free time instead of booking (P1-08). */
  reschedule?: { appointmentId: string; clinicDate: string; currentStart: string };
}) {
  const router = useRouter();
  const t = useTranslations("appointments.book");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const reasons = useVisitReasons(open && !reschedule);
  const [patient, setPatient] = useState<PatientRef | null>(fixedPatient ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientRef[]>([]);
  const [searching, setSearching] = useState(false);
  const initialDate = reschedule ? reschedule.clinicDate : defaultDate;
  const [date, setDate] = useState(initialDate && initialDate >= today ? initialDate : today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  // Selected option key: a built-in reason, or "custom:<id>" for a doctor-added one.
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const option = reasons.find((o) => o.key === reason);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, start] = useTransition();
  // "New visitor" tab: register her inline, then book (P1-08).
  const [newVisitor, setNewVisitor] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [formKey, setFormKey] = useState(0);

  function reset() {
    setNewVisitor(false);
    setNewName("");
    setNewNameEn("");
    setNewPhone("");
    setFormKey((k) => k + 1);
    setPatient(fixedPatient ?? null);
    setQuery("");
    setResults([]);
    setDate(initialDate && initialDate >= today ? initialDate : today);
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
    if (!patient && !newVisitor) local.patientId = [t("errPatient")];
    if (!slotStart) local.slotStart = [t("errTime")];
    if (!option && !reschedule) local.visitReason = [t("errReason")];
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    if (reschedule) {
      start(async () => {
        const res = await staffRescheduleAppointmentAction({ appointmentId: reschedule.appointmentId, slotStart: slotStart! });
        if (!res.ok) {
          toast.error(res.error.message);
          if (res.error.code === "CONFLICT") staffGetSlotsAction(date).then((r) => r.ok && setSlots(r.data));
          return;
        }
        toast.success(t("rescheduled"), {
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
      return;
    }
    start(async () => {
      let target = patient;
      if (!target) {
        const created = await createPatientAction({
          fullName: newName,
          fullNameEn: newNameEn,
          phone: newPhone,
          email: "",
          dateOfBirth: "",
          preferredLocale: "ar",
        });
        if (!created.ok) {
          setErrors(created.error.fieldErrors ?? {});
          toast.error(created.error.message);
          return;
        }
        target = { id: created.data.id, fullName: newName.trim().replace(/\s+/g, " "), phone: newPhone };
        setPatient(target);
        setNewVisitor(false);
      }
      const res = await staffBookAppointmentAction({
        patientId: target.id,
        slotStart: slotStart!,
        visitReason: option!.reason,
        visitReasonDetails: option!.details ?? (option!.reason === "other" ? details : undefined),
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
          name: target.fullName,
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
          <DialogTitle>{reschedule ? t("rescheduleTitle") : t("title")}</DialogTitle>
          <DialogDescription>
            {reschedule
              ? t("rescheduleBody", { current: `${formatClinicDate(reschedule.clinicDate, { year: undefined }, locale)} · ${formatTime(reschedule.currentStart, timezone, locale)}` })
              : t("body")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="ba-search">{t("patient")}</Label>
            {!fixedPatient && !patient ? (
              <RadioGroup
                value={newVisitor ? "new" : "existing"}
                onValueChange={(v) => {
                  setNewVisitor(v === "new");
                  setErrors({});
                }}
                className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
                aria-label={t("patient")}
              >
                <RadioGroupItem value="existing">{t("existingVisitor")}</RadioGroupItem>
                <RadioGroupItem value="new">{t("newVisitor")}</RadioGroupItem>
              </RadioGroup>
            ) : null}
            {!patient && newVisitor ? (
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ba-new-name">{t("newName")}</Label>
                  <Input id="ba-new-name" dir="rtl" lang="ar" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("newNamePlaceholder")} autoComplete="off" aria-invalid={!!errors.fullName} />
                  {errors.fullName ? <p className="text-sm text-destructive">{errors.fullName[0]}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ba-new-name-en">{t("newNameEn")}</Label>
                  <Input id="ba-new-name-en" dir="ltr" lang="en" className="text-start" value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} placeholder="e.g. Sara Ahmed Hassan" autoComplete="off" aria-invalid={!!errors.fullNameEn} />
                  {errors.fullNameEn ? <p className="text-sm text-destructive">{errors.fullNameEn[0]}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ba-new-phone">{t("newPhone")}</Label>
                  <PhoneInput key={formKey} id="ba-new-phone" defaultValue={newPhone} onChange={setNewPhone} invalid={!!errors.phone} />
                  {errors.phone ? <p className="text-sm text-destructive">{errors.phone[0]}</p> : null}
                </div>
              </div>
            ) : patient ? (
              <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-accent/60 px-3 py-2.5">
                <div className="min-w-0">
                  <div dir="auto" className="truncate text-start font-medium">{patient.fullName}</div>
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
                          <span dir="auto" className="truncate font-medium">{p.fullName}</span>
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
              <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
                {slots.map((s) =>
                  !s.available && s.bookedBy ? (
                    // Booked: locked, shows who holds it, and explains instead of selecting.
                    <button
                      key={s.start}
                      type="button"
                      onClick={() => toast.error(t("slotTaken", { name: s.bookedBy! }))}
                      aria-disabled
                      title={t("slotTaken", { name: s.bookedBy })}
                      className="flex min-h-10 cursor-not-allowed flex-col items-center justify-center rounded-lg border border-dashed bg-muted/60 px-1 py-1 text-muted-foreground"
                    >
                      <span className="tabular text-xs font-medium line-through">{formatTime(s.start, timezone, locale)}</span>
                      <span className="text-[10px] font-semibold uppercase">{t("booked")}</span>
                      <span dir="auto" className="w-full truncate text-[10px]">{s.bookedBy}</span>
                    </button>
                  ) : (
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
                  ),
                )}
              </div>
            )}
            {errors.slotStart ? <p className="text-sm text-destructive">{errors.slotStart[0]}</p> : null}
          </div>

          {reschedule ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("reason")}</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger aria-invalid={!!errors.visitReason}>
                  <SelectValue placeholder={t("selectReason")} />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {reasonOptionLabel(o, locale, tReason)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.visitReason ? <p className="text-sm text-destructive">{errors.visitReason[0]}</p> : null}
            </div>
            {option?.reason === "other" && !option.details ? (
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
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : reschedule ? <CalendarClock /> : <CalendarPlus />}
              {reschedule ? t("rescheduleSubmit") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
