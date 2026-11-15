"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { BrandMark } from "@/components/shared/brand";
import { cn } from "@/lib/utils";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import type { DisplayBoard } from "@/features/queue/schemas";

const POLL_MS = 5_000;
const STALE_AFTER_MS = 20_000;
/** Rows rendered before fitting; the auto-fit below hides any that still do not fit. */
const MAX_RENDER = 40;
/** The board shrinks in steps down to this fraction before rows are hidden ("+N more"). */
const MIN_FIT = 0.7;
const FIT_STEP = 0.05;

// useLayoutEffect warns during server rendering; the board only measures in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Lang = "ar" | "en";

/**
 * Waiting-room TV. Reads only the public /api/display payload (queue numbers,
 * names, expected times, today's booking slots); no phone numbers, notes or
 * visit reasons ever reach this page.
 *
 * Layout (P2-16): 100% Arabic by default so numbers and names can be as large
 * as possible; staff can switch it live to a two-column layout (Arabic RTL on
 * the right, English LTR on the left).
 *
 * Fits any monitor or TV at 100% browser zoom: every size is in em of one base
 * size taken from the smaller of the screen's width and height, and if the
 * list still overflows the whole board shrinks step by step (to 70%), then
 * hides whole rows behind "+N more" instead of clipping them.
 */
