# AUDIT.md — Auditoría técnica de auditapp

**Fecha:** 2026-06-14
**Rama:** `chore/audit-2026-06-14` (desde `master` @ `1a9032e`)
**Alcance:** todo el repositorio.

## Comandos del proyecto

| Acción | Comando | Notas |
|---|---|---|
| **Tests** | `pnpm test` (vitest run) | Requiere Postgres: `pnpm db:up` antes. Sin DB el global-setup falla con `ECONNREFUSED` y vitest aborta ("No test files found"). |
| **Typecheck / "linter"** | `pnpm check` (`svelte-kit sync && svelte-check`) | No hay ESLint/Prettier configurado. `svelte-check` es la única verificación estática. |
| **Build** | `pnpm build` (vite) | No corre `tsc`; los errores de tipo de `pnpm check` NO bloquean el build. |
| **Gate arnés SDD** | `./init.sh` | |
| **E2E** | `pnpm exec playwright test` | |

## Estado del baseline (antes de la auditoría)

- **Tests:** `134 passed | 2 failed (136 archivos)` · `608 passed | 2 failed | 2 skipped`.
  Las 2 fallas estaban causadas por el WIP `reunion` sin commitear (ver B1, B2). No eran fallas del código en `master`.
- **`pnpm check`:** `7 ERRORS | 26 WARNINGS`. Ninguno bloquea build ni tests.
- **Calidad del código committeado:** muy alta. Cero `any`/`as any`/`@ts-ignore`, cero `TODO/FIXME`, sin `console.*` fuera del `logger`. Módulos con decisiones de diseño documentadas (p.ej. `merge-table.ts`).

## Estado tras la auditoría

- **Tests:** `136 passed | 610 passed | 2 skipped`. **Suite verde.**
- **`pnpm check`:** `6 ERRORS | 26 WARNINGS` (−1 error, −1 warning real resuelto; el resto son WIP o idiom de Svelte 5).

---

## Hallazgos priorizados

Formato: `[SEVERIDAD][TIPO] ruta:línea — qué pasa — por qué importa — fix — riesgo del fix`.
Estado: ✅ aplicado (bajo riesgo) · ⏸️ pendiente (cuestionario).

### Bugs

- **B1 ✅ [medio][bug/incongruencia]** `tests/informe-pipeline.test.ts:121` — El test "R8" esperaba `params.output_config.format.type === 'json_schema'`, pero el adapter (`src/lib/server/informe/claude.ts`) **dejó de enviar salida estructurada** en los commits `eb02144` y `63c8d40` (ahora pide JSON por prompt y lo extrae del texto). El test quedó stale y dejaba la suite en rojo. — Importa: rojo permanente y contrato documentado (spec R8) que ya no coincide con la implementación. — Fix: actualicé el test para verificar el contrato vigente (`model`/`system`/`messages`, sin `output_config`). — **Riesgo: bajo** (solo test). *Nota: el spec `specs/14_informe_ia/requirements.md` R8 sigue describiendo la salida estructurada → ver cuestionario Q1.*

- **B2 ✅ [bajo][bug/deuda]** `tests/migrate.test.ts:21` — El test hardcodeaba la lista exacta de migraciones y se rompía con `012_reunion_asistente` (y con cualquier migración futura). — Importa: cada migración nueva rompe el test (frágil por diseño). — Fix: ahora verifica que las 11 migraciones core estén aplicadas como prefijo en orden + que la lista esté ordenada ascendente. Robusto a migraciones nuevas. — **Riesgo: bajo** (solo test).

- **B3 ✅ [bajo][bug]** `src/routes/(app)/auditorias/[id]/cierre/+page.svelte:50` — Un `<form>` (bloque) anidado dentro de un `<p>`. El navegador auto-cierra el `<p>` al encontrar contenido de bloque → **mismatch de hidratación SSR** (`node_invalid_placement_ssr`, confirmado por `svelte-check`). — Importa: HTML inválido; el DOM renderizado difiere del SSR, puede romper la interactividad del botón "Reabrir (admin)". — Fix: cambié el `<p>` contenedor por `<div>`. — **Riesgo: bajo** (swap semántico, mismas clases). Sin test unitario posible para hidratación; `svelte-check` es la señal (warning 1→0).

