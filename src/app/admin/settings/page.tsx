import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClinicSettingsForm } from "@/features/settings/components/clinic-settings-form";
import { VisitReasonsEditor } from "@/features/settings/components/visit-reasons-editor";
import { WorkingHoursEditor } from "@/features/settings/components/working-hours-editor";
import { listCustomVisitReasons, listVisitReasons } from "@/server/application/settings/visit-reasons";
import { SettingsAdminService } from "@/server/application/settings/settings-admin-service";
import { requireStaff } from "@/server/authorization/actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settings") };
}
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await requireStaff().catch(() => null);
  if (!actor) redirect("/login");

  const [{ settings, periods }, reasons, customReasons] = await Promise.all([
    new SettingsAdminService(actor.supabase).get(),
    // Empty until the visit-reason migration is applied; the card is hidden then.
    listVisitReasons(actor.supabase).catch(() => []),
    listCustomVisitReasons(actor.supabase),
  ]);
  const readOnly = actor.role !== "doctor";
  const t = await getTranslations("settings");
  const { updatedAt: _u, timezone, ...editable } = settings;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("timezone", { timezone })}
      />
      {readOnly ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t("readOnly")}</p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>{t("hours.title")}</CardTitle>
            <CardDescription>{t("hours.body")}</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkingHoursEditor initial={periods} readOnly={readOnly} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("rules.title")}</CardTitle>
            <CardDescription>{t("rules.body")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ClinicSettingsForm initial={editable} readOnly={readOnly} />
          </CardContent>
        </Card>
        {reasons.length ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>{t("reasons.title")}</CardTitle>
              <CardDescription>{t("reasons.body")}</CardDescription>
            </CardHeader>
            <CardContent>
              <VisitReasonsEditor initial={reasons} custom={customReasons} readOnly={readOnly} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
