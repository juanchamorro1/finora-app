import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { acceptPrivacyAction, logoutAction } from "@/server/actions/auth";
import { requirePageUser } from "@/server/auth/guard";
import { authMode } from "@/server/auth/session";

export const metadata: Metadata = { title: "Tus datos" };
export const dynamic = "force-dynamic";

/** Autorización previa, expresa e informada (Ley 1581, art. 9) antes de usar la app. */
export default async function AcceptPrivacyPage({ searchParams }: PageProps<"/privacidad/aceptar">) {
  const user = await requirePageUser({ allowPendingPrivacy: true });
  if (user.privacyAccepted) redirect("/");
  const missing = (await searchParams).falta === "1";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">F</span>
        Finora
      </div>
      <ShieldCheck className="mb-3 size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Antes de empezar, {user.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Para usar Finora necesitamos tu autorización para tratar tus datos.</p>

      <ul className="mt-6 flex flex-col gap-2 text-sm">
        <li>• Solo usamos tu información para mostrarte tus finanzas. No la vendemos ni la compartimos.</li>
        <li>
          • Se guarda en servidores en <strong>Estados Unidos</strong> (Turso y Vercel).
        </li>
        <li>• Ningún otro usuario puede verla. El administrador técnico solo accede cuando es necesario.</li>
        <li>• Puedes descargar tus datos o eliminar tu cuenta cuando quieras, desde Ajustes.</li>
      </ul>

      <p className="mt-4 text-sm">
        <Link href="/politica-de-datos" target="_blank" className="underline underline-offset-4">
          Leer la política completa (versión {PRIVACY_VERSION})
        </Link>
      </p>

      <form action={acceptPrivacyAction} className="mt-8 flex flex-col gap-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="acepto" value="si" required className="mt-0.5 size-4 shrink-0 accent-foreground" />
          <span>
            He leído y acepto la política de tratamiento de datos, incluida la transferencia a Estados Unidos. Soy mayor de
            edad o tengo autorización de mi representante legal.
          </span>
        </label>
        {missing && (
          <p role="alert" className="text-sm text-destructive">
            Debes marcar la casilla para continuar.
          </p>
        )}
        <Button type="submit" className="h-10">
          Aceptar y continuar
        </Button>
      </form>

      {authMode() === "enabled" && (
        <form action={logoutAction} className="mt-3">
          <Button type="submit" variant="ghost" className="w-full">
            <ArrowLeft /> No acepto, salir
          </Button>
        </form>
      )}
    </main>
  );
}
