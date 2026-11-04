"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deletePatientAction } from "@/features/patients/staff-actions";

/** Trash icon + confirmation for permanently deleting a visitor (Visitors page). */
export function DeletePatientButton({ patientId, name, redirectTo }: { patientId: string; name: string; redirectTo?: string }) {
  const router = useRouter();
  const t = useTranslations("patients.delete");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      const res = await deletePatientAction(patientId);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setOpen(false);
      toast.success(t("done"));
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-destructive/5 hover:text-destructive" aria-label={t("label", { name })}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("body", { name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} {t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
