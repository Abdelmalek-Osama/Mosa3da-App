"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, CalendarCheck2, CalendarClock, CalendarX2, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { formatClinicDate, formatTime } from "@/lib/format";
import { reasonOptionLabel, useVisitReasons } from "@/features/settings/use-visit-reasons";
import type { BookingCalendar } from "@/server/application/appointments/booking-service";
import { bookAppointmentAction } from "@/features/appointments/actions";
import { FeesDialog, type FeesInfo } from "./fees-dialog";

type Step = "day" | "reason" | "review" | "done";
const STEPS = ["day", "reason", "review"] as const satisfies readonly Exclude<Step, "done">[];

export interface Booked {
  /** Assigned arrival time. */
  slotStart: string;
  clinicDate: string;
}

/**
 * Day-only online booking. The visitor picks a day and a reason; the clinic
 * assigns the earliest free time of that day (first come, first served), so
 * the day fills from the opening time instead of everyone picking late slots.
 */
/**
 * bookedDays: days the visitor already has an active booking on. They stay
 * visible but greyed with an "Already booked" badge; picking one explains how
 * to change the existing booking instead.
 */
export function BookingFlow({ calendar, bookedDays = [] }: { calendar: BookingCalendar; bookedDays?: string[] }) {
  const t = useTranslations("portal.booking");
  const tReason = useTranslations("visitReason");
  const locale = useLocale() as Locale;
  const tz = calendar.timezone;

  // Days found full while booking (another visitor took the last time).
  const [fullDays, setFullDays] = useState<string[]>([]);
  const isFull = (d: { date: string; free: number }) => d.free === 0 || fullDays.includes(d.date);
  const isBooked = (d: { date: string }) => bookedDays.includes(d.date);
  const firstFree = calendar.dates.find((d) => d.free > 0 && !isBooked(d))?.date ?? null;

  const [step, setStep] = useState<Step>("day");
  const [date, setDate] = useState<string | null>(firstFree);
  // Selected option key: a built-in reason, or "custom:<id>" for a doctor-added one.
  const [reason, setReason] = useState<string | null>(null);
  const reasons = useVisitReasons();
  const option = reasons.find((o) => o.key === reason);
  const needsDetails = option?.reason === "other" && !option.details;
  const [details, setDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [fees, setFees] = useState<FeesInfo | null>(null);
  const [submitting, startSubmit] = useTransition();

  const day = (d: string, o: Intl.DateTimeFormatOptions = {}) => formatClinicDate(d, o, locale);
  const selectedDay = calendar.dates.find((d) => d.date === date) ?? null;
  const selectedBooked = !!selectedDay && isBooked(selectedDay);
  const selectedOpen = !!selectedDay && !isFull(selectedDay) && !selectedBooked;
  const anyOpen = calendar.dates.some((d) => !isFull(d) || isBooked(d));

  const submit = () => {
    if (!date || !option) return;
    setSubmitError(null);
    startSubmit(async () => {
      const res = await bookAppointmentAction({
        date,
        visitReason: option.reason,
        visitReasonDetails: option.details ?? (needsDetails ? details : undefined),
        notes,
      });
      if (res.ok) {
        setBooked({ slotStart: res.data.scheduledStart, clinicDate: res.data.clinicDate });
        setFees(res.data.fees);
        setStep("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (res.error.code === "CONFLICT") {
        toast.error(t("dayFullTitle"), { description: t("dayFullBody") });
        setFullDays((f) => [...f, date]);
        setDate(null);
        setStep("day");
        return;
      }
      setSubmitError(res.error.message);
    });
  };

  if (step === "done" && booked) {
    return (
      <>
        <BookingConfirmation booked={booked} timeZone={tz} />
        {fees ? <FeesDialog fees={fees} open onContinue={() => setFees(null)} /> : null}
      </>
    );
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

      {step === "day" ? (
        <section className="space-y-5">
          {calendar.dates.length === 0 || !anyOpen ? (
            <EmptyState title={t("noTimesTitle")} body={t("noTimesBody")} />
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-navy-900">{t("chooseDay")}</h2>
                <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {calendar.dates.map((d) => {
                    const selected = d.date === date;
                    const already = isBooked(d);
                    const full = !already && isFull(d);
                    return (
                      <button
                        key={d.date}
                        type="button"
                        disabled={full}
                        aria-describedby={already ? "booked-day-note" : undefined}
                        onClick={() => setDate(d.date)}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-[4.5rem] shrink-0 snap-start flex-col items-center rounded-2xl border px-2 py-2.5 transition-colors",
                          selected
                            ? "border-navy-900 bg-navy-900 text-white shadow-soft"
                            : "bg-card hover:border-teal-300 hover:bg-teal-50/50",
                          full && "cursor-not-allowed opacity-45 hover:border-border hover:bg-card",
                          already && !selected && "border-dashed bg-muted/70 text-muted-foreground hover:border-border hover:bg-muted/70",
                          already && selected && "border-slate-500 bg-slate-500 text-white",
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
                            already
                              ? selected
                                ? "bg-white/90 text-slate-700"
                                : "bg-slate-200 text-slate-700"
                              : full
                                ? "bg-muted text-muted-foreground"
                                : selected
                                  ? "bg-teal-400 text-navy-950"
                                  : "bg-teal-50 text-teal-800",
                          )}
                        >
                          {already ? t("alreadyBooked") : full ? t("full") : t("open")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {date && selectedDay ? (
                selectedBooked ? (
                  <div id="booked-day-note" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="alert">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                    <div className="min-w-0 space-y-3">
                      <div>
                        <p className="font-semibold text-amber-950">{t("alreadyBookedTitle")}</p>
                        <p className="mt-1 text-sm leading-relaxed text-amber-900">
                          {t("alreadyBookedBody", { date: day(date, { year: undefined }) })}
                        </p>
                      </div>
                      <Button asChild variant="outline" className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100">
                        <Link href="/patient/my-appointments">{t("viewExisting")}</Link>
                      </Button>
                    </div>
                  </div>
                ) : selectedOpen ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4" role="status">
                    <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />
                    <div>
                      <p className="font-semibold text-teal-900">{t("dayAvailable")}</p>
                      <p className="mt-0.5 text-sm text-teal-800">{day(date, { year: undefined })}</p>
                      <p className="mt-2 text-xs text-teal-800/90">{t("autoTimeNote")}</p>
                    </div>
                  </div>
                ) : (
                  <EmptyState title={t("dayFullTitle")} body={t("dayFullBody")} />
                )
              ) : (
                <p className="rounded-2xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">{t("chooseDayHint")}</p>
              )}
            </>
          )}

          <StickyFooter>
            <Button size="lg" className="h-12 w-full rounded-xl" disabled={!date || !selectedOpen} onClick={() => setStep("reason")}>
              {date && selectedOpen ? t("continueOn", { day: day(date, { year: undefined, month: undefined }) }) : t("chooseDay")}
            </Button>
          </StickyFooter>
        </section>
      ) : null}

      {step === "reason" ? (
        <section className="space-y-5">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-navy-900">{t("whatFor")}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("reasonLabel")}>
              {reasons.map((o) => {
                const r = o.key;
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
                      <span className="block text-sm font-medium text-navy-900">{reasonOptionLabel(o, locale, tReason)}</span>
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

          {needsDetails ? (
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
              disabled={!option || (needsDetails && !details.trim())}
              onClick={() => setStep("review")}
            >
              {t("review")}
            </Button>
          </StickyFooter>
        </section>
      ) : null}

      {step === "review" && date && option ? (
        <section className="space-y-5">
          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <dl className="space-y-4 text-sm">
              <ReviewRow label={t("day")} value={day(date)} onEdit={() => setStep("day")} />
              <ReviewRow
                label={t("reason")}
                value={needsDetails ? `${tReason("other")}: ${details}` : reasonOptionLabel(option, locale, tReason)}
                onEdit={() => setStep("reason")}
              />
              {notes.trim() ? <ReviewRow label={t("notesShort")} value={notes.trim()} onEdit={() => setStep("reason")} /> : null}
            </dl>
          </div>

          <ul className="space-y-1.5 rounded-xl bg-muted/60 p-4 text-xs text-muted-foreground">
            <li>• {t("tipAutoTime")}</li>
            <li>• {t("tip1")}</li>
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

/** Only the arrival time: no queue position, nothing to choose. */
export function BookingConfirmation({ booked, timeZone }: { booked: Booked; timeZone: string }) {
  const t = useTranslations("portal.booking");
  const locale = useLocale() as Locale;
  const time = formatTime(booked.slotStart, timeZone, locale);
  return (
    <div className="space-y-6 pt-4 text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-teal-50 ring-8 ring-teal-50/50">
        <CheckCircle2 className="h-11 w-11 text-teal-600" aria-hidden />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{t("bookedTitle")}</h1>
      </div>
      <div className="mx-auto max-w-sm rounded-2xl border bg-card p-5 text-start shadow-soft" data-testid="arrival-card">
        <p className="text-sm text-muted-foreground">{formatClinicDate(booked.clinicDate, {}, locale)}</p>
        <p className="mt-2 text-sm font-medium text-navy-900">{t("arriveAtLabel")}</p>
        <p className="tabular mt-1 flex items-center gap-2 text-3xl font-bold text-navy-900">
          <Clock className="h-6 w-6 text-teal-600" aria-hidden />
          {time}
        </p>
      </div>
      <p className="mx-auto max-w-sm text-sm text-navy-900">{t("bookedBody", { time })}</p>
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

function formatCutoff(minutes: number, t: (key: string, values?: Record<string, number>) => string) {
  return minutes % 60 === 0 ? t("hours", { count: minutes / 60 }) : t("minutesCount", { count: minutes });
}
