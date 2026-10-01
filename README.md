# Finora

Aplicación de finanzas personales local: cuentas, ingresos, gastos, transferencias, presupuestos, metas de ahorro, estadísticas y detección de gastos hormiga. Moneda principal: COP.

## Uso diario

```bash
npm run dev
```

Abre <http://localhost:3000>. La primera vez aparece la configuración inicial (cuenta, saldo inicial, categorías y una meta opcional).

Tus datos se guardan **solo** en `data/finora.db`. Para hacer una copia de seguridad, cierra la app y copia ese archivo.

## Primera instalación (Windows)

Requiere Node.js 20.9 o superior.

```bash
npm install
npm run db:deploy
npm run dev
```

## Datos de demostración

Para probar la interfaz sin tocar tus datos reales:

```bash
npm run demo:seed   # crea data/demo.db con ~6 meses de datos ficticios (solo si está vacía)
npm run dev:demo    # abre la app con esa base en http://localhost:3001
```

El seed se niega a ejecutarse sobre `data/finora.db`. Para regenerar la demo, borra `data/demo.db` y vuelve a ejecutar `demo:seed`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | App con tu base real |
| `npm run build` / `npm start` | Versión de producción (más rápida) |
| `npm run typecheck` | TypeScript estricto |
| `npm run lint` | ESLint |
| `npm test` | Tests (Vitest) de la lógica financiera |
| `npm run db:migrate` | Crear una migración nueva (desarrollo) |
| `npm run db:deploy` | Aplicar migraciones pendientes |
| `npm run db:studio` | Explorar la base con Prisma Studio |

## Arquitectura

```
prisma/              schema.prisma + migraciones (con CHECK constraints de integridad)
scripts/             with-db.mjs (bases separadas), seed-demo.ts
src/
  app/
    (app)/           páginas: inicio, movimientos, cuentas, presupuestos, metas,
                     estadisticas, gastos-hormiga, ajustes
    bienvenida/      configuración inicial
  components/        ui/ (shadcn) + componentes por dominio
  lib/               dinero (BigInt), fechas (America/Bogota), periodos, validación (Zod)
  server/
    services/        lógica de negocio pura, sin UI (la usan páginas, acciones, tests y el asistente)
    actions/         Server Actions: validan con Zod y llaman a los servicios
    assistant/       herramientas de solo lectura para un futuro asistente de IA
    __tests__/       tests contra una SQLite temporal con las migraciones reales
```

### Reglas financieras

- **Dinero sin decimales flotantes:** todos los montos son `BigInt` en unidades mínimas (COP = pesos enteros; USD/USDT = centavos).
- **El saldo nunca se edita:** se calcula sumando los movimientos de la cuenta. Para corregirlo se registra un *ajuste* visible en el historial.
- **Tipos de movimiento:** `INCOME` y `EXPENSE` son los únicos que cuentan como ingreso o gasto. `TRANSFER`, `OPENING_BALANCE` (saldo inicial) y `ADJUSTMENT` mueven saldos pero no afectan las estadísticas.
- **Integridad en la base de datos:** CHECK constraints impiden montos inválidos, transferencias a la misma cuenta, gastos sin categoría, etc., aunque se salte la capa de servicios.
- **Borrado seguro:** los movimientos van a una papelera (restaurable); las cuentas y categorías con historial se desactivan o archivan en vez de borrarse.
- **Varias monedas:** cada cuenta tiene su moneda; el total en COP usa una tasa manual definida en Ajustes.
- **Metas:** el dinero aportado se *aparta*, no se descuenta de las cuentas.
- **Fechas:** los rangos (mes, año…) se calculan en hora de Colombia.

### Asistente de IA (preparado, no integrado)

`src/server/assistant/tools.ts` define herramientas tipadas de solo lectura (`get_spending_summary`, `get_top_expense_categories`, `get_weekly_allowance`, `get_goals_progress`, `get_ant_expenses`, `get_net_worth`) con su JSON Schema. Para integrarlo, basta con exponer `assistantToolDefinitions()` a un modelo y ejecutar `runAssistantTool()` cuando las pida.

## Usar Finora desde el celular y el PC (nube)

La app se publica en **Vercel** y los datos viven en **Turso** (SQLite en la nube). Ambos tienen plan gratuito.

1. **Turso:** crea una cuenta en <https://turso.tech>, crea una base (región *AWS us-east-1*) y genera un token. Crea en esta carpeta un archivo `.env.turso`:
   ```
   TURSO_DATABASE_URL=libsql://<tu-base>.turso.io
   TURSO_AUTH_TOKEN=<token>
   ```
2. **Subir el esquema y tus datos:** `npm run turso:migrate` y luego `npm run turso:import` (copia `data/finora.db`; se niega si la nube ya tiene datos).
3. **Secreto de sesión:** `npm run users -- secret` genera `FINORA_SESSION_SECRET`.
4. **Vercel:** `npx vercel login` y `npx vercel` (acepta los valores sugeridos). En el panel del proyecto → *Settings → Environment Variables* agrega:
   `DATABASE_URL` (= TURSO_DATABASE_URL), `DATABASE_AUTH_TOKEN` (= TURSO_AUTH_TOKEN) y `FINORA_SESSION_SECRET`.
   Luego publica con `npx vercel --prod`.
5. **Usuarios:** ver la sección siguiente.
6. **Celular:** abre la URL de Vercel → menú del navegador → *Agregar a pantalla de inicio*.

Desde ese momento la base de la nube es la principal: usa la URL de Vercel también en el PC. Para nuevas migraciones: `npm run db:migrate` (local), `npm run turso:backup` y después `npm run turso:migrate`.

## Usuarios

Cada persona tiene su usuario y ve **solo sus propias finanzas** (cuentas, movimientos, metas, presupuestos y ajustes). Las contraseñas se escriben ocultas y se guardan cifradas con scrypt.

| Comando | Qué hace |
|---|---|
| `npm run users -- list --nube` | Lista los usuarios |
| `npm run users -- add --nube` | Crea un usuario (pide usuario, nombre y contraseña) |
| `npm run users -- password <usuario> --nube` | Cambia la contraseña |

Sin `--nube` se usa la base local. En local (sin `FINORA_SESSION_SECRET`) la app no pide inicio de sesión y abre con el primer usuario.
