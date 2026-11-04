import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus, Mail, Pencil, Phone, Cake } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookAppointmentDialog } from "@/features/appointments/components/admin/book-appointment-dialog";
import { AppointmentStatusPill } from "@/features/patients/components/appointment-card";
import { AccountBadge } from "@/features/patients/components/admin/account-badge";
import { PatientFormDialog } from "@/features/patients/components/admin/patient-form-dialog";
import { isAppError } from "@/lib/errors/app-error";
import { clinicDateOf, formatClinicDate, formatPhone, formatTime, initials } from "@/lib/format";
import { PatientAdminService } from "@/server/application/patients/patient-admin-service";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { requireStaff } from "@/server/authorization/actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patients.detail");
  return { title: t("metaTitle") };
}
export const dynamic = "force-dynamic";

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  const actor = await requireStaff().catch(() => null);
  if (!actor) redirect("/login");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const settings = await getClinicSettings(actor.supabase);
  const t = await getTranslations("patients.detail");
  const locale = (await getLocale()) as Locale;
  const data = await new PatientAdminService(actor.supabase).get(params.id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!data) notFound();
  const { patient, visits } = data;
  const tz = settings.timezone;
  const today = clinicDateOf(Date.now(), tz);
  const upcoming = visits.filter((v) => (v.status === "scheduled" || v.status === "checked_in") && v.clinic_date >= today).reverse();
  const past = visits.filter((v) => !upcoming.includes(v));
  const completed = visits.filter((v) => v.status === "completed").length;
  const years = age(patient.dateOfBirth);

  return (
    <div className="space-y-6">
      <Link href="/admin/patients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-navy-900">
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> {t("back")}
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-navy-900 text-lg font-semibold text-white">{initials(patient.fullName)}</span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 dir="auto" className="truncate text-start text-xl font-semibold text-navy-900 sm:text-2xl">{patient.fullName}</h1>
                <AccountBadge hasAccount={patient.hasAccount} verified={patient.phoneVerified} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="tabular inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {formatPhone(patient.phone)}
                </span>
                {patient.email ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate" dir="ltr">{patient.email}</span>
                  </span>
                ) : null}
                {years !== null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Cake className="h-3.5 w-3.5" /> {t("age", { count: years })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PatientFormDialog
              patientId={patient.id}
              phoneLocked={patient.hasAccount}
              initial={{ fullName: patient.fullName, fullNameEn: patient.fullNameEn ?? "", phone: patient.phone, email: patient.email ?? "", dateOfBirth: patient.dateOfBirth ?? "", preferredLocale: patient.preferredLocale }}
              trigger={
                <Button variant="outline">
                  <Pencil /> {t("edit")}
                </Button>
              }
            />
            <BookAppointmentDialog
              timezone={tz}
              today={today}
              patient={{ id: patient.id, fullName: patient.fullName, phone: patient.phone }}
              trigger={
                <Button>
                  <CalendarPlus /> {t("book")}
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          [t("visits"), visits.filter((v) => v.status !== "cancelled").length],
          [t("completed"), completed],
          [t("upcoming"), upcoming.length],
        ].map(([label, n]) => (
          <Card key={label as string} className="p-4">
            <div className="tabular text-2xl font-semibold text-navy-900">{n}</div>
            <div className="text-xs text-muted-foreground sm:text-sm">{label}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <VisitList title={t("upcoming")} visits={upcoming} tz={tz} empty={t("noUpcoming")} />
        <VisitList title={t("history")} visits={past} tz={tz} empty={t("noHistory")} />
      </div>
    </div>
  );
}

async function VisitList({
  title,
  visits,
  tz,
  empty,
}: {
  title: string;
  visits: Awaited<ReturnType<PatientAdminService["get"]>>["visits"];
  tz: string;
  empty: string;
}) {
  const t = await getTranslations("patients.detail");
  const tReason = await getTranslations("visitReason");
  const locale = (await getLocale()) as Locale;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {visits.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {visits.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 px-5 py-3 sm:px-6">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900">
                    {formatClinicDate(v.clinic_date, { weekday: "short", month: "short" }, locale)}
                    {v.scheduled_start ? <span className="tabular font-normal text-muted-foreground"> · {formatTime(v.scheduled_start, tz, locale)}</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {v.visit_reason === "other" && v.visit_reason_details ? v.visit_reason_details : tReason(v.visit_reason)}
                    {" · "}
                    {t(`source.${v.source}`)}
                  </p>
                  {v.patient_notes ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">“{v.patient_notes}”</p> : null}
                </div>
                <AppointmentStatusPill status={v.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
