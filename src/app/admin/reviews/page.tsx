import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageSquareQuote, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { PageHeader } from "@/components/shared/page-header";
import { SearchBox } from "@/components/shared/search-box";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RATING_KEYS, Stars } from "@/features/feedback/rating";
import { formatClinicDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listVisitReviews, summarizeReviews } from "@/server/application/feedback/visit-feedback";
import { getActor } from "@/server/authorization/actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("reviews") };
}
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
type SearchParams = { stars?: string; q?: string; page?: string };

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  // Doctor only, like the logs: secretaries go back to the dashboard.
  if (actor.role !== "doctor") redirect("/admin/dashboard");

  const t = await getTranslations("reviews");
  const tLabel = await getTranslations("portal.feedback.labels");
  const locale = (await getLocale()) as Locale;

  const all = await listVisitReviews(actor.supabase);
  const summary = summarizeReviews(all);
  const stars = Number.parseInt(searchParams.stars ?? "", 10);
  const starFilter = stars >= 1 && stars <= 5 ? stars : null;
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const filtered = all.filter(
    (r) => (!starFilter || r.rating === starFilter) && (!q || r.patientName.toLowerCase().includes(q) || (r.comment ?? "").toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1), pages);
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (patch: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged = { stars: searchParams.stars, q: searchParams.q, page: undefined as string | undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/admin/reviews?${s}` : "/admin/reviews";
  };
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  return (
    <>
      <PageHeader title={t("title")} description={t("body")} />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card className="flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">{t("average")}</p>
          <p className="tabular text-5xl font-bold text-navy-900">{summary.count ? fmt.format(summary.average) : "—"}</p>
          <Stars value={summary.average} className="[&>svg]:h-5 [&>svg]:w-5" />
          <p className="text-sm text-muted-foreground">{t("count", { count: summary.count })}</p>
        </Card>
        <Card className="space-y-2 p-5">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = summary.distribution[n - 1]!;
            const pct = summary.count ? Math.round((c / summary.count) * 100) : 0;
            return (
              <Link
                key={n}
                href={href({ stars: starFilter === n ? undefined : String(n) })}
                className={cn(
                  "grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                  starFilter === n && "bg-amber-50 ring-1 ring-inset ring-amber-200",
                )}
                aria-current={starFilter === n ? "true" : undefined}
              >
                <span className="flex items-center gap-1.5 font-medium text-navy-900">
                  <bdi className="tabular">{n}</bdi> <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                  <span className="truncate text-muted-foreground">{tLabel(RATING_KEYS[n - 1]!)}</span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </span>
                <span className="tabular text-end text-muted-foreground">{c}</span>
              </Link>
            );
          })}
        </Card>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-navy-900">{t("listTitle")}</h2>
          {starFilter ? (
            <Link href={href({ stars: undefined })} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
              {t("filtered", { stars: starFilter })} ✕
            </Link>
          ) : null}
        </div>
        <div className="w-full sm:w-72">
          <SearchBox placeholder={t("search")} />
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="mt-3 flex flex-col items-center gap-2 p-10 text-center">
          <MessageSquareQuote className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium text-navy-900">{summary.count ? t("noMatch") : t("empty")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </Card>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((r) => (
            <li key={r.appointmentId} className="rounded-xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Stars value={r.rating} />
                  <span className="text-sm font-semibold text-amber-700">{tLabel(RATING_KEYS[r.rating - 1]!)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {r.clinicDate ? t("visit", { date: formatClinicDate(r.clinicDate, {}, locale) }) : null}
                </span>
              </div>
              {r.comment ? (
                <p dir="auto" className="mt-2 whitespace-pre-line text-start text-sm leading-relaxed text-navy-900">
                  {r.comment}
                </p>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground">{t("noComment")}</p>
              )}
              <p dir="auto" className="mt-2 text-start text-xs font-medium text-muted-foreground">
                {r.patientName}
              </p>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t("pagination")}>
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href({ page: String(page - 1) })}>
                <ChevronLeft className="rtl:-scale-x-100" /> {t("prev")}
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="rtl:-scale-x-100" /> {t("prev")}
            </Button>
          )}
          <span className="tabular text-sm text-muted-foreground">{t("page", { page, pages })}</span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href({ page: String(page + 1) })}>
                {t("next")} <ChevronRight className="rtl:-scale-x-100" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              {t("next")} <ChevronRight className="rtl:-scale-x-100" />
            </Button>
          )}
        </nav>
      ) : null}
    </>
  );
}
