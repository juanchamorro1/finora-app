import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_UPDATED, PRIVACY_VERSION, TRASH_RETENTION_DAYS } from "@/lib/privacy";
import { readEnv } from "@/server/env";

export const metadata: Metadata = { title: "Política de tratamiento de datos" };
// Lee FINORA_RESPONSABLE / FINORA_CONTACTO en cada petición (no en el build).
export const dynamic = "force-dynamic";

/**
 * Política de tratamiento de datos personales (Ley 1581 de 2012 y Decreto 1377
 * de 2013, Colombia). Página pública: se puede leer antes de iniciar sesión.
 * El responsable y el contacto se configuran con FINORA_RESPONSABLE y FINORA_CONTACTO.
 */
export default function PrivacyPolicyPage() {
  const responsable = readEnv("FINORA_RESPONSABLE") ?? "el administrador de esta instalación de Finora";
  const contacto = readEnv("FINORA_CONTACTO");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <Link href="/" className="mb-8 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">F</span>
        Finora
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Política de tratamiento de datos personales</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Versión {PRIVACY_VERSION} · Actualizada el {PRIVACY_UPDATED}
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        <section>
          <h2>1. Quién es el responsable</h2>
          <p>
            El responsable del tratamiento de tus datos es <strong>{responsable}</strong>.
            {contacto ? (
              <> Puedes escribir a <strong>{contacto}</strong> para cualquier consulta o reclamo.</>
            ) : (
              <> Puedes contactarlo directamente para cualquier consulta o reclamo.</>
            )}{" "}
            Esta política sigue la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia.
          </p>
        </section>

        <section>
          <h2>2. Qué datos tratamos</h2>
          <ul>
            <li>Tu nombre y nombre de usuario.</li>
            <li>Tu contraseña, guardada solo como un resumen cifrado (scrypt). Nadie puede verla.</li>
            <li>
              La información financiera que tú registras: cuentas, saldos, ingresos, gastos, transferencias, categorías,
              presupuestos, metas de ahorro, tasas de cambio y preferencias.
            </li>
            <li>La fecha en que aceptaste esta política.</li>
          </ul>
          <p className="mt-2">
            No pedimos documentos de identidad, números de tarjetas ni claves bancarias, y la app no se conecta a tus bancos.
          </p>
        </section>

        <section>
          <h2>3. Para qué los usamos</h2>
          <p>
            Únicamente para prestarte el servicio de Finora: mostrar tus saldos, estadísticas, presupuestos, metas y análisis
            de gastos. <strong>No vendemos, compartimos ni usamos tus datos para publicidad</strong>, ni los cruzamos con otras
            fuentes.
          </p>
        </section>

        <section>
          <h2>4. Dónde se guardan (transferencia internacional)</h2>
          <p>
            Tus datos se almacenan en servidores ubicados en <strong>Estados Unidos</strong>, operados por proveedores que
            actúan como encargados del tratamiento:
          </p>
          <ul className="mt-2">
            <li>
              <strong>Turso</strong> (ChiselStrike Inc.): base de datos.
            </li>
            <li>
              <strong>Vercel</strong> (Vercel Inc.): servidor donde funciona la app.
            </li>
          </ul>
          <p className="mt-2">
            Estados Unidos es considerado por la Superintendencia de Industria y Comercio (SIC) un país con nivel adecuado de
            protección de datos. Ambos proveedores se rigen por sus propios acuerdos de tratamiento de datos y cifran la
            información en tránsito. Al aceptar esta política autorizas esta transferencia.
          </p>
        </section>

        <section>
          <h2>5. Quién puede ver tus datos</h2>
          <ul>
            <li>Solo tú, desde tu sesión. Los demás usuarios de Finora no pueden ver tu información.</li>
            <li>
              El responsable, como administrador técnico, tiene acceso a la base de datos. Solo accederá cuando sea necesario
              para mantener el servicio, hacer copias de seguridad, atender una solicitud tuya o cumplir una orden de
              autoridad competente.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Cómo los protegemos</h2>
          <ul>
            <li>Conexión cifrada (HTTPS) y contraseñas guardadas con scrypt.</li>
            <li>Sesión con cookie firmada; cambiar la contraseña cierra las sesiones abiertas.</li>
            <li>Bloqueo temporal tras varios intentos fallidos de inicio de sesión.</li>
            <li>Separación estricta de los datos de cada usuario, verificada con pruebas automáticas.</li>
            <li>Las copias de seguridad se guardan cifradas.</li>
          </ul>
        </section>

        <section>
          <h2>7. Cuánto tiempo los conservamos</h2>
          <ul>
            <li>Mientras tu cuenta exista.</li>
            <li>Los movimientos que envías a la papelera se borran definitivamente a los {TRASH_RETENTION_DAYS} días.</li>
            <li>Si eliminas tu cuenta, todos tus datos se borran de inmediato y de forma definitiva de la base de datos.</li>
            <li>Las copias de seguridad cifradas se eliminan cuando dejan de ser necesarias.</li>
          </ul>
        </section>

        <section>
          <h2>8. Tus derechos</h2>
          <p>Como titular puedes, en cualquier momento y sin costo:</p>
          <ul className="mt-2">
            <li>
              <strong>Conocer</strong> tus datos: en <em>Ajustes → Privacidad → Descargar mis datos</em>.
            </li>
            <li>
              <strong>Actualizar y rectificar</strong>: editando tus cuentas, movimientos, metas y demás información en la app.
            </li>
            <li>
              <strong>Suprimir</strong> tus datos y <strong>revocar</strong> esta autorización: en{" "}
              <em>Ajustes → Privacidad → Eliminar mi cuenta</em>.
            </li>
            <li>
              Presentar <strong>consultas</strong> (respuesta en máximo 10 días hábiles) y <strong>reclamos</strong> (máximo 15
              días hábiles) ante el responsable.
            </li>
            <li>
              Presentar quejas ante la <strong>Superintendencia de Industria y Comercio</strong> (www.sic.gov.co) después de
              agotar el trámite ante el responsable.
            </li>
          </ul>
        </section>

        <section>
          <h2>9. Menores de edad</h2>
          <p>
            Finora está pensada para mayores de edad. Un menor solo puede usarla con la autorización de su representante
            legal, quien acepta esta política en su nombre.
          </p>
        </section>

        <section>
          <h2>10. Cookies</h2>
          <p>
            Usamos una sola cookie técnica (<code>finora_session</code>) para mantener tu sesión abierta. No usamos cookies
            de analítica, seguimiento ni publicidad.
          </p>
        </section>

        <section>
          <h2>11. Incidentes de seguridad</h2>
          <p>
            Si ocurre un incidente que comprometa tus datos, te avisaremos sin demora y lo informaremos a la SIC, como exige
            la ley.
          </p>
        </section>

        <section>
          <h2>12. Cambios a esta política</h2>
          <p>
            Si la política cambia de forma importante, publicaremos una nueva versión y te pediremos aceptarla otra vez antes
            de seguir usando la app.
          </p>
        </section>
      </div>

      <div className="mt-12 text-sm">
        <Link href="/" className="underline underline-offset-4">
          Volver a Finora
        </Link>
      </div>
    </main>
  );
}