### Seguridad

- **S1 ⏸️ [alto][seguridad]** `src/routes/api/internal/reunion/callback/+server.ts:15` (WIP) — La verificación de firma HMAC **solo ocurre si `REUNION_CALLBACK_SECRET` está configurado** (`if (secret) {...}`). Sin la variable, el endpoint acepta cualquier POST y deja inyectar transcript + propuestas en cualquier `reunion_session_id`. — Importa: endpoint público escribe en datos de auditoría sin autenticar. — Fix propuesto: si no hay secret, **fallar cerrado** (rechazar el callback con 503/401) en lugar de abierto. — **Riesgo del fix: bajo**, pero es código WIP/seguridad → no lo toco autónomamente.

- **S2 ⏸️ [medio][seguridad/deuda]** `src/lib/server/auth/rate-limit.ts:9` — `loginAttempts: Map<string, WindowState>` **nunca se purga**: crece sin límite con cada IP distinta (memory leak de larga duración / vector DoS de memoria). Además el contador es por instancia (no sirve con múltiples réplicas). — Importa: en producción de larga vida el Map crece indefinidamente. — Fix propuesto: purgar entradas con `windowStart` vencido al acceder, o usar un store con TTL. — **Riesgo del fix: bajo**, pero toca auth → cuestionario.

- **S3 ⏸️ [bajo][seguridad/incongruencia]** `src/lib/server/auth/rate-limit.ts:16,30` — El comentario dice "bloquea ≥5 en 60s" pero la condición es `count > MAX_ATTEMPTS` (=5), o sea bloquea recién en el **6º** intento. — Importa: doc vs comportamiento divergen (off-by-one). — Fix: ajustar comentario o condición a `>=`. — **Riesgo: bajo** (toca auth → cuestionario).

- **S4 ⏸️ [medio][seguridad/deploy]** `src/routes/login/+page.server.ts:21` — El rate-limit se llavea con `getClientAddress()`. Con `adapter-node` detrás de proxy, esto depende de `ADDRESS_HEADER`/`XFF_DEPTH`: si no están bien seteados, o todas las IP colapsan al proxy (over-block) o el cliente puede spoofear `X-Forwarded-For` (bypass). — Importa: el rate-limit puede ser inefectivo o contraproducente según deploy. — Fix propuesto: documentar/forzar `ADDRESS_HEADER`+`XFF_DEPTH` en el deploy. — **Riesgo: medio** (config de deploy) → cuestionario.

### Incongruencias / tipos laxos

- **I1 ✅ [bajo][incongruencia]** `tests/api/attachments-delete.test.ts:28` — Import con extensión `.ts` explícita (único en el repo; rompe `svelte-check` con `allowImportingTsExtensions`). — Fix: quité la extensión `.ts`. — **Riesgo: bajo** (solo test; vitest resuelve igual). Error de `check` 7→6.

- **I2 ⏸️ [bajo][incongruencia/tipos]** `src/lib/server/db/audit-responses.ts:111` — `sql.json({ rows })` falla el tipo `JSONValue` de postgres.js (`TableRowValue[]` no tiene index signature de string). — Importa: ruido de `svelte-check` en código de producción del path de guardado de tablas; runtime OK (los tests pasan). — Fix propuesto: tipar el valor como `JSONValue` o `as never`/cast acotado. — **Riesgo: bajo** (solo tipo), pero es DB de producción → preferí flaguearlo (Q2).

