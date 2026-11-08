import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { clinicDateOf, formatClinicDate, formatTime } from "@/lib/format";
import type { ClinicSettings } from "@/server/application/settings/clinic-settings";
import { waMeLink } from "@/server/integrations/whatsapp";

/**
 * One-tap WhatsApp booking confirmation with the arrival time (same text as
 * the Appointments page "Confirm via WhatsApp" button). Opens WhatsApp on the
 * clinic phone with the message ready; nothing is sent until staff press Send.
 */
export async function bookingConfirmationLink(
  booking: { clinicDate: string; scheduledStart: string },
  patient: { fullName: string; phone: string },
  settings: ClinicSettings,
): Promise<string> {
  const t = await getTranslations("appointments.confirmWa");
  const locale = (await getLocale()) as Locale;
  const today = clinicDateOf(Date.now(), settings.timezone);
  const text = [
    t("message", {
      name: patient.fullName.split(" ")[0] ?? patient.fullName,
      clinic: locale === "ar" ? settings.clinicNameAr : settings.clinicName,
      day: booking.clinicDate === today ? t("today") : t("onDay", { date: formatClinicDate(booking.clinicDate, { year: undefined }, locale) }),
      time: formatTime(booking.scheduledStart, settings.timezone, locale),
    }),
    settings.clinicAddress ? t("address", { address: settings.clinicAddress }) : null,
    settings.clinicMapUrl ? t("map", { url: settings.clinicMapUrl }) : null,
  ]
    .filter(Boolean)
    .join("\n");
  return waMeLink(patient.phone, text);
}
