import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-sm",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z" />
        <path d="M9 12h6M12 9v6" />
      </svg>
    </div>
  );
}

export function BrandLockup({ inverted = false, subtitle }: { inverted?: boolean; subtitle?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className={cn("flex items-baseline gap-2 font-semibold", inverted ? "text-white" : "text-navy-900")}>
          <span className="font-arabic">مساعدة</span>
          <span className={cn("font-sans text-sm", inverted ? "text-teal-200" : "text-teal-600")}>Mosa3da</span>
        </div>
        {subtitle ? (
          <div className={cn("truncate text-xs", inverted ? "text-navy-200" : "text-muted-foreground")}>{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}
