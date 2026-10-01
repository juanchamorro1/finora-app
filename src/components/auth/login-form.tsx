"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/actions/auth";

export function LoginForm({ misconfigured }: { misconfigured: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={Boolean(state?.error) || undefined}
          className="h-10"
        />
        {(state?.error || misconfigured) && (
          <p role="alert" className="text-sm text-destructive">
            {state?.error ?? "La app no tiene contraseña configurada."}
          </p>
        )}
      </div>
      <Button type="submit" className="h-10" disabled={pending || misconfigured}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
