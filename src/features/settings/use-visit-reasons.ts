"use client";

import { useEffect, useState } from "react";
import { VISIT_REASONS, type VisitReason } from "@/server/domain/queue/constants";
import { listVisitReasonsAction } from "./visit-reason-actions";

/**
 * One choice in a reason picker. Built-in reasons map to their enum value;
 * doctor-added ones are booked as 'other' with `details` = their Arabic name.
 */
export interface ReasonOption {
  key: string;
  reason: VisitReason;
  /** Set for doctor-added reasons; sent as visit_reason_details. */
  details?: string;
  labelAr?: string;
  labelEn?: string | null;
  durationMinutes: number | null;
}

const fallback = (): ReasonOption[] => VISIT_REASONS.map((reason) => ({ key: reason, reason, durationMinutes: null }));

/** Label for an option: translated built-in name, or the custom name in the UI language. */
export function reasonOptionLabel(o: ReasonOption, locale: string, tReason: (r: VisitReason) => string): string {
  if (!o.details) return tReason(o.reason);
  return locale === "en" ? o.labelEn || o.labelAr || o.details : o.labelAr || o.details;
}

/**
 * Active visit reasons (built-in + doctor-added) in the doctor's order, with
 * their default durations. Refetched each time a picker opens, so changes in
 * settings show up right away. Falls back to the fixed list if loading fails.
 */
export function useVisitReasons(enabled = true): ReasonOption[] {
  const [options, setOptions] = useState<ReasonOption[]>(fallback);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listVisitReasonsAction().then((res) => {
      if (cancelled || !res.ok || res.data.builtin.length === 0) return;
      const merged = [
        ...res.data.builtin.filter((r) => r.isActive).map((r) => ({ order: r.sortOrder, option: { key: r.reason, reason: r.reason, durationMinutes: r.durationMinutes } as ReasonOption })),
        ...res.data.custom
          .filter((c) => c.isActive)
          .map((c) => ({
            order: c.sortOrder,
            option: {
              key: `custom:${c.id}`,
              reason: "other" as const,
              details: c.labelAr,
              labelAr: c.labelAr,
              labelEn: c.labelEn,
              durationMinutes: c.durationMinutes,
            } as ReasonOption,
          })),
      ].sort((a, b) => a.order - b.order);
      setOptions(merged.map((m) => m.option));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return options;
}
