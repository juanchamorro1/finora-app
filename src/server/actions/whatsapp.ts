"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { DomainError } from "../errors";
import { createLinkCode, unlinkWhatsApp } from "../services/whatsapp";
import { runAction } from "./run-action";

/** Genera el código para vincular WhatsApp. Exige aceptar el uso de WhatsApp y Claude. */
export async function createWhatsAppCodeAction(consent: boolean) {
  return runAction(z.boolean(), consent, async (accepted, userId) => {
    if (!accepted) throw new DomainError("Debes aceptar para activar el asistente", "consent");
    const code = await createLinkCode(db, userId);
    revalidatePath("/ajustes");
    return { code };
  });
}

export async function unlinkWhatsAppAction() {
  return runAction(z.undefined(), undefined, async (_input, userId) => {
    await unlinkWhatsApp(db, userId);
    revalidatePath("/ajustes");
    return { unlinked: true };
  });
}
