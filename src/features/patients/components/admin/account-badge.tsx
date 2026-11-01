import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function AccountBadge({ hasAccount, verified, compact = false }: { hasAccount: boolean; verified: boolean; compact?: boolean }) {
  const t = useTranslations("patients.account");
  const [label, cls] = !hasAccount
    ? [t("none"), "bg-slate-100 text-slate-600 ring-slate-200"]
    : verified
      ? [t("portal"), "bg-teal-50 text-teal-800 ring-teal-200"]
      : [t("unverified"), "bg-amber-50 text-amber-800 ring-amber-200"];
  if (compact && !hasAccount) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", cls)}>{label}</span>
  );
}
