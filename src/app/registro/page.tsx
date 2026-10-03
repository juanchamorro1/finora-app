import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/server/auth/guard";
import { authMode, registrationOpen } from "@/server/auth/session";

export const metadata: Metadata = { title: "Crear cuenta" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (authMode() === "disabled" || (await getCurrentUser())) redirect("/");
  const open = registrationOpen();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">F</span>
        Finora
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Gratis. Tus finanzas son privadas: nadie más puede verlas.
      </p>
      {open ? (
        <RegisterForm />
      ) : (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
          El registro de usuarios nuevos está cerrado por ahora.
        </p>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Inicia sesión
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        <Link href="/politica-de-datos" className="underline underline-offset-4">
          Política de tratamiento de datos
        </Link>
      </p>
    </main>
  );
}
