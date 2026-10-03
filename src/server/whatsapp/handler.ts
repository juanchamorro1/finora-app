import { randomUUID } from "node:crypto";
import { PRIVACY_VERSION } from "@/lib/privacy";
import type { Db } from "../db-client";
import { runAssistant, type AssistantClient } from "../assistant/agent";
import {
  findUserByPhone,
  linkPhone,
  purgeOldMessages,
  recentConversation,
  saveMessage,
  unlinkWhatsApp,
} from "../services/whatsapp";
import type { IncomingMessage } from "./cloud-api";

/** Dependencias externas (inyectables en las pruebas). */
export interface WhatsAppDeps {
  send: (to: string, text: string) => Promise<void>;
  assistantClient?: AssistantClient;
  appUrl?: string;
  now?: () => Date;
}

const LINK_COMMAND = /^\s*vincular\s+(\d{6})\s*$/i;
const UNLINK_COMMAND = /^\s*desvincular\s*$/i;

function notLinkedReply(appUrl?: string) {
  return [
    "Hola 👋 Soy el asistente de Finora.",
    "Este número todavía no está vinculado a ninguna cuenta.",
    `Entra a Finora${appUrl ? ` (${appUrl})` : ""} → Ajustes → WhatsApp, genera tu código y envíamelo así: *vincular 123456*`,
  ].join("\n");
}

/** Procesa los mensajes de un webhook. Nunca lanza: los errores se registran y se avisa al usuario. */
export async function handleIncomingMessages(db: Db, messages: IncomingMessage[], deps: WhatsAppDeps) {
  const now = () => deps.now?.() ?? new Date();
  for (const message of messages) {
    try {
      await handleOne(db, message, deps, now());
    } catch (error) {
      console.error("[finora] error procesando mensaje de WhatsApp:", error);
      await deps.send(message.from, "Uy, algo falló de mi lado. Intenta de nuevo en un momento.").catch(() => {});
    }
  }
  await purgeOldMessages(db, now()).catch(() => {});
}

async function handleOne(db: Db, message: IncomingMessage, deps: WhatsAppDeps, now: Date) {
  const user = await findUserByPhone(db, message.from);
  // Freno de duplicados: Meta reintenta el webhook si no respondimos a tiempo.
  const isNew = await saveMessage(db, {
    id: message.id,
    userId: user?.id ?? null,
    phone: message.from,
    role: "user",
    text: message.text ?? "[mensaje sin texto]",
    createdAt: now,
  });
  if (!isNew) return;

  const reply = async (text: string, userId: string | null) => {
    await deps.send(message.from, text);
    if (userId) await saveMessage(db, { id: `out-${randomUUID()}`, userId, phone: message.from, role: "assistant", text, createdAt: new Date(now.getTime() + 1) });
  };

  if (!user) {
    // De números sin vincular solo se guarda el id (freno de duplicados), nunca el texto.
    await db.whatsAppMessage.update({ where: { id: message.id }, data: { text: "" } });
    const code = message.text?.match(LINK_COMMAND)?.[1];
    if (!code) return reply(notLinkedReply(deps.appUrl), null);
    const result = await linkPhone(db, message.from, code, now);
    if (result.ok) {
      return reply(
        [
          `¡Listo, ${result.userName}! Tu WhatsApp quedó vinculado a Finora ✅`,
          "Escríbeme como hablas, por ejemplo:",
          "• gasté 8 mil en papitas con Nequi",
          "• me pagaron 500 mil en Bancolombia",
          "• ¿cuánto llevo gastado este mes?",
          "Para desvincular escribe *desvincular*.",
        ].join("\n"),
        null,
      );
    }
    return reply(
      result.reason === "locked"
        ? "Demasiados intentos. Espera un minuto y vuelve a intentarlo."
        : "Ese código no es válido o ya venció (dura 10 minutos). Genera uno nuevo en Ajustes → WhatsApp.",
      null,
    );
  }

  if (message.text && UNLINK_COMMAND.test(message.text)) {
    await unlinkWhatsApp(db, user.id);
    return reply("Listo, desvinculé este número de Finora y borré esta conversación. Puedes volver a vincularlo desde Ajustes.", null);
  }
  if ((user.privacyVersion ?? 0) < PRIVACY_VERSION) {
    return reply("Antes de seguir, entra a Finora y acepta la política de tratamiento de datos actualizada.", user.id);
  }
  if (!message.text) {
    return reply("Por ahora solo entiendo mensajes de texto ✍️", user.id);
  }

  const history = (await recentConversation(db, user.id, now)).slice(0, -1); // sin el mensaje actual
  const answer = await runAssistant({
    db,
    userId: user.id,
    userName: user.name,
    history,
    message: message.text,
    now,
    client: deps.assistantClient,
  });
  await reply(answer, user.id);
}
