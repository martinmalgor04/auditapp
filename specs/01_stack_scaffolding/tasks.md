# Tasks — #1 01_stack_scaffolding

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_01_stack_scaffolding.md`.

## Bootstrap

- [x] T1 — Inicializar proyecto SvelteKit 5 con TypeScript y adapter-node (`svelte.config.js`, `vite.config.ts`, `tsconfig.json`). Cubre: **R2, R3**.
- [x] T2 — Añadir `package.json` (campo `packageManager`), scripts `dev`, `build`, `check`, `test`, `preview` y generar `pnpm-lock.yaml` con `pnpm install`. Cubre: **R1**.
- [x] T3 — Configurar Tailwind (config, PostCSS, `src/app.css`, import en layout). Cubre: **R4**.
- [x] T4 — Instalar `zod` y crear `src/lib/env.ts` con schema de variables server. Cubre: **R5**.
- [x] T5 — Crear estructura de directorios con `.gitkeep` según `docs/architecture.md`. Cubre: **R13**.
- [x] T6 — Crear `.env.example` y asegurar `.env` en `.gitignore`. Cubre: **R10**.

## Postgres local (Docker dev)

- [x] T6a — Crear `docker/postgres/Dockerfile` mínimo (`postgres:16-bookworm`, user/db `auditapp`). Cubre: **R14**.
- [x] T6b — Crear `docker-compose.yml` con servicio `db`, volumen `auditapp_pgdata` y healthcheck `pg_isready`. Cubre: **R14**.
- [x] T6c — Añadir scripts `db:up` y `db:down` en `package.json`; documentar en README (2 líneas). Cubre: **R15**.
- [x] T6d — Añadir `tests/docker-compose.test.ts` que valide existencia de Dockerfile/compose y vars alineadas a `.env.example` (sin requerir Docker en CI). Cubre: **R14**.

## Capa db stub

- [x] T7 — Instalar `postgres` y crear `src/lib/server/db/client.ts` + `index.ts` con firmas del design. Cubre: **R8, R9**.
- [x] T8 — Añadir `tests/db-stub.test.ts` (exports, error si falta `DATABASE_URL`, sin Postgres real). Cubre: **R9**.

## UI mínima

- [x] T9 — Implementar `src/routes/+page.svelte` con título «auditapp» y estilo Tailwind para smoke visual. Cubre: **R4**.

## Tests smoke

- [x] T10 — Configurar vitest en `vite.config.ts` y crear `tests/smoke.test.ts`. Cubre: **R6**.
- [x] T11 — Configurar Playwright (`playwright.config.ts`, `e2e/smoke.spec.ts` contra preview). Cubre: **R7**.

## Verificación final

- [x] T12 — Ejecutar `pnpm run check` y corregir errores de tipo/Svelte. Cubre: **R12**.
- [x] T13 — Ejecutar `pnpm run build` y verificar artefacto en `build/`. Cubre: **R11**.
- [x] T14 — Ejecutar `pnpm test` (vitest) y `pnpm exec playwright test` (e2e smoke). Cubre: **R6, R7**.
- [x] T15 — Ejecutar `./init.sh` y confirmar exit code 0. Cubre: **R1, R6, R11**.
- [x] T16 — Documentar trazabilidad R→test en `progress/impl_01_stack_scaffolding.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → inspección package.json + init.sh
- R2 → pnpm run build
- R3 → pnpm run check, tsc --noEmit
- R4 → smoke.test / e2e smoke ve Tailwind
- R5 → smoke.test importa env schema
- R6 → tests/smoke.test.ts
- R7 → e2e/smoke.spec.ts
- R8 → package.json dependencia postgres
- R9 → tests/db-stub.test.ts
- R10 → inspección .env.example
- R11 → pnpm run build
- R12 → pnpm run check
- R13 → inspección directorios
- R14 → tests/docker-compose.test.ts + manual `pnpm run db:up` + pg_isready
- R15 → package.json scripts db:up/db:down
```