- **I3 ⏸️ [bajo][tipos]** `tests/setup.ts:41` — `testFilePath(ctx)` no acepta el tipo real `Readonly<Suite|File>` que vitest pasa a `beforeAll`. — Importa: error de `check` en infra de tests cargada por toda la suite; runtime OK (cae al fallback `expect.getState().testPath`). — Fix propuesto: tipar el parámetro como `unknown` + narrowing interno (runtime idéntico). — **Riesgo: bajo**, pero es infra crítica de tests → flagueado (Q2).

- **I4 ⏸️ [bajo][tipos]** `src/lib/server/db/reunion-proposals.ts:45,117`, `reunion-transcripts.ts:36`, `reunion/review.ts:50` (WIP) — 4 errores `object` no asignable a `JSONValue` en `sql.json(...)`. — Mismo patrón que I2. — Fix: tipar payloads como `JSONValue`. — **Riesgo: bajo**, pero WIP → no lo toco.

### Deuda técnica / observaciones

- **D1 ⏸️ [medio][deuda/proceso]** Subsistema `reunion` (≈30 archivos: `src/lib/server/reunion/**`, `src/lib/server/db/reunion-*.ts`, `src/lib/client/reunion/**`, `src/routes/api/audits/[auditId]/reunion/**`, `src/routes/api/internal/**`, `migrations/012_*.sql`) está **sin commitear y sin un solo test**. — Importa: feature grande sin red de seguridad; rompía el baseline (B1/B2). Calidad razonable (HMAC constante en `webhook.ts`, Zod en `processWebhookCallback`, guards de acceso admin/técnico), pero sin cobertura. — Acción: definir si entra al alcance de esta auditoría o se trabaja como feature aparte con specs+tests (Q3).

- **D2 ⏸️ [bajo][deuda/perf]** `src/lib/server/auth/session.ts:38,57` — `resolveSession` y `renewSessionIfNeeded` hacen cada una su `findSessionById`, => **2 SELECT de session por request autenticado** (`hooks.server.ts:23-25`). — Importa: query redundante en el hot path. — Fix propuesto: que `renewSessionIfNeeded` reciba la fila ya leída por `resolveSession`. — **Riesgo: medio** (refactor de auth, sin test que lo cubra) → cuestionario.

- **D3 ⏸️ [bajo][deuda]** `src/lib/server/informe/claude.ts:26-33` — `extractJson` toma desde el primer `{` hasta el último `}`. Si el modelo agrega prosa con llaves después del JSON, sobre-captura. — Importa: parsing frágil ante salidas atípicas del LLM. — Fix propuesto: parser con balance de llaves. — **Riesgo: bajo**, pero toca el pipeline IA (comportamiento) → cuestionario.

- **D4 ⏸️ [bajo][deuda]** `pnpm check` arroja 26 warnings, la mayoría `state_referenced_locally` en `+page.svelte` (idiom de Svelte 5: leer `data`/`draft` fuera de un `$derived`). No son bugs pero ocultan señal real. — Fix propuesto: barrido para envolver en `$derived` donde corresponda. — **Riesgo: bajo** (volumen alto, sin tests de UI) → cuestionario.

- **D5 ⏸️ [bajo][deuda]** `pnpm test` depende de Postgres pero `package.json`/README no lo encadenan (hay que correr `pnpm db:up` a mano; si no, vitest aborta con un error críptico). — Fix propuesto: script `pretest` o nota en README. — **Riesgo: bajo** → cuestionario.

---

## Cambios aplicados en esta rama (bajo riesgo, suite verde)

1. `test(informe)` — B1: alinear test R8 con el contrato vigente del adapter.
2. `test(migrate)` — B2: test de migraciones resiliente a migraciones nuevas.
3. `test(attachments)` — I1: import sin extensión `.ts`.
4. `fix(cierre)` — B3: `<div>` en vez de `<p>` envolviendo el `<form>` de reapertura (mismatch SSR).

Todo lo demás (S1–S4, I2–I4, D1–D5) quedó **pendiente** y se resume en el cuestionario de cierre.
