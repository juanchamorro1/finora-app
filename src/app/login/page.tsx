import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/server/auth/guard";
import { authMode, registrationOpen } from "@/server/auth/session";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const deleted = (await searchParams).cuenta === "eliminada";
  if (authMode() === "disabled" || (await getCurrentUser())) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">F</span>
        Finora
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Hola de nuevo</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Ingresa con tu usuario para ver tus finanzas.</p>
      {deleted && (
        <p role="status" className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">
          Tu cuenta y todos tus datos fueron eliminados.
        </p>
      )}
      <LoginForm misconfigured={authMode() === "misconfigured"} />
      {registrationOpen() && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="font-medium text-foreground underline underline-offset-4">
            Crea una
          </Link>
        </p>
      )}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        <Link href="/politica-de-datos" className="underline underline-offset-4">
          Política de tratamiento de datos
        </Link>
      </p>
    </main>
  );
}
