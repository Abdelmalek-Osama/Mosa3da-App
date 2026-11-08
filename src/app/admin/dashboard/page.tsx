import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListOrdered,
  MonitorPlay,
  Stethoscope,
  UserPlus,
  Users,
  BellRing,
  Hourglass,
  CalendarPlus,
  Search,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { BookAppointmentDialog } from "@/features/appointments/components/admin/book-appointment-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { NotificationsCard } from "@/features/dashboard/components/notifications-card";
import { StatTile } from "@/features/dashboard/components/stat-tile";
import { CurrentPanel } from "@/features/queue/components/current-panel";
import { NextPanel } from "@/features/queue/components/next-panel";
import { QueueController } from "@/features/queue/components/queue-controller";
import { ScheduledList } from "@/features/queue/components/side-lists";
import { WalkInDialog } from "@/features/queue/components/walk-in-dialog";
import { formatClinicDate } from "@/lib/format";
import { getDashboardData } from "@/server/application/dashboard/dashboard-service";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { requireStaff } from "@/server/authorization/actor";
import { whatsAppConfig } from "@/server/integrations/whatsapp/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("dashboard") };
}
export const dynamic = "force-dynamic";

function greeting(timezone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: timezone }).format(new Date()));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export default async function DashboardPage() {
  const actor = await requireStaff().catch(() => null);
  if (!actor) redirect("/login");

  const [data, settings] = await Promise.all([getDashboardData(actor.supabase), getClinicSettings(actor.supabase)]);
  const { board, totals } = data;
  const t = await getTranslations("dashboard");
  const tBook = await getTranslations("appointments.book");
  const locale = (await getLocale()) as Locale;
  const clinicName = locale === "ar" ? settings.clinicNameAr || settings.clinicName : settings.clinicName;
  const waitingCount = board.waiting.filter((e) => e.status === "arrived").length + board.absent.length;

  return (
    <QueueController
      timezone={settings.timezone}
      latePolicyConsultations={settings.latePolicyConsultations}
      finishedCount={board.session.finishedConsultationsCount}
      hasCurrent={!!board.current}
    >
      <section className="keep-palette mb-6 overflow-hidden rounded-2xl bg-navy-900 text-white shadow-soft">
        <div className="relative flex flex-col gap-5 p-5 sm:p-7 md:flex-row md:items-end md:justify-between">
          <div className="absolute -end-16 -top-20 h-64 w-64 rounded-full bg-teal-500/20 blur-3xl" />
          <div className="relative space-y-1">
            <div className="text-sm text-navy-200">{formatClinicDate(board.session.clinicDate, {}, locale)}</div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t(`greeting.${greeting(settings.timezone)}`, { name: actor.fullName.split(" ").slice(0, 2).join(" ") })}
            </h1>
            <div className="text-sm text-navy-200">
              {clinicName} · {settings.doctorName}
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <LiveIndicator channel="admin-dashboard" />
            <WalkInDialog
              defaultDuration={settings.defaultConsultationMinutes}
              timezone={settings.timezone}
              trigger={
                <Button variant="secondary">
                  <UserPlus /> {t("addWalkIn")}
                </Button>
              }
            />
            <BookAppointmentDialog
              timezone={settings.timezone}
              today={board.session.clinicDate}
              trigger={
                <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <CalendarPlus /> {tBook("schedule")}
                </Button>
              }
            />
            <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Link href="/admin/queue"><ListOrdered /> {t("openQueue")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7 [&>*]:min-w-0">
        <StatTile label={t("stats.appointments")} value={totals.appointmentsToday} icon={CalendarDays} tone="navy" href="/admin/appointments" />
        <StatTile label={t("stats.patients")} value={totals.patients} icon={Users} tone="blue" href="/admin/patients" />
        <StatTile label={t("stats.consulting")} value={board.current ? 1 : 0} hint={board.current?.patientName ?? t("stats.roomFree")} icon={Stethoscope} tone="teal" />
        <StatTile label={t("stats.ready")} value={board.ready ? 1 : 0} hint={board.ready ? `#${board.ready.queueNumber} ${board.ready.patientName}` : "—"} icon={BellRing} tone="amber" />
        <StatTile label={t("stats.waiting")} value={waitingCount} hint={board.absent.length ? t("stats.missed", { count: board.absent.length }) : undefined} icon={Hourglass} tone="blue" />
        <StatTile label={t("stats.late")} value={board.stats.late} icon={Clock3} tone="red" />
        <StatTile label={t("stats.completed")} value={board.stats.finished} icon={CheckCircle2} tone="emerald" />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <CurrentPanel current={board.current} />
        <NextPanel ready={board.ready} />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{t("quick.title")}</CardTitle>
            <CardDescription>{t("quick.body")}</CardDescription>
          </CardHeader>
          <div className="grid gap-2 px-5 pb-5">
            <WalkInDialog
              defaultDuration={settings.defaultConsultationMinutes}
              timezone={settings.timezone}
              trigger={
                <Button variant="outline" className="h-12 justify-start text-start">
                  <UserPlus className="text-secondary" /> {t("quick.walkIn")}
                </Button>
              }
            />
            <BookAppointmentDialog
              timezone={settings.timezone}
              today={board.session.clinicDate}
              trigger={
                <Button variant="outline" className="h-12 justify-start text-start">
                  <CalendarPlus className="text-secondary" /> {t("quick.book")}
                </Button>
              }
            />
            <Button asChild variant="outline" className="h-12 justify-start text-start">
              <Link href="/admin/patients"><Search className="text-secondary" /> {t("quick.find")}</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 justify-start text-start">
              <Link href="/admin/queue"><ListOrdered className="text-secondary" /> {t("quick.queue")}</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 justify-start text-start">
              <Link href="/display" target="_blank"><MonitorPlay className="text-secondary" /> {t("quick.display")}</Link>
            </Button>
          </div>
        </Card>
        <div className="xl:col-span-1">
          <ScheduledList entries={board.scheduled} />
        </div>
        <div className="xl:col-span-1">
          <NotificationsCard
            items={data.notifications}
            thresholdMinutes={settings.whatsappThresholdMinutes}
            timezone={settings.timezone}
            autoSend={whatsAppConfig().autoSend}
          />
        </div>
      </section>
    </QueueController>
  );
}
