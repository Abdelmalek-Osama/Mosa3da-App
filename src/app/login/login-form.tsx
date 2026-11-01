"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Loader2, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { staffSignInAction, type SignInState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("staffLogin");
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
      {pending ? t("signingIn") : t("signIn")}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("staffLogin");
  const [state, formAction] = useFormState<SignInState, FormData>(staffSignInAction, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="name@example.com"
          dir="ltr"
          className="text-start"
          aria-invalid={!!state.fieldErrors?.email}
          required
        />
        {state.fieldErrors?.email ? <p className="text-sm text-destructive">{state.fieldErrors.email}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!state.fieldErrors?.password}
          required
        />
        {state.fieldErrors?.password ? <p className="text-sm text-destructive">{state.fieldErrors.password}</p> : null}
      </div>
      {state.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}
      <SubmitButton />
    </form>
  );
}
