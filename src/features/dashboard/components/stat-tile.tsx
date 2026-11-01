import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  navy: "bg-navy-50 text-navy-700",
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  emerald: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
} as const;

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "navy",
  href,
}: {
  href?: string;
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", TONES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="tabular mt-3 text-2xl font-semibold tracking-tight text-navy-900 sm:text-3xl">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border bg-card p-4 shadow-soft transition-colors hover:border-teal-300">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border bg-card p-4 shadow-soft">{body}</div>
  );
}
