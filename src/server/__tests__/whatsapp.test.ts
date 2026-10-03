import { createHmac } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb, createTestUser } from "./test-db";
import type { AssistantClient } from "../assistant/agent";
import { runAssistantTool } from "../assistant/tools";
import { createAccount } from "../services/accounts";
import { ensureDefaultCategories } from "../services/categories";
import { computeBalance } from "../services/ledger";
import { acceptPrivacyPolicy } from "../services/users";
import { createLinkCode, getWhatsAppStatus, linkPhone, purgeOldMessages } from "../services/whatsapp";
import { parseWebhook, verifyWebhookSignature } from "../whatsapp/cloud-api";
import { handleIncomingMessages } from "../whatsapp/handler";

const PHONE = "573001234567";
let seq = 0;
const incoming = (text: string | null, from = PHONE) => ({ id: `wamid.${seq++}`, from, timestamp: new Date(), text });

/** Cliente de Claude falso: devuelve las respuestas en orden y guarda las peticiones. */
function fakeClaude(responses: Partial<Anthropic.Beta.BetaMessage>[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client: AssistantClient = {
    beta: {
      messages: {
        async create(params) {
          // Copia: el agente sigue agregando mensajes al mismo arreglo.
          requests.push({ ...params, messages: [...params.messages] });
          const next = responses.shift();
          if (!next) throw new Error("sin más respuestas");
          return { stop_reason: "end_turn", content: [], ...next } as Anthropic.Beta.BetaMessage;
        },
      },
    },
  };
  return { client, requests };
}

const text = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.Beta.BetaTextBlock;
const toolUse = (name: string, input: unknown) =>
  ({ type: "tool_use", id: `tu_${seq++}`, name, input }) as Anthropic.Beta.BetaToolUseBlock;

describe("WhatsApp", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  let nequi: string;
  let sent: { to: string; text: string }[];
  const send = async (to: string, t: string) => {
    sent.push({ to, text: t });
  };

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    await acceptPrivacyPolicy(db, uid);
    await ensureDefaultCategories(db, uid);
    nequi = (await createAccount(db, uid, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 50_000n })).id;
    sent = [];
  });
  afterEach(() => cleanup());

  it("verifica la firma de Meta", () => {
    const body = '{"a":1}';
    const sig = `sha256=${createHmac("sha256", "secreto").update(body).digest("hex")}`;
    expect(verifyWebhookSignature(body, sig, "secreto")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "secreto")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "otro")).toBe(false);
    expect(verifyWebhookSignature(body, null, "secreto")).toBe(false);
    expect(verifyWebhookSignature(body, sig, undefined)).toBe(false);
  });

  it("extrae solo los mensajes del webhook", () => {
    const payload = {
      entry: [
        {
          changes: [
            { value: { messages: [{ id: "m1", from: "573001234567", timestamp: "1700000000", type: "text", text: { body: "hola" } }] } },
            { value: { statuses: [{ id: "s1", status: "delivered" }] } },
            { value: { messages: [{ id: "m2", from: "573001234567", timestamp: "1700000001", type: "audio" }] } },
          ],
        },
      ],
    };
    expect(parseWebhook(payload).map((m) => [m.id, m.text])).toEqual([["m1", "hola"], ["m2", null]]);
    expect(parseWebhook({})).toEqual([]);
  });

  it("vincula el número con un código válido y frena los intentos", async () => {
    const code = await createLinkCode(db, uid);
    expect((await getWhatsAppStatus(db, uid)).pendingCode?.code).toBe(code);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await linkPhone(db, PHONE, wrong)).toEqual({ ok: false, reason: "invalid" });
    expect(await linkPhone(db, PHONE, code)).toEqual({ ok: false, reason: "locked" });
    expect(await linkPhone(db, PHONE, code, new Date(Date.now() + 61_000))).toMatchObject({ ok: true });
    expect((await getWhatsAppStatus(db, uid)).phone).toBe(PHONE);
    // El código se usa una sola vez.
    expect(await linkPhone(db, "573009999999", code)).toEqual({ ok: false, reason: "invalid" });
  });

  it("el código vence a los 10 minutos", async () => {
    const now = new Date();
    const code = await createLinkCode(db, uid, now);
    expect(await linkPhone(db, PHONE, code, new Date(now.getTime() + 11 * 60_000))).toEqual({ ok: false, reason: "invalid" });
  });

  it("flujo completo: sin vincular → vincular → registrar un gasto conversando", async () => {
    await handleIncomingMessages(db, [incoming("hola")], { send });
    expect(sent.at(-1)?.text).toMatch(/no está vinculado/);
    // De números sin vincular no se guarda el texto.
    expect(await db.whatsAppMessage.count({ where: { text: { not: "" } } })).toBe(0);

    const code = await createLinkCode(db, uid);
    await handleIncomingMessages(db, [incoming(`vincular ${code}`)], { send });
    expect(sent.at(-1)?.text).toMatch(/quedó vinculado/);

    const { client, requests } = fakeClaude([
      { stop_reason: "tool_use", content: [toolUse("record_transaction", { type: "EXPENSE", amount: "8000", account: "nequi", category: "comida", description: "Papitas" })] },
      { stop_reason: "end_turn", content: [text("Listo: gasto de *$8.000* en Comida desde Nequi. Te quedan $42.000.")] },
    ]);
    await handleIncomingMessages(db, [incoming("gasté 8 mil en papitas con nequi")], { send, assistantClient: client });

    expect(await computeBalance(db, uid, nequi)).toBe(42_000n);
    expect(sent.at(-1)).toEqual({ to: PHONE, text: "Listo: gasto de *$8.000* en Comida desde Nequi. Te quedan $42.000." });
    // Petición al modelo: Opus 5.5 con fallback, y la 2.ª vuelta lleva la respuesta anterior intacta + el resultado.
    expect(requests[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "low" } });
    expect(requests[1].messages.at(-2)).toMatchObject({ role: "assistant" });
    const result = (requests[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(JSON.parse(result.content as string)).toMatchObject({ amount: "$8.000", newBalance: "$42.000", category: "Comida" });
    // Se guarda la conversación (mensaje del usuario + respuesta).
    expect(await db.whatsAppMessage.count({ where: { userId: uid } })).toBe(2);
  });

  it("ignora el mismo mensaje repetido (reintento de Meta)", async () => {
    await linkTestPhone(db, uid);
    const { client, requests } = fakeClaude([{ content: [text("Hola")] }]);
    const msg = incoming("hola");
    await handleIncomingMessages(db, [msg], { send, assistantClient: client });
    await handleIncomingMessages(db, [msg], { send, assistantClient: client });
    expect(requests).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("pide aceptar la política vigente y no responde audios con la IA", async () => {
    await linkTestPhone(db, uid);
    const { client, requests } = fakeClaude([]);
    await handleIncomingMessages(db, [incoming(null)], { send, assistantClient: client });
    expect(sent.at(-1)?.text).toMatch(/solo entiendo mensajes de texto/);
    await db.user.update({ where: { id: uid }, data: { privacyVersion: 1 } });
    await handleIncomingMessages(db, [incoming("hola")], { send, assistantClient: client });
    expect(sent.at(-1)?.text).toMatch(/acepta la política/);
    expect(requests).toHaveLength(0);
  });

  it("desvincular borra el número y el historial", async () => {
    await linkTestPhone(db, uid);
    await handleIncomingMessages(db, [incoming("desvincular")], { send });
    expect((await getWhatsAppStatus(db, uid)).phone).toBeNull();
    expect(await db.whatsAppMessage.count({ where: { userId: uid } })).toBe(0);
  });

  it("si una herramienta falla, el error vuelve al modelo para que pregunte", async () => {
    await linkTestPhone(db, uid);
    const { client, requests } = fakeClaude([
      { stop_reason: "tool_use", content: [toolUse("record_transaction", { type: "EXPENSE", amount: "5000", account: "Daviplata", category: "Comida" })] },
      { content: [text("No tienes una cuenta Daviplata. ¿Lo registro en Nequi?")] },
    ]);
    await handleIncomingMessages(db, [incoming("5 mil de almuerzo en daviplata")], { send, assistantClient: client });
    const result = (requests[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(result).toMatchObject({ is_error: true });
    expect(result.content).toMatch(/No encontré la cuenta "Daviplata". Opciones: Nequi/);
    expect(await computeBalance(db, uid, nequi)).toBe(50_000n);
  });

  it("con Haiku no envía opciones que ese modelo no acepta", async () => {
    await linkTestPhone(db, uid);
    const { client, requests } = fakeClaude([{ content: [text("Hola")] }]);
    const { runAssistant } = await import("../assistant/agent");
    await runAssistant({ db, userId: uid, userName: "Juan", history: [], message: "hola", client, model: "claude-haiku-4-5" });
    expect(requests[0].model).toBe("claude-haiku-4-5");
    expect(requests[0]).not.toHaveProperty("fallbacks");
    expect(requests[0]).not.toHaveProperty("output_config");
  });

  it("retención: borra mensajes de más de 30 días", async () => {
    await linkTestPhone(db, uid);
    const { client } = fakeClaude([{ content: [text("Hola")] }]);
    await handleIncomingMessages(db, [incoming("hola")], { send, assistantClient: client });
    expect(await purgeOldMessages(db, new Date(Date.now() + 31 * 86_400_000))).toBe(2);
  });
});

describe("herramientas de escritura del asistente", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  let nequi: string;
  let banco: string;

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    await ensureDefaultCategories(db, uid);
    nequi = (await createAccount(db, uid, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 50_000n })).id;
    banco = (await createAccount(db, uid, { name: "Bancolombia", type: "BANK", currency: "COP", openingBalance: 100_000n })).id;
  });
  afterEach(() => cleanup());

  it("registra ingresos y transferencias, y deshace el último", async () => {
    await runAssistantTool(db, uid, "record_transaction", { type: "INCOME", amount: "500000", account: "bancolombia", category: "Trabajo" });
    expect(await computeBalance(db, uid, banco)).toBe(600_000n);
    const t = await runAssistantTool(db, uid, "record_transfer", { amount: "20000", from_account: "Bancolombia", to_account: "Nequi" });
    expect(t).toMatchObject({ newBalances: { Bancolombia: "$580.000", Nequi: "$70.000" } });
    expect(await runAssistantTool(db, uid, "undo_last_movement", {})).toMatchObject({ undone: true, type: "TRANSFER" });
    expect(await computeBalance(db, uid, nequi)).toBe(50_000n);
    const recent = (await runAssistantTool(db, uid, "get_recent_movements", { limit: 1 })) as { type: string }[];
    expect(recent[0].type).toBe("INCOME");
  });

  it("valida montos, fechas y categorías", async () => {
    await expect(runAssistantTool(db, uid, "record_transaction", { type: "EXPENSE", amount: "0", account: "Nequi", category: "Comida" })).rejects.toThrow(/mayor a 0/);
    await expect(runAssistantTool(db, uid, "record_transaction", { type: "EXPENSE", amount: "1000", account: "Nequi", category: "Comida", date: "2999-01-01" })).rejects.toThrow(/futura/);
    await expect(runAssistantTool(db, uid, "record_transaction", { type: "EXPENSE", amount: "1000", account: "Nequi", category: "Ahorro para metas" })).rejects.toThrow(/No encontré la categoría/);
  });

  it("nunca toca cuentas de otro usuario", async () => {
    const mama = await createTestUser(db, "mama");
    await createAccount(db, mama, { name: "Davivienda", type: "BANK", currency: "COP", openingBalance: 900_000n });
    await expect(
      runAssistantTool(db, uid, "record_transaction", { type: "EXPENSE", amount: "1000", account: "Davivienda", category: "Comida" }),
    ).rejects.toThrow(/No encontré la cuenta/);
    const accounts = (await runAssistantTool(db, uid, "get_accounts", {})) as { name: string }[];
    expect(accounts.map((a) => a.name).sort()).toEqual(["Bancolombia", "Nequi"]);
  });
});

async function linkTestPhone(db: Db, userId: string) {
  const code = await createLinkCode(db, userId);
  await linkPhone(db, PHONE, code);
}
