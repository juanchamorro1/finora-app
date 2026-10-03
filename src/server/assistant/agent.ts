import Anthropic from "@anthropic-ai/sdk";
import { formatDate, toDateKey } from "@/lib/dates";
import type { Db } from "../db-client";
import { DomainError } from "../errors";
import { readEnv } from "../env";
import { assistantToolDefinitions, runAssistantTool } from "./tools";

/**
 * Asistente de Finora (WhatsApp): Claude con las herramientas de `tools.ts`.
 *
 * Historia entre mensajes: solo el TEXTO de los turnos anteriores (sin bloques
 * de razonamiento). Dentro de un mismo mensaje, la conversación con el modelo
 * es de solo-agregar: cada respuesta se devuelve completa, sin editar nada
 * (requisito de "preserved thinking" en Claude Opus 5.5).
 */

export const DEFAULT_ASSISTANT_MODEL = "claude-opus-5-5";
/** Vueltas máximas de herramientas por mensaje (evita bucles). */
const MAX_TURNS = 8;

/** Lo único que el asistente necesita del cliente de Anthropic (permite probar con uno falso). */
export interface AssistantClient {
  beta: { messages: { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> } };
}

export function assistantModel(): string {
  return readEnv("FINORA_ASSISTANT_MODEL") ?? DEFAULT_ASSISTANT_MODEL;
}

export function isAssistantConfigured(): boolean {
  return Boolean(readEnv("ANTHROPIC_API_KEY"));
}

function systemPrompt(userName: string, now: Date): string {
  return [
    `Eres el asistente de Finora, la app de finanzas personales de ${userName}, y hablas con él o ella por WhatsApp.`,
    "Responde en español de Colombia, corto y claro (es un chat de WhatsApp): una o pocas líneas, sin tablas ni encabezados. Puedes usar *negritas* de WhatsApp para los montos.",
    "Los montos son en pesos colombianos (COP) salvo que la cuenta tenga otra moneda: '8 mil' = 8000, '1,2 millones' o '1.200.000' = 1200000, 'una luca' = 1000.",
    "Para registrar, usa los nombres exactos de get_accounts y get_categories. Si el usuario no dice la cuenta y tiene varias, pregúntale cuál antes de registrar. Elige tú la categoría más lógica (papitas → Comida, bus → Transporte).",
    "Si el monto parece raro para lo descrito (por ejemplo 8.000.000 en un almuerzo) o pasa de 2.000.000, confirma antes de registrar.",
    "Después de registrar, confirma en una línea: qué, cuánto, en qué cuenta y el nuevo saldo. Si el usuario dice que te equivocaste, usa undo_last_movement.",
    "Nunca inventes datos: si no lo sabes, consúltalo con las herramientas. Solo hablas de las finanzas del usuario en Finora; no das asesoría de inversión.",
    "Nunca pidas ni aceptes contraseñas, números de tarjeta o claves bancarias.",
    `Hoy es ${formatDate(now)} (${toDateKey(now)}), hora de Colombia.`,
  ].join("\n");
}

/** Opciones que solo aceptan los modelos actuales (Haiku 4.5 rechaza `effort` y `fallbacks`). */
function modelOptions(model: string): Partial<Anthropic.Beta.MessageCreateParamsNonStreaming> {
  if (model.startsWith("claude-haiku")) return {};
  return {
    // Chat corto: poco esfuerzo basta y responde más rápido.
    output_config: { effort: "low" },
    // Si un clasificador de seguridad rechaza, el servidor reintenta con otro modelo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

/** Responde un mensaje del usuario usando sus datos de Finora. Devuelve el texto a enviar. */
export async function runAssistant(opts: {
  db: Db;
  userId: string;
  userName: string;
  history: AssistantTurn[];
  message: string;
  now?: Date;
  client?: AssistantClient;
  model?: string;
}): Promise<string> {
  const now = opts.now ?? new Date();
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? assistantModel();
  const tools = assistantToolDefinitions() as Anthropic.Beta.BetaTool[];
  const system = systemPrompt(opts.userName, now);

  // La conversación debe empezar con el usuario; los turnos seguidos del mismo rol se unen solos.
  const firstUser = opts.history.findIndex((t) => t.role === "user");
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...(firstUser >= 0 ? opts.history.slice(firstUser) : []).map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: opts.message },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      ...modelOptions(model),
      system,
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return "No puedo ayudarte con eso. Pregúntame por tus gastos, ingresos, cuentas o metas en Finora.";
    }
    // Se devuelve la respuesta completa (incluido el razonamiento) sin modificarla.
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "Listo.";
    }

    // Todas las respuestas de herramientas van juntas en un solo mensaje.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      try {
        const output = await runAssistantTool(opts.db, opts.userId, use.name, use.input, now);
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output) });
      } catch (error) {
        // Errores esperables (cuenta inexistente, monto inválido…) vuelven al modelo para que lo explique o pregunte.
        const message =
          error instanceof DomainError || error instanceof Error ? error.message : "Error al ejecutar la herramienta";
        if (!(error instanceof DomainError)) console.error("[finora] herramienta del asistente falló:", use.name, error);
        results.push({ type: "tool_result", tool_use_id: use.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return "Me enredé con esa solicitud. ¿Me la repites de otra forma?";
}
