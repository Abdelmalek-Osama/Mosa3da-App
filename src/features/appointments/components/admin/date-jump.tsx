"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";

export function DateJump({ value }: { value: string }) {
  const router = useRouter();
  const t = useTranslations("appointments");
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => e.target.value && router.push(`/admin/appointments?date=${e.target.value}`)}
      className="h-8 w-[9.5rem] text-sm"
      aria-label={t("goToDate")}
    />
  );
}
