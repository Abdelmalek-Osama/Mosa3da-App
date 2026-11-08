import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Message keys (portal.feedback.labels) for 1 … 5 stars. */
export const RATING_KEYS = ["poor", "fair", "good", "veryGood", "excellent"] as const;

/** Read-only stars for the doctor's Reviews page. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} dir="ltr" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("h-4 w-4", n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-transparent text-slate-300")}
        />
      ))}
    </span>
  );
}
