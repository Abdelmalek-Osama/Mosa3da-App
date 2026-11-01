"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QueueEntryView } from "@/server/domain/queue/types";

const PRESETS = [10, 15, 20, 30, 45];

export function DurationDialog({
  entry,
  pending,
  onOpenChange,
  onSave,
}: {
  entry: QueueEntryView | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (minutes: number) => void;
}) {
  const t = useTranslations("queue.duration");
  const tq = useTranslations("queue");
  const [minutes, setMinutes] = useState(20);
  useEffect(() => {
    if (entry) setMinutes(entry.estimatedDurationMinutes);
  }, [entry]);
  const valid = Number.isInteger(minutes) && minutes >= 5 && minutes <= 180;

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body", { name: entry?.patientName ?? "" })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p} type="button" size="sm" variant={p === minutes ? "secondary" : "outline"} onClick={() => setMinutes(p)}>
              {tq("min", { count: p })}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration-minutes">{t("minutes")}</Label>
          <Input id="duration-minutes" type="number" min={5} max={180} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-invalid={!valid} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{t("cancel")}</Button>
          <Button onClick={() => onSave(minutes)} disabled={!valid || pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
