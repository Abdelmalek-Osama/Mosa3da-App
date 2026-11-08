"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquareHeart, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/i18n/config";
import { formatClinicDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dismissFeedbackAction, submitFeedbackAction } from "@/features/feedback/actions";
import { RATING_KEYS } from "@/features/feedback/rating";


/**
 * Post-consultation rating, shown once per finished visit on the visitor's
 * dashboard. Submitting saves it; "Later / Close" (or Esc) dismisses it for
 * good, so the same visit is never asked about twice.
 */
export function FeedbackPrompt({ appointmentId, clinicDate, doctorName }: { appointmentId: string; clinicDate: string; doctorName: string }) {
  const t = useTranslations("portal.feedback");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(true);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = hover || rating;

  const dismiss = () => {
    if (pending) return;
    setOpen(false);
    // Fire and forget: closing must never be blocked by the network.
    void dismissFeedbackAction(appointmentId);
  };

  const submit = () => {
    if (!rating) {
      setError(t("errRating"));
      return;
    }
    start(async () => {
      const res = await submitFeedbackAction({ appointmentId, rating, comment });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setOpen(false);
      toast.success(t("thanks"));
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-md gap-5 p-6" onInteractOutside={(e) => e.preventDefault()} data-testid="feedback-dialog">
        <DialogHeader className="items-center space-y-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-50 ring-8 ring-amber-50/50">
            <MessageSquareHeart className="h-7 w-7 text-amber-600" aria-hidden />
          </span>
          <DialogTitle className="text-xl text-navy-900">{t("title")}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t("body", { date: formatClinicDate(clinicDate, { year: undefined }, locale) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div
            role="radiogroup"
            aria-label={t("ratingLabel")}
            className="flex justify-center gap-1.5"
            dir="ltr"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} · ${t(`labels.${RATING_KEYS[n - 1]!}`)}`}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(0)}
                onClick={() => {
                  setRating(n);
                  setError(null);
                }}
                className="rounded-lg p-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-90"
              >
                <Star
                  className={cn(
                    "h-10 w-10 transition-colors",
                    n <= shown ? "fill-amber-400 text-amber-400" : "fill-transparent text-slate-300",
                  )}
                  aria-hidden
                />
              </button>
            ))}
          </div>
          <p className={cn("h-5 text-center text-sm font-semibold", shown ? "text-amber-700" : "text-muted-foreground")} aria-live="polite">
            {shown ? t(`labels.${RATING_KEYS[shown - 1]!}`) : t("tapToRate")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fb-comment" className="text-sm">
            {t("commentLabel", { doctor: doctorName })}
          </Label>
          <Textarea
            id="fb-comment"
            dir="auto"
            rows={3}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("commentPlaceholder")}
          />
        </div>

        {error ? (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button size="lg" className="h-12 w-full rounded-xl" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Star />} {t("submit")}
          </Button>
          <Button size="lg" variant="ghost" className="w-full" onClick={dismiss} disabled={pending}>
            {t("later")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
