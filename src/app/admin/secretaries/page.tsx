import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { CreateSecretaryDialog } from "@/features/secretaries/components/create-secretary-dialog";
import { SecretaryActions } from "@/features/secretaries/components/secretary-actions";
import { formatClinicDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SecretaryService } from "@/server/application/secretaries/secretary-service";
import { requireStaff } from "@/server/authorization/actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("secretaries") };
}
export const dynamic = "force-dynamic";

export default async function SecretariesPage() {
  const actor = await requireStaff().catch(() => null);
  if (!actor) redirect("/login");
  const t = await getTranslations("secretaries");
  const locale = (await getLocale()) as Locale;

  if (actor.role !== "doctor") {
    return (
      <Card className="mx-auto mt-10 max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-medium text-navy-900">{t("doctorOnly")}</p>
      </Card>
    );
  }

  const secretaries = await new SecretaryService(actor.supabase, actor.userId).list();
  const active = secretaries.filter((s) => s.isActive).length;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("summary", { active, inactive: secretaries.length - active })}
        actions={<CreateSecretaryDialog />}
      />
      {secretaries.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-navy-900">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 [&>*]:min-w-0">
          {secretaries.map((s) => (
            <li key={s.id} className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between", !s.isActive && "bg-muted/40")}>
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", s.isActive ? "bg-teal-50 text-teal-800" : "bg-slate-200 text-slate-500")}>
                  {initials(s.fullName)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="auto" className="truncate font-medium text-navy-900">{s.fullName}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                        s.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200",
                      )}
                    >
                      {s.isActive ? t("active") : t("inactive")}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    <span dir="ltr">{s.email ?? "—"}</span> · {t("added", { date: formatClinicDate(s.createdAt.slice(0, 10), { weekday: undefined, month: "short" }, locale) })}
                  </p>
                </div>
              </div>
              <SecretaryActions id={s.id} name={s.fullName.split(" ")[0] ?? s.fullName} active={s.isActive} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