export function DisplayBoardView({ initial }: { initial: DisplayBoard | null }) {
  const [board, setBoard] = useState<DisplayBoard | null>(initial);
  const [lastOk, setLastOk] = useState<number>(() => (initial ? Date.now() : 0));
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);
  const currentNumber = useRef(initial?.current?.queue_number ?? null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/display", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as DisplayBoard;
      const n = next.current?.queue_number ?? null;
      if (n !== null && n !== currentNumber.current) {
        setFlash(true);
        setTimeout(() => setFlash(false), 6_000);
      }
      currentNumber.current = n;
      setBoard(next);
      setLastOk(Date.now());
    } catch {
      /* keep the last good board; the stale banner explains it */
    }
  }, []);

  useEffect(() => {
    const p = setInterval(poll, POLL_MS);
    const c = setInterval(() => setNow(Date.now()), 1_000);
    if (!initial) void poll();
    return () => {
      clearInterval(p);
      clearInterval(c);
    };
  }, [poll, initial]);

  const tz = board?.clinic.timezone ?? DEFAULT_TIMEZONE;
  const bilingual = board?.clinic.bilingual ?? false;
  const langs: Lang[] = bilingual ? ["ar", "en"] : ["ar"];
  const stale = !lastOk || now - lastOk > STALE_AFTER_MS;
  const empty = !board || (!board.session_open && !board.current && board.waiting.length === 0 && (board.booked?.length ?? 0) === 0);

  // ---- Fit to screen -------------------------------------------------------
  const mainRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState("");
  const [fit, setFit] = useState({ scale: 1, visible: MAX_RENDER });
  useEffect(() => {
    const onResize = () => setViewport(`${window.innerWidth}x${window.innerHeight}`);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Start again at full size whenever what is on screen changes shape.
  const rowCount = (board?.waiting.length ?? 0) + (board?.booked?.length ?? 0);
  const shape = `${viewport}|${bilingual}|${rowCount}|${!!board?.current}|${!!board?.next}|${stale}|${empty}`;
  useEffect(() => setFit({ scale: 1, visible: MAX_RENDER }), [shape]);
  useIsoLayoutEffect(() => {
    // Phones scroll instead (see max-sm classes); fitting is for TVs and monitors.
    if (window.innerWidth < 640) return;
    const lists = Array.from(mainRef.current?.querySelectorAll<HTMLElement>("[data-fit-list]") ?? []);
    if (!lists.length) return;
    const overflowing = lists.some((ol) => ol.scrollHeight > ol.clientHeight || ol.scrollWidth > ol.clientWidth);
    if (!overflowing) return;
    if (fit.scale > MIN_FIT + 1e-6) {
      setFit((f) => ({ ...f, scale: Math.max(MIN_FIT, Math.round((f.scale - FIT_STEP) * 100) / 100) }));
      return;
    }
    // Smallest size reached: show only whole rows that fit.
    const fitting = Math.min(
      ...lists.map((ol) => Array.from(ol.children).filter((li) => {
        const el = li as HTMLElement;
        return el.offsetTop + el.offsetHeight <= ol.clientHeight + 1;
      }).length),
    );
    if (fitting < fit.visible) setFit((f) => ({ ...f, visible: Math.max(1, fitting) }));
  });

  return (
    <div
      dir="rtl"
      style={{ "--fit": fit.scale } as React.CSSProperties}
      className={cn(
        "keep-palette flex h-dvh flex-col overflow-hidden bg-navy-950 text-white",
        // Phones: the page scrolls at a readable size instead of shrinking to fit.
        "max-sm:h-auto max-sm:min-h-dvh max-sm:overflow-visible",
        // One base size from the smaller of width and height, so 16:9 TVs, 16:10 and
        // 4:3 monitors all fit at 100% zoom. Arabic-only mode uses the whole width.
        bilingual
          ? "[font-size:calc(clamp(11px,min(0.9vw,1.85vh),36px)*var(--fit,1))]"
          : "[font-size:calc(clamp(12px,min(1.15vw,2.1vh),46px)*var(--fit,1))]",
        // Narrow (phone) screens: size from the width instead.
        "max-sm:[font-size:calc(clamp(13px,3.6vw,18px)*var(--fit,1))]",
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-[1em] border-b border-white/10 px-[1.6em] py-[0.5em]">
        <div className="flex items-center gap-4">
          <BrandMark className="h-[2.6em] w-[2.6em] [&_svg]:h-[1.4em] [&_svg]:w-[1.4em]" />
          <div className="leading-tight">
            <p className="font-arabic text-[1.3em] font-semibold sm:text-[1.6em]">{board?.clinic.name_ar ?? "عيادة د. رودينا مدحت"}</p>
            {bilingual ? (
              <p dir="ltr" className="text-start font-sans text-[1.1em] text-teal-300">
                {board?.clinic.name ?? "Dr. Rodaina Medhat Clinic"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="text-end leading-tight">
          <p className="tabular whitespace-nowrap text-[1.5em] font-semibold sm:text-[2em]" suppressHydrationWarning>
            {clock(now, tz, "ar")}
          </p>
          <p className="text-[1em] text-navy-200" suppressHydrationWarning>
            {longDate(now, tz, "ar")}
          </p>
          {bilingual ? (
            <p dir="ltr" className="text-end font-sans text-[0.9em] text-navy-300" suppressHydrationWarning>
              {longDate(now, tz, "en")}
            </p>
          ) : null}
        </div>
      </header>

      {stale ? (
        <div role="status" className="flex shrink-0 items-center justify-center gap-[0.6em] bg-amber-500 px-[1em] py-[0.3em] text-[1em] font-semibold text-navy-950">
          <WifiOff className="h-[1.2em] w-[1.2em]" aria-hidden />
          {bilingual ? `${TEXT.ar.reconnecting} · ${TEXT.en.reconnecting}` : TEXT.ar.reconnecting}
        </div>
      ) : null}

      {empty ? (
        <ClosedState bilingual={bilingual} />
      ) : (
        <main ref={mainRef} className={cn("grid min-h-0 flex-1 gap-[1.2em] overflow-hidden px-[1.6em] py-[1em] max-sm:flex-none max-sm:overflow-visible max-sm:px-[1em]", bilingual ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
          {langs.map((lang) => (
            <LobbyColumn key={lang} lang={lang} board={board!} now={now} tz={tz} flash={flash} wide={!bilingual} maxRows={fit.visible} />
          ))}
        </main>
      )}

      <footer className="flex shrink-0 items-center justify-between gap-[1em] border-t border-white/10 px-[1.6em] py-[0.45em] text-[0.9em] text-navy-200">
        <p>{bilingual ? `${TEXT.ar.estimates} · ${TEXT.en.estimates}` : TEXT.ar.estimates}</p>
        <p>{bilingual ? `${TEXT.ar.checkIn} · ${TEXT.en.checkIn}` : TEXT.ar.checkIn}</p>
      </footer>
    </div>
  );
}

type Row =
  | { kind: "lobby"; key: string; number: number | null; name: string; at: string | null; late: boolean }
  | { kind: "booked"; key: string; name: string; at: string; end: string | null; shifts: number; delayed: boolean };

/** One complete board in a single language (the whole screen, or one half). */
function LobbyColumn({
  lang,
  board,
  now,
  tz,
  flash,
  wide,
  maxRows,
}: {
  lang: Lang;
  board: DisplayBoard;
  now: number;
  tz: string;
  flash: boolean;
  wide: boolean;
  maxRows: number;
}) {
  const t = TEXT[lang];
  const name = (p: { name_ar?: string; name_en?: string | null; display_name?: string }) =>
    (lang === "en" ? p.name_en || p.name_ar : p.name_ar) ?? p.display_name ?? "";

  // Checked-in visitors (live ETA) and today's online bookings (slot time), in time order (P2-15).
  const rows: Row[] = [
    ...board.waiting.map((w, i) => ({
      kind: "lobby" as const,
      key: `w-${w.queue_number}-${i}`,
      number: w.queue_number,
      name: name(w),
      at: w.expected_start_at,
      late: w.is_late,
    })),
    ...(board.booked ?? []).map((b, i) => ({
      kind: "booked" as const,
      key: `b-${b.slot_start}-${i}`,
      name: name(b),
      at: b.slot_start,
      end: b.slot_end,
      shifts: b.grace_shifts,
      delayed: b.is_delayed,
    })),
  ].sort((a, b) => (a.at ?? "9999").localeCompare(b.at ?? "9999"));
  const shown = rows.slice(0, maxRows);
  // Full-width (Arabic-only) board: a long list flows into two columns, top to bottom.
  const twoCols = wide && shown.length > 5;

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className={cn("flex min-h-0 flex-col gap-[0.9em] overflow-hidden max-sm:overflow-visible", lang === "ar" ? "font-arabic" : "font-sans")}>
      <div className={cn("grid shrink-0 gap-[0.9em]", wide && board.next ? "grid-cols-1 sm:grid-cols-[1.3fr_1fr]" : "grid-cols-1")}>
        {/* Now consulting. Idle state instead of empty blocks when nobody is inside (P2-13). */}
        {board.current ? (
          <section
            className={cn(
              "flex flex-col justify-between gap-[0.5em] overflow-hidden rounded-[1.2em] bg-gradient-to-br from-teal-500 to-teal-700 px-[1.3em] py-[1em] shadow-2xl",
              flash && "animate-pulse-ring",
            )}
          >
            <p className="text-[1.2em] font-semibold text-teal-50">{t.now}</p>
            <div className="flex items-center gap-[0.8em]">
              <p className="tabular text-[4.4em] font-bold leading-[0.85]" aria-live="assertive">
                {board.current.queue_number ?? "—"}
              </p>
              <div className="min-w-0">
                <p dir="auto" className="line-clamp-2 text-[1.9em] font-semibold leading-tight [overflow-wrap:anywhere]">
                  {name(board.current)}
                </p>
                <p className="mt-[0.2em] text-[1.3em] font-medium text-teal-50">{t.comeIn}</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex items-center gap-[0.8em] rounded-[1.2em] bg-white/[0.04] px-[1.3em] py-[1em] ring-1 ring-inset ring-white/10">
            <span className="h-[0.8em] w-[0.8em] shrink-0 rounded-full bg-teal-400/70" aria-hidden />
            <p className="text-[1.5em] text-navy-100">{t.idle}</p>
          </section>
        )}

        {/* Next */}
        {board.next ? (
          <section className="flex flex-col justify-between gap-[0.5em] rounded-[1.2em] bg-white/[0.06] px-[1.3em] py-[1em] ring-1 ring-inset ring-amber-300/30">
            <p className="text-[1.2em] font-semibold text-amber-300">{t.next}</p>
            <div className="flex items-center gap-[0.8em]">
              <p className="tabular text-[3.2em] font-bold leading-[0.85] text-amber-300">{board.next.queue_number ?? "—"}</p>
              <div className="min-w-0">
                <p dir="auto" className="line-clamp-2 text-[1.5em] font-semibold leading-tight [overflow-wrap:anywhere]">
                  {name(board.next)}
                </p>
                <Timing lang={lang} at={board.next.expected_start_at} now={now} tz={tz} />
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {/* Waiting + today's bookings */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.2em] max-sm:flex-none max-sm:overflow-visible bg-white/[0.04] px-[1.2em] py-[0.9em] ring-1 ring-inset ring-white/10">
        <div className="flex items-baseline justify-between">
          <p className="text-[1.2em] font-semibold text-navy-100">{t.waiting}</p>
          <span className="tabular text-[1.1em] text-navy-200">{rows.length}</span>
        </div>
        {shown.length === 0 ? (
          <p className="m-auto text-[1.3em] text-navy-300">{t.nobody}</p>
        ) : (
          <ol
            data-fit-list
            className={cn(
              "relative mt-[0.6em] min-h-0 flex-1 overflow-hidden max-sm:flex-none max-sm:overflow-visible",
              twoCols
                ? "space-y-[0.4em] sm:grid sm:grid-flow-col sm:grid-cols-2 sm:content-start sm:gap-x-[1em] sm:gap-y-[0.4em] sm:space-y-0"
                : "space-y-[0.4em]",
            )}
            style={twoCols ? { gridTemplateRows: `repeat(${Math.ceil(shown.length / 2)}, auto)` } : undefined}
          >
            {shown.map((r) => (
              <li
                key={r.key}
                className="grid grid-cols-[2.6em_minmax(0,1fr)] items-center gap-x-[0.8em] gap-y-[0.3em] rounded-[0.7em] bg-white/[0.05] px-[0.9em] py-[0.45em] sm:grid-cols-[2.6em_minmax(0,1fr)_auto]"
              >
                <span className="tabular text-[1.6em] font-bold leading-none">{r.kind === "lobby" ? (r.number ?? "—") : "·"}</span>
                <div className="min-w-0">
                  <p dir="auto" className="line-clamp-2 text-[1.25em] font-medium leading-tight [overflow-wrap:anywhere]">
                    {r.name}
                  </p>
                  <div className="mt-[0.2em] flex flex-wrap items-center gap-x-[0.5em] gap-y-[0.2em] text-[0.9em]">
                    {r.kind === "lobby" ? (
                      <span className="rounded-full bg-emerald-500/20 px-[0.7em] py-[0.1em] font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/40">
                        {t.inLobby}
                      </span>
                    ) : (
                      <span className="rounded-full bg-sky-500/15 px-[0.7em] py-[0.1em] font-semibold text-sky-200 ring-1 ring-inset ring-sky-400/30">
                        {t.notArrived}
                      </span>
                    )}
                    {r.kind === "booked" && r.delayed ? (
                      <span className="rounded-full bg-red-500/20 px-[0.7em] py-[0.1em] font-semibold text-red-200 ring-1 ring-inset ring-red-400/40">{t.delayed}</span>
                    ) : r.kind === "booked" && r.shifts > 0 ? (
                      <span className="rounded-full bg-amber-500/20 px-[0.7em] py-[0.1em] font-semibold text-amber-200 ring-1 ring-inset ring-amber-400/40">{t.shifted}</span>
                    ) : null}
                    {r.kind === "lobby" && r.late ? (
                      <span className="rounded-full bg-red-500/20 px-[0.7em] py-[0.1em] font-semibold text-red-200 ring-1 ring-inset ring-red-400/40">{t.late}</span>
                    ) : null}
                    {r.kind === "booked" ? (
                      <span className="tabular text-navy-200">
                        {t.slot} {clock(r.at, tz, lang)}
                        {r.end ? ` - ${clock(r.end, tz, lang)}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Timing lang={lang} at={r.at} now={now} tz={tz} hideEta={r.kind === "booked"} className="col-start-2 text-start sm:col-start-auto sm:text-end" />
              </li>
            ))}
          </ol>
        )}
        {rows.length > shown.length ? (
          <p className="mt-[0.5em] shrink-0 text-center text-[1em] text-navy-300">
            +{rows.length - shown.length} {t.more}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** Live countdown (updates every second, shown per minute) + 12-hour expected entry time (P2-14). */
function Timing({
  lang,
  at,
  now,
  tz,
  align,
  hideEta,
  className,
}: {
  lang: Lang;
  at: string | null;
  now: number;
  tz: string;
  align?: "end";
  hideEta?: boolean;
  className?: string;
}) {
  if (!at) return null;
  const t = TEXT[lang];
  const minutes = Math.ceil((new Date(at).getTime() - now) / 60_000);
  return (
    <div className={cn("tabular leading-tight", align === "end" && "text-end", className)}>
      <p className="whitespace-nowrap text-[1.1em] font-semibold text-amber-200">{minutes <= 0 ? t.anyMinute : `${t.left ? `${t.left} ` : ""}${remaining(minutes, lang)}`}</p>
      {hideEta ? null : (
        <p className="whitespace-nowrap text-[0.9em] text-navy-200">
          {t.eta} {clock(at, tz, lang)}
        </p>
      )}
    </div>
  );
}

function ClosedState({ bilingual }: { bilingual: boolean }) {
  return (
    <main className="grid flex-1 place-items-center p-[4vw] text-center">
      <div>
        <p className="font-arabic text-[3em] font-semibold">{TEXT.ar.closed}</p>
        {bilingual ? <p dir="ltr" className="mt-2 font-sans text-[2.2em] text-teal-300">{TEXT.en.closed}</p> : null}
        <p className="mt-6 text-[1.3em] text-navy-200">{TEXT.ar.closedBody}</p>
      </div>
    </main>
  );
}

const TEXT = {
  ar: {
    now: "في الكشف الآن",
    comeIn: "تفضلي بالدخول الآن",
    idle: "لا يوجد كشف في الوقت الحالي",
    next: "الدور القادم · يرجى الاستعداد",
    waiting: "قائمة اليوم",
    nobody: "لا يوجد أحد في الانتظار",
    inLobby: "في صالة الانتظار",
    notArrived: "حجز مؤكد - في انتظار الحضور",
    late: "متأخرة",
    shifted: "مؤجل - مهلة سماح",
    delayed: "تأخير",
    slot: "موعد الحجز:",
    left: "متبقي:",
    anyMinute: "خلال لحظات",
    eta: "متوقع الدخول:",
    more: "أخريات",
    reconnecting: "جارٍ إعادة الاتصال… قد لا تكون اللوحة محدّثة",
    estimates: "الأوقات تقريبية. يرجى الانتباه لرقمكِ.",
    checkIn: "يرجى تسجيل الحضور في الاستقبال عند الوصول",
    closed: "العيادة مغلقة حاليًا",
    closedBody: "ستُحدَّث اللوحة تلقائيًا عند افتتاح العيادة.",
  },
  en: {
    now: "Now consulting",
    comeIn: "Please come in now",
    idle: "No consultation at the moment",
    next: "Next up · please be ready",
    waiting: "Today's list",
    nobody: "No one is waiting",
    inLobby: "In the waiting room",
    notArrived: "Confirmed booking · not arrived",
    late: "Late",
    shifted: "Shifted - grace period",
    delayed: "Late / Delayed",
    slot: "Booking:",
    left: "",
    anyMinute: "Any moment now",
    eta: "Expected:",
    more: "more",
    reconnecting: "Reconnecting… the board may be out of date",
    estimates: "Times are estimates. Please listen for your number.",
    checkIn: "Please check in at reception on arrival",
    closed: "The clinic is not in session",
    closedBody: "",
  },
} as const;

/** "25 دقيقة" / "ساعة و10 دقائق" · "25 min left" / "1 h 10 min left". */
function remaining(total: number, lang: Lang): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (lang === "en") return h ? `${h} h${m ? ` ${m} min` : ""} left` : `${m} min left`;
  const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  const mins = m === 1 ? "دقيقة" : m === 2 ? "دقيقتان" : m <= 10 ? `${m} دقائق` : `${m} دقيقة`;
  if (!h) return mins;
  return m ? `${hours} و${mins}` : hours;
}

/** 12-hour clinic time: "06:45 م" / "06:45 PM". */
function clock(at: string | number, timeZone: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone }).format(
    new Date(at),
  );
}

function longDate(at: number, timeZone: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(at);
}
