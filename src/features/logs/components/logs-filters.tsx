"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const RANGES = ["today", "week", "month", "custom"] as const;

/** Date-range chips (Today / This week / This month / Custom) driving ?range=&from=&to=. */
export function LogsRangeFilter({ range, from, to }: { range: (typeof RANGES)[number]; from: string; to: string }) {
  const t = useTranslations("logs.range");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  useEffect(() => {
    setCustomFrom(from);
    setCustomTo(to);
  }, [from, to]);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.replace(`${pathname}?${next}`);
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div role="radiogroup" aria-label={t("label")} className="grid w-full grid-cols-2 gap-1 rounded-lg border bg-card p-1 sm:inline-flex sm:w-auto sm:gap-0">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            onClick={() => go(r === "custom" ? { range: r, from: customFrom, to: customTo } : { range: r, from: null, to: null })}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              range === r ? "bg-navy-900 text-white shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-navy-900",
            )}
          >
            {t(r)}
          </button>
        ))}
      </div>
      {range === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="log-from" className="text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <Input
              id="log-from"
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                if (e.target.value) go({ range: "custom", from: e.target.value, to: customTo });
              }}
              className="h-9 w-[10rem]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="log-to" className="text-xs text-muted-foreground">
              {t("to")}
            </Label>
            <Input
              id="log-to"
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => {
                setCustomTo(e.target.value);
                if (e.target.value) go({ range: "custom", from: customFrom, to: e.target.value });
              }}
              className="h-9 w-[10rem]"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
