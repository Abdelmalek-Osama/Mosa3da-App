"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { useLocale } from "next-intl";
import { BrandMark } from "@/components/shared/brand";
import { cn } from "@/lib/utils";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import type { DisplayBoard } from "@/features/queue/schemas";

const POLL_MS = 5_000;
const STALE_AFTER_MS = 20_000;
const MAX_WAITING = 8;

/**
 * The waiting room is mixed-language, so the TV is always bilingual: the
 * chosen language leads and the other follows (see <Bilingual>).
 *
 * Waiting-room TV. Reads only the anonymized /api/display payload
 * (queue numbers, masked names, expected times). No patient identifiers
 * ever reach this page.
 */
export function DisplayBoardView({ initial }: { initial: DisplayBoard | null }) {
  const locale = useLocale();
  const ar = locale === "ar";
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
  const stale = !lastOk || now - lastOk > STALE_AFTER_MS;
  const waiting = board?.waiting ?? [];
  const shown = waiting.slice(0, MAX_WAITING);

  return (
    <div className="keep-palette flex min-h-dvh flex-col overflow-hidden bg-navy-950 text-white [font-size:clamp(14px,1.05vw,28px)]">
      {/* Header */}
      <header className="flex items-center justify-between gap-6 border-b border-white/10 px-[3vw] py-[1.6vh]">
        <div className="flex items-center gap-4">
          <BrandMark className="h-[2.6em] w-[2.6em] [&_svg]:h-[1.4em] [&_svg]:w-[1.4em]" />
          <div className="leading-tight">
            <p className="text-[1.5em] font-semibold">
              {ar ? (board?.clinic.name_ar ?? "عيادة د. رودينا مدحت") : (board?.clinic.name ?? "Dr. Rodaina Medhat Clinic")}{" "}
              <span className={cn("text-teal-300", ar ? "font-sans" : "font-arabic")}>
                {ar ? (board?.clinic.name ?? "") : (board?.clinic.name_ar ?? "عيادة د. رودينا مدحت")}
              </span>
            </p>
            <p className="text-[0.95em] text-navy-200">{board?.clinic.doctor ?? ""}</p>
          </div>
        </div>
        <div className="text-end leading-tight">
          <p className="tabular text-[2.4em] font-semibold" suppressHydrationWarning>
            {time(new Date(now).toISOString(), tz, ar)}
          </p>
          <p className="text-[0.95em] text-navy-200" suppressHydrationWarning>
            {longDate(now, tz, ar)}
            {" · "}
            <span className={ar ? "font-sans" : "font-arabic"}>{longDate(now, tz, !ar)}</span>
          </p>
        </div>
      </header>

      {stale ? (
        <div role="status" className="flex items-center justify-center gap-3 bg-amber-500 px-6 py-2 text-[1em] font-semibold text-navy-950">
          <WifiOff className="h-[1.2em] w-[1.2em]" aria-hidden />
          <Pair en="Reconnecting… the board may be out of date" ar="جارٍ إعادة الاتصال… قد لا تكون اللوحة محدّثة" />
        </div>
      ) : null}

      {!board || (!board.session_open && !board.current && waiting.length === 0) ? (
        <ClosedState ar={ar} />
      ) : (
        <main className="grid flex-1 grid-cols-1 gap-[2vw] p-[3vw] lg:grid-cols-[1.25fr_1fr]">
          {/* Now + next */}
          <section className="grid min-h-0 grid-rows-[1.35fr_1fr] gap-[2vw]">
            <div
              className={cn(
                "relative flex flex-col justify-between overflow-hidden rounded-[1.5em] bg-gradient-to-br from-teal-500 to-teal-700 p-[2.2em] shadow-2xl transition-shadow",
                flash && "animate-pulse-ring",
              )}
            >
              <Bilingual en="Now consulting" ar="في الكشف الآن" className="text-teal-50" />
              <div className="flex items-end justify-between gap-6">
                <p className="tabular text-[clamp(6rem,16vw,22rem)] font-bold leading-[0.85] tracking-tight" aria-live="assertive">
                  {board.current?.queue_number ?? "—"}
                </p>
                <p className="mb-[0.6em] max-w-[45%] truncate text-end text-[2em] font-medium text-teal-50">
                  {board.current?.display_name ?? (ar ? "يرجى انتظار النداء" : "Please wait to be called")}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-[1.5em] bg-white/[0.06] p-[2.2em] ring-1 ring-inset ring-white/10">
              <Bilingual en="Next · please be ready" ar="التالية · يرجى الاستعداد" className="text-amber-300" />
              <div className="flex items-end justify-between gap-6">
                <p className="tabular text-[clamp(4rem,9vw,12rem)] font-bold leading-[0.85] text-amber-300">
                  {board.next?.queue_number ?? "—"}
                </p>
                <div className="mb-[0.4em] min-w-0 text-end">
                  <p className="truncate text-[1.7em] font-medium">{board.next?.display_name ?? ""}</p>
                  {board.next?.expected_start_at ? (
                    <p className="tabular text-[1.1em] text-navy-200">≈ {time(board.next.expected_start_at, tz, ar)}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* Waiting list */}
          <section className="flex min-h-0 flex-col rounded-[1.5em] bg-white/[0.04] p-[1.8em] ring-1 ring-inset ring-white/10">
            <div className="flex items-baseline justify-between">
              <Bilingual en="Waiting" ar="في الانتظار" className="text-navy-100" />
              <span className="tabular text-[1.1em] text-navy-200">{waiting.length}</span>
            </div>
            {shown.length === 0 ? (
              <p className="m-auto text-[1.3em] text-navy-300">{ar ? "لا يوجد أحد آخر في الانتظار" : "No one else is waiting"}</p>
            ) : (
              <ol className="mt-[1em] flex-1 space-y-[0.55em]">
                {shown.map((w, i) => (
                  <li
                    key={`${w.queue_number}-${i}`}
                    className="grid grid-cols-[4.2em_1fr_auto] items-center gap-[1em] rounded-[0.8em] bg-white/[0.05] px-[1em] py-[0.7em]"
                  >
                    <span className="tabular text-[1.9em] font-bold leading-none">{w.queue_number ?? "—"}</span>
                    <span className="min-w-0 truncate text-[1.25em]">{w.display_name}</span>
                    <span className="flex items-center gap-[0.6em]">
                      {w.is_late ? (
                        <span className="rounded-full bg-red-500/20 px-[0.7em] py-[0.15em] text-[0.85em] font-semibold text-red-200 ring-1 ring-inset ring-red-400/40">
                          {ar ? "متأخرة · Late" : "Late · متأخرة"}
                        </span>
                      ) : null}
                      <span className="tabular text-[1.15em] text-navy-200">
                        {w.expected_start_at ? `≈ ${time(w.expected_start_at, tz, ar)}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {waiting.length > shown.length ? (
              <p className="mt-[0.8em] text-center text-[1em] text-navy-300">+{waiting.length - shown.length} {ar ? "أخريات" : "more"}</p>
            ) : null}
          </section>
        </main>
      )}

      <footer className="flex items-center justify-between gap-6 border-t border-white/10 px-[3vw] py-[1.2vh] text-[0.95em] text-navy-200">
        <p><Pair en="Times are estimates. Please listen for your number." ar="الأوقات تقريبية. يرجى الانتباه لرقمكِ." /></p>
        <p><Pair en="Please check in at reception on arrival" ar="يرجى تسجيل الحضور في الاستقبال عند الوصول" /></p>
      </footer>
    </div>
  );
}

function Bilingual({ en, ar, className }: { en: string; ar: string; className?: string }) {
  const arFirst = useLocale() === "ar";
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-[0.6em] text-[1.35em] font-semibold uppercase tracking-wider", className)}>
      <span className={arFirst ? "font-arabic normal-case tracking-normal" : undefined}>{arFirst ? ar : en}</span>
      <span className={cn("opacity-90", arFirst ? "font-sans" : "font-arabic normal-case tracking-normal")}>{arFirst ? en : ar}</span>
    </p>
  );
}

function Pair({ en, ar }: { en: string; ar: string }) {
  const arFirst = useLocale() === "ar";
  return <>{arFirst ? `${ar} · ${en}` : `${en} · ${ar}`}</>;
}

function ClosedState({ ar }: { ar: boolean }) {
  return (
    <main className="grid flex-1 place-items-center p-[4vw] text-center">
      <div>
        <p className="text-[3em] font-semibold">{ar ? "العيادة مغلقة حاليًا" : "The clinic is not in session"}</p>
        <p className={cn("mt-2 text-[2.4em] text-teal-300", ar ? "font-sans" : "font-arabic")}>
          {ar ? "The clinic is not in session" : "العيادة مغلقة حاليًا"}
        </p>
        <p className="mt-6 text-[1.3em] text-navy-200">
          {ar ? "ستُحدَّث اللوحة تلقائيًا عند افتتاح العيادة." : "The board will update automatically when the clinic opens."}
        </p>
      </div>
    </main>
  );
}

function time(iso: string, timeZone: string, ar: boolean) {
  return new Intl.DateTimeFormat(ar ? "ar-u-nu-latn" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(
    new Date(iso),
  );
}

function longDate(at: number, timeZone: string, ar: boolean) {
  return new Intl.DateTimeFormat(ar ? "ar-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(at);
}
