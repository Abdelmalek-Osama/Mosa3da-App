/** Lobby display texts and time formatting, shared by the live board and the TV board. */

export type Lang = "ar" | "en";

export const TEXT = {
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
export function remaining(total: number, lang: Lang): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (lang === "en") return h ? `${h} h${m ? ` ${m} min` : ""} left` : `${m} min left`;
  const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  const mins = m === 1 ? "دقيقة" : m === 2 ? "دقيقتان" : m <= 10 ? `${m} دقائق` : `${m} دقيقة`;
  if (!h) return mins;
  return m ? `${hours} و${mins}` : hours;
}

/** 12-hour clinic time: "06:45 م" / "06:45 PM". */
export function clock(at: string | number, timeZone: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone }).format(
    new Date(at),
  );
}

export function longDate(at: number, timeZone: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(at);
}
