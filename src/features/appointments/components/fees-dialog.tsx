"use client";

import { HeartHandshake, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";

export interface FeesInfo {
  clinicName: string;
  clinicNameAr: string;
  services: { id: string; nameAr: string; nameEn: string | null; price: number }[];
}

/**
 * Shown once, right after a first-time visitor's first booking: a welcome
 * note and the doctor's current fees. "Understood / Continue" closes it and
 * leaves her on the appointment summary underneath.
 */
export function FeesDialog({ fees, open, onContinue }: { fees: FeesInfo; open: boolean; onContinue: () => void }) {
  const t = useTranslations("portal.fees");
  const locale = useLocale() as Locale;
  const clinic = locale === "en" ? fees.clinicName : fees.clinicNameAr;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onContinue()}>
      <DialogContent
        className="max-w-md gap-5 p-6 [&>button:last-child]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="fees-dialog"
      >
        <DialogHeader className="items-center space-y-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-teal-50 ring-8 ring-teal-50/50">
            <HeartHandshake className="h-7 w-7 text-teal-600" aria-hidden />
          </span>
          <DialogTitle className="text-xl text-navy-900">{t("title")}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-navy-900/80">
            {t("welcome", { clinic })} {t("booked")}
          </DialogDescription>
        </DialogHeader>

        {fees.services.length ? (
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
              <ReceiptText className="h-4 w-4 text-teal-600" aria-hidden />
              {t("ratesTitle")}
            </p>
            <ul className="space-y-2">
              {fees.services.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span dir="auto" className="text-navy-900">
                    {locale === "en" ? s.nameEn || s.nameAr : s.nameAr}
                  </span>
                  <span className="flex-1 border-b border-dotted border-border" aria-hidden />
                  <span className="tabular shrink-0 font-semibold text-navy-900">{formatMoney(s.price, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-center text-sm text-muted-foreground">{t("settle")}</p>

        <Button size="lg" className="h-12 w-full rounded-xl" onClick={onContinue} autoFocus>
          {t("continue")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
