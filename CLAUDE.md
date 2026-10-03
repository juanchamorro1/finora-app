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
- Multiusuario con datos privados: TODA consulta y servicio recibe `userId` y filtra por él; los registros por id se buscan con `findFirst({ where: { id, userId } })` (nunca `findUnique({ id })`). `isolation.test.ts` lo verifica: agrega casos al crear servicios nuevos.
- Auth (`src/server/auth`): cookie firmada con el userId; proxy + `requirePageUser()` en páginas + `runAction` (entrega `userId` a cada acción). Usuarios: `npm run users`.
- Privacidad: los usuarios deben aceptar la política (`PRIVACY_VERSION`); `requirePageUser()`/`runAction` lo exigen. Al agregar tablas con datos de usuario, inclúyelas en `exportUserData` y `deleteUserAccount` (`services/users.ts`). Respaldos siempre cifrados.
- Verificar con `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.
