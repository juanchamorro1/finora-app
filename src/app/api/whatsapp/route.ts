import { after } from "next/server";
import { db } from "@/server/db";
import { readEnv } from "@/server/env";
import { isAssistantConfigured } from "@/server/assistant/agent";
import { isWhatsAppConfigured, parseWebhook, sendWhatsAppText, verifyWebhookSignature } from "@/server/whatsapp/cloud-api";
import { handleIncomingMessages } from "@/server/whatsapp/handler";

/**
 * Webhook de WhatsApp (Meta). Público: la autenticidad se comprueba con la
 * firma X-Hub-Signature-256, no con la sesión. Se responde 200 de inmediato y
 * el mensaje se procesa después (`after`) para que Meta no reintente.
 */

export const dynamic = "force-dynamic";
/** Tiempo para responder con el asistente después de contestar a Meta. */
export const maxDuration = 60;

/** Verificación del webhook al registrarlo en Meta. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = readEnv("WHATSAPP_VERIFY_TOKEN");
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  if (!isWhatsAppConfigured() || !isAssistantConfigured()) return new Response("Not configured", { status: 503 });
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), readEnv("WHATSAPP_APP_SECRET"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const messages = parseWebhook(payload);
  if (messages.length > 0) {
    const appUrl = new URL(request.url).origin;
    after(() => handleIncomingMessages(db, messages, { send: sendWhatsAppText, appUrl }));
  }
  return new Response("OK", { status: 200 });
}
