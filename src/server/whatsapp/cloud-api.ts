import { createHmac, timingSafeEqual } from "node:crypto";
import { readEnv } from "../env";

/**
 * WhatsApp Business Cloud API (Meta).
 *
 * Variables de entorno:
 *   WHATSAPP_ACCESS_TOKEN     token de acceso de la app (para enviar mensajes)
 *   WHATSAPP_PHONE_NUMBER_ID  id del número de Finora en Meta
 *   WHATSAPP_APP_SECRET       secreto de la app: firma de los webhooks (X-Hub-Signature-256)
 *   WHATSAPP_VERIFY_TOKEN     texto que eliges al registrar el webhook en Meta
 *   WHATSAPP_DISPLAY_NUMBER   número que se muestra en Ajustes (ej. "+57 300 123 4567")
 *   WHATSAPP_GRAPH_VERSION    versión de la Graph API (opcional)
 */

const DEFAULT_GRAPH_VERSION = "v23.0";
/** WhatsApp acepta hasta 4096 caracteres por mensaje de texto. */
const MAX_TEXT = 4096;

export function isWhatsAppConfigured(): boolean {
  return ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"].every((k) =>
    Boolean(readEnv(k)),
  );
}

/** Verifica que el cuerpo del webhook venga de Meta (HMAC-SHA256 con el secreto de la app). */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Envía un texto a un número (solo dígitos con indicativo). */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const token = readEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = readEnv("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) throw new Error("WhatsApp no está configurado");
  const version = readEnv("WHATSAPP_GRAPH_VERSION") ?? DEFAULT_GRAPH_VERSION;
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT - 1)}…` : body },
    }),
  });
  if (!response.ok) {
    // No se registra el cuerpo enviado (puede tener datos financieros), solo el error de Meta.
    throw new Error(`WhatsApp respondió ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

/** Mensaje entrante ya extraído del webhook. */
export interface IncomingMessage {
  id: string;
  from: string;
  timestamp: Date;
  /** Texto, o null si no es un mensaje de texto (audio, foto…). */
  text: string | null;
}

/** Extrae los mensajes del cuerpo del webhook (ignora estados de entrega y otros eventos). */
export function parseWebhook(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] }).changes ?? []) {
      const messages = (change as { value?: { messages?: unknown[] } }).value?.messages ?? [];
      for (const raw of messages) {
        const m = raw as { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } };
        if (!m.id || !m.from) continue;
        out.push({
          id: m.id,
          from: m.from.replace(/\D/g, ""),
          timestamp: new Date(Number(m.timestamp ?? 0) * 1000 || Date.now()),
          text: m.type === "text" ? (m.text?.body ?? "").slice(0, 2000) : null,
        });
      }
    }
  }
  return out;
}
