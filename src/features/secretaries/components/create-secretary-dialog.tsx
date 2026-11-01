"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSecretaryAction } from "@/features/secretaries/actions";

export function CreateSecretaryDialog() {
  const router = useRouter();
  const t = useTranslations("secretaries.create");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ fullName: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createSecretaryAction(values);
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
        return;
      }
      toast.success(t("done", { name: values.fullName }), { description: t("doneBody") });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValues({ fullName: "", email: "", password: "" });
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="sec-name">{t("fullName")}</Label>
            <Input id="sec-name" value={values.fullName} onChange={set("fullName")} autoFocus aria-invalid={!!errors.fullName} />
            {errors.fullName ? <p className="text-sm text-destructive">{errors.fullName[0]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sec-email">{t("email")}</Label>
            <Input id="sec-email" type="email" dir="ltr" className="text-start" autoComplete="off" value={values.email} onChange={set("email")} aria-invalid={!!errors.email} />
            {errors.email ? <p className="text-sm text-destructive">{errors.email[0]}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sec-pass">{t("password")}</Label>
            <div className="relative">
              <Input id="sec-pass" type={show ? "text" : "password"} autoComplete="new-password" value={values.password} onChange={set("password")} dir="ltr" className="pe-10 text-start" aria-invalid={!!errors.password} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label={show ? t("hide") : t("show")}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password ? <p className="text-sm text-destructive">{errors.password[0]}</p> : <p className="text-xs text-muted-foreground">{t("hint")}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
