@AGENTS.md

# Finora — notas del proyecto

- Idioma de la UI y del código de dominio: español (Colombia). Moneda principal COP.
- Montos: siempre `bigint` en unidades mínimas; usar `src/lib/money.ts` (nunca `number` para dinero salvo al pasar datos a Recharts).
- Fechas: usar `src/lib/dates.ts` (America/Bogota). Nunca calcular meses con `new Date().getMonth()`.
- Lógica de negocio en `src/server/services/*` (recibe `db`, testeable). Las páginas y acciones solo orquestan.
- Mutaciones: Server Action en `src/server/actions/*` envuelta en `runAction` (Zod + DomainError → ActionResult) y `revalidatePath("/", "layout")`.
- Saldo derivado del libro (`services/ledger.ts`); nunca agregar un campo de saldo editable.
- Si se regenera una tabla en una migración de SQLite, revisar que las CHECK constraints sigan presentes (`integrity.test.ts` lo verifica).
- Base: adaptador libSQL (`file:` local o Turso `libsql://` en producción). Local: `data/finora.db`; nube: ver README. Para probar usar `npm run dev:demo` (data/demo.db) — nunca sembrar datos en la base real.
- Auth de un solo usuario (`src/server/auth`): proxy + `requirePageSession` en layouts + `requireActionSession` en `runAction`. Toda página nueva bajo `(app)` queda protegida; páginas fuera de `(app)` deben llamar `requirePageSession()`.
- Verificar con `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.
