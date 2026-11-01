import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronRightIcon, UserPlus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBox } from "@/components/shared/search-box";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PatientFormDialog } from "@/features/patients/components/admin/patient-form-dialog";
import { AccountBadge } from "@/features/patients/components/admin/account-badge";
import { formatClinicDate, formatPhone, initials } from "@/lib/format";
import { PatientAdminService } from "@/server/application/patients/patient-admin-service";
import { requireStaff } from "@/server/authorization/actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("patients") };
}
export const dynamic = "force-dynamic";

export default async function PatientsPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const actor = await requireStaff().catch(() => null);
  if (!actor) redirect("/login");

  const t = await getTranslations("patients");
  const locale = (await getLocale()) as Locale;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { patients, total, pageSize } = await new PatientAdminService(actor.supabase).list({ query: searchParams.q, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `/admin/patients?${new URLSearchParams({ ...(searchParams.q ? { q: searchParams.q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={searchParams.q ? t("countMatching", { count: total, q: searchParams.q }) : t("count", { count: total })}
        actions={
          <PatientFormDialog
            trigger={
              <Button>
                <UserPlus /> {t("register")}
              </Button>
            }
          />
        }
      />

      <div className="mb-4">
        <SearchBox placeholder={t("search")} />
      </div>

      {patients.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium text-navy-900">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchParams.q ? t("emptySearch") : t("emptyBody")}
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="grid grid-cols-1 gap-2 md:hidden [&>*]:min-w-0">
            {patients.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/patients/${p.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-soft active:bg-muted">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-50 text-sm font-semibold text-navy-700">{initials(p.fullName)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-navy-900">{p.fullName}</span>
                    <span className="tabular block text-sm text-muted-foreground">{formatPhone(p.phone)}</span>
                  </span>
                  <AccountBadge hasAccount={p.hasAccount} verified={p.phoneVerified} compact />
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.patient")}</TableHead>
                  <TableHead>{t("col.phone")}</TableHead>
                  <TableHead>{t("col.email")}</TableHead>
                  <TableHead>{t("col.portal")}</TableHead>
                  <TableHead>{t("col.registered")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell>
                      <Link href={`/admin/patients/${p.id}`} className="flex items-center gap-3 font-medium text-navy-900 hover:underline">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-50 text-xs font-semibold text-navy-700">{initials(p.fullName)}</span>
                        {p.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular">{formatPhone(p.phone)}</TableCell>
                    <TableCell className="text-muted-foreground" dir="ltr">{p.email ?? "—"}</TableCell>
                    <TableCell>
                      <AccountBadge hasAccount={p.hasAccount} verified={p.phoneVerified} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatClinicDate(p.createdAt.slice(0, 10), { weekday: undefined, month: "short" }, locale)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/patients/${p.id}`} aria-label={t("open", { name: p.fullName })} className="text-muted-foreground group-hover:text-navy-900">
                        <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {pages > 1 ? (
            <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label={t("pagination")}>
              <span className="text-muted-foreground">
                {t("page", { page, pages })}
              </span>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
                  <Link href={href(page - 1)} aria-disabled={page <= 1}>
                    <ChevronLeft className="rtl:-scale-x-100" /> {t("previous")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
                  <Link href={href(page + 1)} aria-disabled={page >= pages}>
                    {t("next")} <ChevronRight className="rtl:-scale-x-100" />
                  </Link>
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
