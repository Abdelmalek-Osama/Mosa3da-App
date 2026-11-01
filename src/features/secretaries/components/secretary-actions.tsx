"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Power, PowerOff } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetSecretaryPasswordAction, setSecretaryActiveAction } from "@/features/secretaries/actions";

export function SecretaryActions({ id, name, active }: { id: string; name: string; active: boolean }) {
  const router = useRouter();
  const t = useTranslations("secretaries.actions");
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const toggle = () =>
    start(async () => {
      const res = await setSecretaryActiveAction({ id, active: !active });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(active ? t("deactivated", { name }) : t("reactivated", { name }));
      setConfirmOpen(false);
      router.refresh();
    });

  const reset = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await resetSecretaryPasswordAction({ id, password });
      if (!res.ok) {
        setPwError(res.error.fieldErrors?.password?.[0] ?? res.error.message);
        return;
      }
      toast.success(t("pwChanged"), { description: t("pwChangedBody", { name }) });
      setPwOpen(false);
    });
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {active ? (
        <Dialog
          open={pwOpen}
          onOpenChange={(o) => {
            setPwOpen(o);
            setPassword("");
            setPwError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <KeyRound /> {t("reset")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("resetTitle", { name })}</DialogTitle>
              <DialogDescription>{t("resetBody")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={reset} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor={`pw-${id}`}>{t("newPassword")}</Label>
                <Input id={`pw-${id}`} type="text" dir="ltr" className="text-start" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!pwError} />
                {pwError ? <p className="text-sm text-destructive">{pwError}</p> : <p className="text-xs text-muted-foreground">{t("hint")}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPwOpen(false)} disabled={pending}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null} {t("savePassword")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !pending && setConfirmOpen(o)}>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant={active ? "ghost" : "secondary"} className={active ? "text-destructive hover:bg-destructive/5 hover:text-destructive" : ""}>
            {active ? <PowerOff /> : <Power />} {active ? t("deactivate") : t("reactivate")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{active ? t("deactivateTitle", { name }) : t("reactivateTitle", { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {active ? t("deactivateBody") : t("reactivateBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
            <Button variant={active ? "destructive" : "default"} onClick={toggle} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} {active ? t("deactivate") : t("reactivate")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
