"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { registerWalkInAction, searchPatientsAction } from "@/features/queue/actions";
import { ReceptionActivation } from "@/features/patients/components/reception-activation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PhoneInput } from "@/components/shared/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone, formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { reasonOptionLabel, useVisitReasons } from "@/features/settings/use-visit-reasons";

interface FoundPatient {
  id: string;
  fullName: string;
  phone: string;
}

type FieldErrors = Record<string, string[] | undefined>;

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const message = errors[name]?.[0];
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function WalkInDialog({
  defaultDuration = 20,
  timezone,
  trigger,
}: {
  defaultDuration?: number;
  timezone: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("walkIn");
  const tReason = useTranslations("visitReason");
  const tq = useTranslations("queue");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  // Reason decides the duration (doctor's settings, P3-19); no manual pills.
  const reasons = useVisitReasons(open);
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [fullName, setFullName] = useState("");
  const [fullNameEn, setFullNameEn] = useState("");
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoundPatient | null>(null);
  // Selected option key: a built-in reason, or "custom:<id>" for a doctor-added one.
  const [visitReason, setVisitReason] = useState("");
  const [details, setDetails] = useState("");
  const selectedReason = reasons.find((o) => o.key === visitReason);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function reset() {
    setMode("new");
    setFullName("");
    setFullNameEn("");
    setPhone("");
    setQuery("");
    setResults([]);
    setSelected(null);
    setVisitReason("");
    setDetails("");
    setNotes("");
    setErrors({});
    setFormKey((k) => k + 1);
  }

  useEffect(() => {
    if (mode !== "existing" || selected || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      const res = await searchPatientsAction(query);
      setSearching(false);
      if (res.ok) setResults(res.data);
    }, 250);
    return () => clearTimeout(id);
  }, [query, mode, selected]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReason) {
      setErrors({ visitReason: [t("selectReason")] });
      return;
    }
    startTransition(async () => {
      const res = await registerWalkInAction({
        mode,
        patientId: selected?.id,
        fullName: mode === "new" ? fullName : undefined,
        fullNameEn: mode === "new" ? fullNameEn || undefined : undefined,
        phone: mode === "new" ? phone : undefined,
        visitReason: selectedReason!.reason,
        visitReasonDetails: selectedReason!.details ?? (details || undefined),
        notes: notes || undefined,
      });
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
        return;
      }
      toast.success(t("added", { number: res.data.queue_number ?? "" }), {
        description: res.data.expected_start_at
          ? `${t("expectedAt", { time: formatTime(res.data.expected_start_at, timezone, locale) })}${res.data.patient_created ? ` · ${t("created")}` : ""}`
          : undefined,
      });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <UserPlus /> {t("trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <RadioGroup
            value={mode}
            onValueChange={(v) => {
              setMode(v as "new" | "existing");
              setErrors({});
            }}
            className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            aria-label={t("type")}
          >
            <RadioGroupItem value="new">{t("new")}</RadioGroupItem>
            <RadioGroupItem value="existing">{t("existing")}</RadioGroupItem>
          </RadioGroup>

          {mode === "new" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="wi-name">{t("fullName")}</Label>
                <Input id="wi-name" dir="rtl" lang="ar" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" placeholder={t("namePlaceholder")} aria-invalid={!!errors.fullName} autoFocus />
                <FieldError errors={errors} name="fullName" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="wi-name-en">{t("fullNameEn")}</Label>
                <Input id="wi-name-en" dir="ltr" lang="en" className="text-start" value={fullNameEn} onChange={(e) => setFullNameEn(e.target.value)} autoComplete="off" placeholder="e.g. Sara Ahmed Hassan" aria-invalid={!!errors.fullNameEn} />
                <FieldError errors={errors} name="fullNameEn" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="wi-phone">{t("phone")}</Label>
                <PhoneInput key={formKey} id="wi-phone" defaultValue={phone} onChange={setPhone} invalid={!!errors.phone} />
                <p className="text-xs text-muted-foreground">{t("phoneHint")}</p>
                <FieldError errors={errors} name="phone" />
              </div>
              <div className="sm:col-span-2">
                <ReceptionActivation key={formKey} fullName={fullName} phone={phone} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="wi-search">{t("find")}</Label>
              {selected ? (
                <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-accent/60 px-3 py-2.5">
                  <div>
                    <div dir="auto" className="text-start font-medium">{selected.fullName}</div>
                    <div className="tabular text-xs text-muted-foreground">{formatPhone(selected.phone)}</div>
                  </div>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setSelected(null)} aria-label={t("change")}>
                    <X />
                  </Button>
                </div>
              ) : null}
              {selected ? (
                <ReceptionActivation key={selected.id} fullName={selected.fullName} phone={selected.phone} />
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="wi-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} className="ps-9" autoComplete="off" aria-invalid={!!errors.patientId} autoFocus />
                    {searching ? <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
                  </div>
                  {results.length ? (
                    <ul className="max-h-48 overflow-y-auto rounded-lg border" role="listbox">
                      {results.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => setSelected(p)} className="flex w-full items-center justify-between px-3 py-2.5 text-start text-sm hover:bg-muted">
                            <span dir="auto" className="font-medium">{p.fullName}</span>
                            <span className="tabular text-xs text-muted-foreground">{formatPhone(p.phone)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : query.trim().length >= 2 && !searching ? (
                    <p className="text-sm text-muted-foreground">
                      {t("noMatch")}{" "}
                      <button type="button" className="font-medium text-secondary hover:underline" onClick={() => { setMode("new"); setFullName(query); }}>
                        {t("registerNew")}
                      </button>
                    </p>
                  ) : null}
                  <FieldError errors={errors} name="patientId" />
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("reason")}</Label>
              <Select value={visitReason} onValueChange={setVisitReason}>
                <SelectTrigger aria-invalid={!!errors.visitReason}>
                  <SelectValue placeholder={t("selectReasonPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {reasonOptionLabel(o, locale, tReason)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={errors} name="visitReason" />
            </div>
            {selectedReason?.reason === "other" && !selectedReason.details ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="wi-details">{t("describe")}</Label>
                <Input id="wi-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={200} aria-invalid={!!errors.visitReasonDetails} />
                <FieldError errors={errors} name="visitReasonDetails" />
              </div>
            ) : null}
            {visitReason ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {t("autoDuration", { minutes: selectedReason?.durationMinutes ?? defaultDuration })}
              </p>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="wi-notes">{t("notes")}</Label>
              <Textarea id="wi-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder={t("notesPlaceholder")} />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>{t("cancel")}</Button>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
              {t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
