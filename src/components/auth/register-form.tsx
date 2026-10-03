"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/server/actions/auth";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, undefined);
  const err = (field: string) => state?.fieldErrors?.[field];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Tu nombre</Label>
        <Input
          id="name"
          name="name"
          autoComplete="given-name"
          maxLength={40}
          required
          autoFocus
          // La clave recrea el campo al volver del servidor (Base UI no admite cambiar defaultValue).
          key={`name-${state?.values?.name ?? ""}`}
          defaultValue={state?.values?.name}
          aria-invalid={Boolean(err("name")) || undefined}
          className="h-10"
        />
        {err("name") && <p className="text-sm text-destructive">{err("name")}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Usuario</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9._\-]{3,30}"
          required
          key={`username-${state?.values?.username ?? ""}`}
          defaultValue={state?.values?.username}
          aria-invalid={Boolean(err("username")) || undefined}
          aria-describedby="username-hint"
          className="h-10"
        />
        {err("username") ? (
          <p className="text-sm text-destructive">{err("username")}</p>
        ) : (
          <p id="username-hint" className="text-xs text-muted-foreground">
            Con este entras. Letras, números, punto o guion (ej. maria.gomez).
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={200}
          required
          aria-invalid={Boolean(err("password")) || undefined}
          className="h-10"
        />
        {err("password") ? (
          <p className="text-sm text-destructive">{err("password")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Repite la contraseña</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(err("confirm")) || undefined}
          className="h-10"
        />
        {err("confirm") && <p className="text-sm text-destructive">{err("confirm")}</p>}
      </div>
      {/* Campo trampa para bots: invisible para las personas. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="sitio">No llenar</label>
        <input id="sitio" name="sitio" tabIndex={-1} autoComplete="off" />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
