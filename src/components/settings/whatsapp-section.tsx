"use client";

import { useState, useTransition } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createWhatsAppCodeAction, unlinkWhatsAppAction } from "@/server/actions/whatsapp";

/** Muestra "573001234567" como "+57 300 123 4567" (aprox.). */
function formatPhone(digits: string) {
  const m = /^57(\d{3})(\d{3})(\d{4})$/.exec(digits);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`;
}

export function WhatsAppSection({
  available,
  botNumber,
  linkedPhone,
  pendingCode,
}: {
  /** El servidor tiene WhatsApp y Claude configurados. */
  available: boolean;
  /** Número de Finora al que se escribe (para mostrarlo). */
  botNumber: string | null;
  linkedPhone: string | null;
  pendingCode: string | null;
}) {
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState(pendingCode);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [pending, startTransition] = useTransition();
  const waLink = botNumber ? `https://wa.me/${botNumber.replace(/\D/g, "")}` : null;

  if (!available) {
    return <p className="text-sm text-muted-foreground">El asistente de WhatsApp todavía no está activado en esta instalación.</p>;
  }

  if (linkedPhone) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="flex items-center gap-2">
          <Check className="size-4 text-income" aria-hidden />
          Vinculado al número <strong className="tabular">{formatPhone(linkedPhone)}</strong>
        </p>
        <p className="text-muted-foreground">
          Escríbele al asistente{botNumber ? <> al <strong className="text-foreground">{botNumber}</strong></> : ""}: por ejemplo
          “gasté 8 mil en papitas con Nequi” o “¿cuánto llevo gastado este mes?”.
        </p>
        <div className="flex flex-wrap gap-2">
          {waLink && (
            <Button variant="outline" size="sm" render={<a href={waLink} target="_blank" rel="noreferrer" />}>
              <MessageCircle /> Abrir chat
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setConfirmUnlink(true)}>
            Desvincular
          </Button>
        </div>
        <ConfirmDialog
          open={confirmUnlink}
          onOpenChange={setConfirmUnlink}
          title="¿Desvincular WhatsApp?"
          description="El asistente dejará de responder desde ese número y se borrará el historial de mensajes guardado en Finora."
          confirmLabel="Desvincular"
          onConfirm={async () => {
            const result = await unlinkWhatsAppAction();
            if (!result.ok) {
              toast.error(result.error);
              return false;
            }
            setCode(null);
            toast.success("WhatsApp desvinculado");
          }}
        />
      </div>
    );
  }

  if (code) {
    const message = `vincular ${code}`;
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Envía este mensaje{botNumber ? <> al <strong>{botNumber}</strong></> : ""} desde tu WhatsApp. El código vence en 10 minutos.
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded-md bg-muted px-3 py-2 font-mono text-base tracking-wider">{message}</code>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copiar mensaje"
            onClick={() => navigator.clipboard?.writeText(message).then(() => toast.success("Copiado"), () => {})}
          >
            <Copy />
          </Button>
        </div>
        {waLink && (
          <Button className="self-start" size="sm" render={<a href={`${waLink}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" />}>
            <MessageCircle /> Enviar por WhatsApp
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Cuando el asistente te confirme, recarga esta página.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-muted-foreground">
        Registra gastos y consulta tus finanzas escribiendo por WhatsApp, como hablas: “gasté 8 mil en papitas con Nequi”.
      </p>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-foreground"
        />
        <span>
          Acepto que mis mensajes y los datos financieros necesarios para responderlos pasen por WhatsApp (Meta) y por Claude
          (Anthropic), en Estados Unidos, como explica la{" "}
          <a href="/politica-de-datos" target="_blank" className="underline underline-offset-2">política de datos</a>.
        </span>
      </label>
      <Button
        className="self-start"
        disabled={!consent || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createWhatsAppCodeAction(consent);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            setCode(result.data.code);
          })
        }
      >
        <MessageCircle /> {pending ? "Generando…" : "Vincular WhatsApp"}
      </Button>
    </div>
  );
}
