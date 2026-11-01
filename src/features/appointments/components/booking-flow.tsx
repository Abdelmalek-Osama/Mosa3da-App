"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, CalendarCheck2, CalendarX2, CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { formatClinicDate, formatTime } from "@/lib/format";
import { VISIT_REASONS, type VisitReason } from "@/server/domain/queue/constants";
import type { BookingCalendar, Slot } from "@/server/application/appointments/booking-service";
import { bookAppointmentAction, getSlotsAction } from "@/features/appointments/actions";

type Step = "time" | "reason" | "review" | "done";
const STEPS = ["time", "reason", "review"] as const satisfies readonly Exclude<Step, "done">[];

export interface Booked {
  slotStart: string;
  clinicDate: string;
  reason: VisitReason;
}

export function BookingFlow({
  calendar,
  initialSlots,
}: {
  calendar: BookingCalendar;
  /** Slots for the first bookable day, prefetched on the server. */
  initialSlots?: { date: string; slots: Slot[] } | null;
}) {
  const t = useTranslations("portal.booking");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;
  const tz = calendar.timezone;
  const firstFree = initialSlots?.date ?? calendar.dates.find((d) => d.free > 0)?.date ?? null;

  const [step, setStep] = useState<Step>("time");
  const [date, setDate] = useState<string | null>(firstFree);
  const [slots, setSlots] = useState<Slot[] | null>(initialSlots?.date === firstFree ? initialSlots.slots : null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [reason, setReason] = useState<VisitReason | null>(null);
  const [details, setDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [loadingSlots, startSlots] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const loadSlots = (d: string) => {
    setSlotError(null);
    setSlots(null);
    startSlots(async () => {
      const res = await getSlotsAction(d);
      if (res.ok) setSlots(res.data);
      else setSlotError(res.error.message);
    });
  };

  // Tracks which day the slot list belongs to (StrictMode-safe: effects may run twice).
  const loadedDate = useRef<string | null>(slots ? firstFree : null);
  useEffect(() => {
    if (!date || date === loadedDate.current) return;
    loadedDate.current = date;
    loadSlots(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const grouped = useMemo(() => groupByPeriod(slots ?? [], tz), [slots, tz]);
  const time = (iso: string) => formatTime(iso, tz, locale);
  const day = (d: string, o: Intl.DateTimeFormatOptions = {}) => formatClinicDate(d, o, locale);
  const freeCount = slots?.filter((s) => s.available).length ?? 0;

  const submit = () => {
    if (!slotStart || !reason) return;
    setSubmitError(null);
    startSubmit(async () => {
      const res = await bookAppointmentAction({
        slotStart,
        visitReason: reason,
        visitReasonDetails: reason === "other" ? details : undefined,
        notes,
      });
      if (res.ok) {
        setBooked({ slotStart: res.data.scheduled_start, clinicDate: res.data.clinic_date, reason });
        setStep("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (res.error.code === "CONFLICT") {
        toast.error(t("takenTitle"), { description: t("takenBody") });
        setSlotStart(null);
        setStep("time");
        if (date) loadSlots(date);
        return;
      }
      setSubmitError(res.error.message);
    });
  };

  if (step === "done" && booked) {
    return <BookingConfirmation booked={booked} timeZone={tz} />;
  }

  const stepIndex = STEPS.findIndex((s) => s === step);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {stepIndex > 0 ? (
          <Button variant="ghost" size="icon" onClick={() => setStep(STEPS[stepIndex - 1]!)} aria-label={t("back")}>
            <ArrowLeft className="rtl:-scale-x-100" />
          </Button>
        ) : null}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-navy-900">{t("title")}</h1>
        </div>
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label={t("steps")}>
        {STEPS.map((s, i) => (
          <li key={s} className="space-y-1.5">
            <div className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-teal-500" : "bg-muted")} />
            <p className={cn("text-xs", i === stepIndex ? "font-semibold text-navy-900" : "text-muted-foreground")}>
              {i + 1}. {t(`step.${s}`)}
            </p>
          </li>
        ))}
      </ol>

      {step === "time" ? (
        <section className="space-y-5">
          {calendar.dates.length === 0 || !firstFree ? (
            <EmptyState
              title={t("noTimesTitle")}
              body={t("noTimesBody")}
            />
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-navy-900">{t("chooseDay")}</h2>
                <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {calendar.dates.map((d) => {
                    const selected = d.date === date;
                    const full = d.free === 0;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        disabled={full}
                        onClick={() => {
                          setDate(d.date);
                          setSlotStart(null);
                        }}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-[4.5rem] shrink-0 snap-start flex-col items-center rounded-2xl border px-2 py-2.5 transition-colors",
                          selected
                            ? "border-navy-900 bg-navy-900 text-white shadow-soft"
                            : "bg-card hover:border-teal-300 hover:bg-teal-50/50",
                          full && "cursor-not-allowed opacity-45 hover:border-border hover:bg-card",
                        )}
                      >
                        <span className={cn("text-[11px] font-medium uppercase", selected ? "text-navy-200" : "text-muted-foreground")}>
                          {day(d.date, { weekday: "short", day: undefined, month: undefined, year: undefined })}
                        </span>
                        <span className="tabular text-xl font-bold leading-tight">{Number(d.date.slice(8))}</span>
                        <span className={cn("text-[11px]", selected ? "text-navy-200" : "text-muted-foreground")}>
                          {day(d.date, { weekday: undefined, day: undefined, month: "short", year: undefined })}
                        </span>
                        <span
                          className={cn(
                            "mt-1 rounded-full px-1.5 text-[10px] font-semibold",
                            full ? "bg-muted text-muted-foreground" : selected ? "bg-teal-400 text-navy-950" : "bg-teal-50 text-teal-800",
                          )}
                        >
                          {full ? t("full") : t("free", { count: d.free })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-navy-900">
                    {date ? day(date, { year: undefined }) : t("chooseTime")}
                  </h2>
                  {slots ? <span className="text-xs text-muted-foreground">{t("available", { count: freeCount })}</span> : null}
                </div>

                {loadingSlots || (!slots && !slotError) ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded-xl" />
                    ))}
                  </div>
                ) : slotError ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {slotError}
                    <Button variant="outline" size="sm" className="ms-3" onClick={() => date && loadSlots(date)}>
                      <RefreshCw /> {t("retry")}
                    </Button>
                  </div>
                ) : freeCount === 0 ? (
                  <EmptyState title={t("dayFullTitle")} body={t("dayFullBody")} />
                ) : (
                  <div className="space-y-4">
                    {grouped.map((g) => (
                      <div key={g.label}>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t(`period.${g.label}`)}</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {g.slots.map((s) => {
                            const selected = s.start === slotStart;
                            return (
                              <button
                                key={s.start}
                                type="button"
                                disabled={!s.available}
                                onClick={() => setSlotStart(s.start)}
                                aria-pressed={selected}
                                className={cn(
                                  "tabular h-12 rounded-xl border text-sm font-semibold transition-colors",
                                  selected
                                    ? "border-teal-600 bg-teal-600 text-white shadow-soft"
                                    : "bg-card text-navy-900 hover:border-teal-400 hover:bg-teal-50",
                                  !s.available && "cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground line-through hover:border-border hover:bg-muted/40",
                                )}
                              >
                                {time(s.start)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <StickyFooter>
            <Button size="lg" className="h-12 w-full rounded-xl" disabled={!slotStart} onClick={() => setStep("reason")}>
              {slotStart ? t("continueAt", { time: time(slotStart) }) : t("chooseTime")}
            </Button>
          </StickyFooter>
        </section>
      ) : null}

      {step === "reason" ? (
        <section className="space-y-5">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-navy-900">{t("whatFor")}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("reasonLabel")}>
              {VISIT_REASONS.map((r) => {
                const selected = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setReason(r)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-start transition-colors",
                      selected ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600" : "hover:border-teal-300",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-navy-900">{tReason(r)}</span>
                    </span>
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                        selected ? "border-teal-600 bg-teal-600" : "border-input",
                      )}
                      aria-hidden
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {reason === "other" ? (
            <div className="space-y-1.5">
              <Label htmlFor="details">{t("describe")}</Label>
              <Input id="details" value={details} maxLength={200} onChange={(e) => setDetails(e.target.value)} placeholder={t("describePlaceholder")} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="notes">
              {t("notes")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
            </Label>
            <Textarea
              id="notes"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("notesPrivate")}</p>
          </div>

          <StickyFooter>
            <Button
              size="lg"
              className="h-12 w-full rounded-xl"
              disabled={!reason || (reason === "other" && !details.trim())}
              onClick={() => setStep("review")}
            >
              {t("review")}
            </Button>
          </StickyFooter>
        </section>
      ) : null}

      {step === "review" && slotStart && reason ? (
        <section className="space-y-5">
          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <dl className="space-y-4 text-sm">
              <ReviewRow label={t("day")} value={day(date ?? "")} onEdit={() => setStep("time")} />
              <ReviewRow
                label={t("time")}
                value={t("timeValue", { time: time(slotStart), minutes: calendar.durationMinutes })}
                onEdit={() => setStep("time")}
              />
              <ReviewRow
                label={t("reason")}
                value={reason === "other" ? `${tReason("other")}: ${details}` : tReason(reason)}
                onEdit={() => setStep("reason")}
              />
              {notes.trim() ? <ReviewRow label={t("notesShort")} value={notes.trim()} onEdit={() => setStep("reason")} /> : null}
            </dl>
          </div>

          <ul className="space-y-1.5 rounded-xl bg-muted/60 p-4 text-xs text-muted-foreground">
            <li>• {t("tip1")}</li>
            <li>• {t("tip2")}</li>
            <li>• {t("tip3", { cutoff: formatCutoff(calendar.cancellationCutoffMinutes, t) })}</li>
          </ul>

          {submitError ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {submitError}
            </p>
          ) : null}

          <StickyFooter>
            <Button size="lg" className="h-12 w-full rounded-xl" disabled={submitting} onClick={submit}>
              {submitting ? <Loader2 className="animate-spin" /> : <CalendarCheck2 />}
              {submitting ? t("booking") : t("confirm")}
            </Button>
          </StickyFooter>
        </section>
      ) : null}
    </div>
  );
}

export function BookingConfirmation({ booked, timeZone }: { booked: Booked; timeZone: string }) {
  const t = useTranslations("portal.booking");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;
  return (
    <div className="space-y-6 pt-4 text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-teal-50 ring-8 ring-teal-50/50">
        <CheckCircle2 className="h-11 w-11 text-teal-600" aria-hidden />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t("bookedTitle")}</h1>
      </div>
      <div className="mx-auto max-w-sm rounded-2xl border bg-card p-5 text-start shadow-soft">
        <p className="text-sm text-muted-foreground">{formatClinicDate(booked.clinicDate, {}, locale)}</p>
        <p className="tabular mt-1 flex items-center gap-2 text-3xl font-bold text-navy-900">
          <Clock className="h-6 w-6 text-teal-600" aria-hidden />
          {formatTime(booked.slotStart, timeZone, locale)}
        </p>
        <p className="mt-2 text-sm">{tReason(booked.reason)}</p>
      </div>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">
        {t("bookedBody")}
      </p>
      <div className="mx-auto grid max-w-sm gap-2">
        <Button asChild size="lg" className="h-12 rounded-xl">
          <Link href="/patient/dashboard">{t("goDashboard")}</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-12 rounded-xl">
          <Link href="/patient/my-appointments">{t("viewAppointments")}</Link>
        </Button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const t = useTranslations("portal.booking");
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words font-medium text-navy-900">{value}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-sm font-medium text-teal-700 hover:underline">
        {t("edit")}
      </button>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
      <CalendarX2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="mt-2 font-medium text-navy-900">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function StickyFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-20 z-20 -mx-4 bg-gradient-to-t from-background via-background to-background/0 px-4 pb-2 pt-4">
      {children}
    </div>
  );
}

function groupByPeriod(slots: Slot[], timeZone: string) {
  const hourOf = (iso: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso)));
  const groups = [
    { label: "morning", slots: [] as Slot[] },
    { label: "afternoon", slots: [] as Slot[] },
    { label: "evening", slots: [] as Slot[] },
  ];
  for (const s of slots) {
    const h = hourOf(s.start);
    groups[h < 12 ? 0 : h < 17 ? 1 : 2]!.slots.push(s);
  }
  return groups.filter((g) => g.slots.length > 0);
}

function formatCutoff(minutes: number, t: (key: string, values?: Record<string, number>) => string) {
  return minutes % 60 === 0 ? t("hours", { count: minutes / 60 }) : t("minutesCount", { count: minutes });
}
