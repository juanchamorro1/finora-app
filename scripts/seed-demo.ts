/**
 * Datos de DEMOSTRACIÓN (ficticios) para desarrollar y probar la interfaz.
 * Nunca se ejecuta sobre la base real: exige una base distinta de data/finora.db.
 *
 *   npm run demo:seed     → reinicia data/demo.db con datos de ejemplo
 *   npm run dev:demo      → abre la app con esa base en http://localhost:3001
 */
import { createDb } from "../src/server/db-client";
import { PRIVACY_VERSION } from "../src/lib/privacy";
import { addDays, localMidnight, localParts } from "../src/lib/dates";
import { createAccount } from "../src/server/services/accounts";
import { setBudget } from "../src/server/services/budgets";
import { createGoal, addContribution } from "../src/server/services/goals";
import { ensureDefaultCategories } from "../src/server/services/categories";
import { setExchangeRate } from "../src/server/services/exchange-rates";
import { markOnboardingCompleted } from "../src/server/services/settings";
import { createTransaction } from "../src/server/services/transactions";

const url = process.env.DATABASE_URL ?? "";
if (!url || /finora\.db$/.test(url) || process.env.FINORA_DB_NAME === undefined) {
  console.error("Seed de demo bloqueado: ejecútalo con `npm run demo:seed` (usa data/demo.db, nunca tu base real).");
  process.exit(1);
}

// Pseudoaleatorio determinista para resultados reproducibles.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
const between = (min: number, max: number, step = 100) => BigInt(Math.round((min + rand() * (max - min)) / step) * step);

async function main() {
  const db = createDb(url);
  const existing = await db.user.count();
  if (existing > 0) {
    console.error("La base de demo ya tiene datos. Bórrala (data/<nombre>.db) y vuelve a ejecutar.");
    process.exit(1);
  }

  const now = new Date();
  const { year, month } = localParts(now);
  const start = localMidnight(year, month - 5, 1);
  const noon = (d: Date) => new Date(d.getTime() + 12 * 3_600_000);

  // Usuario de demostración (sin contraseña utilizable; en local no se pide inicio de sesión).
  const uid = (await db.user.create({
    data: { username: "demo", name: "Demo", passwordHash: "DEMO", privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: new Date() },
  })).id;
  await ensureDefaultCategories(db, uid);
  const cat = Object.fromEntries((await db.category.findMany({ where: { userId: uid } })).map((c) => [`${c.kind}:${c.name}`, c.id]));
  const bank = (await createAccount(db, uid, { name: "Bancolombia", type: "BANK", currency: "COP", openingBalance: 850_000n, openingDate: start })).id;
  const nequi = (await createAccount(db, uid, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 60_000n, openingDate: start })).id;
  const cash = (await createAccount(db, uid, { name: "Efectivo", type: "CASH", currency: "COP", openingBalance: 40_000n, openingDate: start })).id;
  await createAccount(db, uid, { name: "Binance", type: "CRYPTO", currency: "USDT", openingBalance: 12_000n, openingDate: start });
  await setExchangeRate(db, uid, "USDT", 3_950_000_000n);

  const expense = (amount: bigint, category: string, date: Date, accountId: string, description?: string) =>
    createTransaction(db, uid, { type: "EXPENSE", amount, accountId, categoryId: cat[`EXPENSE:${category}`], date: noon(date), description });
  const income = (amount: bigint, category: string, date: Date, accountId: string, description?: string) =>
    createTransaction(db, uid, { type: "INCOME", amount, accountId, categoryId: cat[`INCOME:${category}`], date: noon(date), description });

  for (let day = start; day <= now; day = addDays(day, 1)) {
    const { day: dom, weekday } = localParts(day);
    if (dom === 1) await income(800_000n, "Dinero familiar", day, bank, "Mesada mensual");
    if (dom === 15) await income(between(250_000, 450_000, 10_000), "Freelance", day, nequi, "Proyecto freelance");
    if (dom === 2) await createTransaction(db, uid, { type: "TRANSFER", amount: 150_000n, accountId: bank, toAccountId: nequi, date: noon(day) });
    if (dom === 1 || dom === 16) await createTransaction(db, uid, { type: "TRANSFER", amount: 200_000n, accountId: nequi, toAccountId: cash, date: noon(day), description: "Retiro cajero" });
    if (dom === 3) await expense(32_900n, "Suscripciones", day, bank, "Spotify + iCloud");
    if (dom === 5) await expense(between(60_000, 110_000, 1_000), "Educación", day, bank, "Curso en línea");
    if (weekday >= 1 && weekday <= 5) {
      if (rand() < 0.75) await expense(between(2_000, 6_500), "Gastos hormiga", day, pick([nequi, cash]), pick(["Tinto", "Empanada", "Galletas", "Gaseosa", "Chicles"]));
      if (rand() < 0.6) await expense(between(9_000, 18_000, 500), "Comida", day, pick([nequi, cash]), pick(["Almuerzo", "Corrientazo", "Arepa"]));
      if (rand() < 0.5) await expense(2_950n * BigInt(1 + Math.floor(rand() * 2)), "Transporte", day, nequi, "TransMilenio");
    } else if (rand() < 0.55) {
      await expense(between(25_000, 70_000, 1_000), pick(["Entretenimiento", "Comida"]), day, bank, pick(["Cine", "Salida con amigos", "Pizza", "Concierto"]));
    }
    if (rand() < 0.04) await expense(between(80_000, 220_000, 1_000), pick(["Ropa", "Tecnología", "Compras"]), day, bank);
    if (dom === 20 && rand() < 0.5) await expense(between(40_000, 90_000, 1_000), "Salud", day, bank, "Droguería");
  }

  await setBudget(db, uid, cat["EXPENSE:Comida"], 300_000n);
  await setBudget(db, uid, cat["EXPENSE:Entretenimiento"], 100_000n);
  await setBudget(db, uid, cat["EXPENSE:Transporte"], 80_000n);
  await setBudget(db, uid, cat["EXPENSE:Gastos hormiga"], 60_000n);

  const pc = await createGoal(db, uid, { name: "PC nueva", targetAmount: 2_000_000n, targetDate: localMidnight(year + 1, 12, 31), accountId: bank, initialSaved: 350_000n }, start);
  for (let i = 1; i <= 5; i++) await addContribution(db, uid, pc.id, between(60_000, 120_000, 10_000), { date: noon(localMidnight(year, month - 5 + i, 10)) });
  await createGoal(db, uid, { name: "Fondo de emergencia", targetAmount: 1_500_000n, initialSaved: 420_000n, accountId: nequi }, start);
  

  await markOnboardingCompleted(db, uid);
  console.log(`Datos de demo creados (${await db.transaction.count()} movimientos).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
