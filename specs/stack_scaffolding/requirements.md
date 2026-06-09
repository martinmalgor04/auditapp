# Requirements — stack_scaffolding

> Scaffolding local SvelteKit 5 + tooling. Milestone 8a de SPEC-07h.
> Fuera de alcance: Dockerfile de la **app**, Dokploy, PWA completa (feature `deploy_dokploy` #10).
> Incluido: Postgres 16 local en Docker solo para desarrollo.

## R1 — Scripts y pnpm

El sistema DEBE usar **pnpm** como package manager e incluir un `package.json` con los scripts `dev`, `build`, `check` y `test`, el campo `packageManager` (corepack) y un `pnpm-lock.yaml` versionado.

**Verificación:** inspección de `package.json` y `pnpm-lock.yaml`; `./init.sh` y `pnpm test` ejecutan el script `test`.

## R2 — SvelteKit 5 con adapter-node

El sistema DEBE usar SvelteKit 5 con el adaptador `@sveltejs/adapter-node` configurado en `svelte.config.js`.

**Verificación:** `pnpm run build` produce artefactos en `build/`; dependencias incluyen `@sveltejs/kit` v2 y Svelte 5.

## R3 — TypeScript strict

El sistema DEBE compilar con TypeScript en modo `strict: true`.

**Verificación:** `pnpm run check` y `pnpm exec tsc --noEmit` terminan sin errores.

## R4 — Tailwind CSS

El sistema DEBE integrar Tailwind CSS con PostCSS para estilos mobile-first.

**Verificación:** `tailwind.config.js` (o `.ts`) y `postcss.config.js` existen; clases Tailwind se aplican en la página raíz.

## R5 — Dependencia Zod

El sistema DEBE incluir `zod` como dependencia de producción para validación server-side futura.

**Verificación:** `package.json` lista `zod`; al menos un módulo en `src/lib/` importa y usa Zod (p. ej. schema de env).

## R6 — vitest con smoke test

CUANDO se ejecuta `pnpm test`, el sistema DEBE correr vitest y al menos un test smoke en `tests/` debe pasar.

**Verificación:** `tests/smoke.test.ts` (o equivalente) con aserción concreta; `pnpm test` exit code 0.

## R7 — Playwright con smoke test

CUANDO se ejecuta `pnpm exec playwright test`, el sistema DEBE correr al menos un test smoke en `e2e/` que cargue la página raíz.

**Verificación:** `e2e/smoke.spec.ts` (o equivalente) pasa contra el servidor de preview o dev configurado en `playwright.config.ts`.

## R8 — Dependencia postgres.js

El sistema DEBE incluir la dependencia `postgres` (postgres.js) como dependencia de producción.

**Verificación:** `package.json` lista `postgres`; no hay ORM (Drizzle, Prisma, Kysely) en dependencias.

## R9 — Módulo db stub

El sistema DEBE exponer en `src/lib/server/db/` un módulo stub que exporte un cliente postgres.js obtenido desde `DATABASE_URL`.

**Verificación:** `tests/db-stub.test.ts` importa el módulo, valida exports y comportamiento del stub sin requerir Postgres real (mock o modo lazy).

## R10 — .env.example sin secretos

El sistema DEBE incluir `.env.example` documentando todas las variables de entorno previstas, con placeholders no secretos y sin valores reales de producción.

**Verificación:** archivo existe; contiene `DATABASE_URL`, `SESSION_SECRET`, vars R2 y `PUBLIC_APP_URL`; `.env` está en `.gitignore`.

## R11 — Build de producción

CUANDO se ejecuta `pnpm run build`, el sistema DEBE completar el build de producción sin errores.

**Verificación:** `pnpm run build` exit code 0.

## R12 — Check (svelte-check)

CUANDO se ejecuta `pnpm run check`, el sistema DEBE ejecutar `svelte-check` sin errores de tipo ni de Svelte.

**Verificación:** `pnpm run check` exit code 0.

## R13 — Estructura de directorios

El sistema DEBE crear la estructura de directorios post-scaffolding definida en `docs/architecture.md` § «Estructura de directorios».

**Verificación:** existen (vacías o con `.gitkeep`) las carpetas `src/lib/server/db/`, `src/lib/server/auth/`, `src/lib/server/scoring/`, `src/lib/server/storage/`, `src/lib/components/`, `src/routes/(app)/`, `src/routes/briefing/[token]/`, `src/routes/api/`, `migrations/`, `tests/` y `e2e/`.

## R14 — Postgres local en Docker (desarrollo)

El sistema DEBE incluir un `docker/postgres/Dockerfile` mínimo y un `docker-compose.yml` que levanten PostgreSQL 16 para desarrollo local, con credenciales alineadas a `.env.example` y volumen persistente.

**Verificación:** `docker compose up -d db` deja Postgres escuchando en `localhost:5432`; `docker compose exec db pg_isready -U auditapp` exit code 0; `DATABASE_URL` de `.env.example` conecta sin cambios.

## R15 — Scripts db para desarrollo

El sistema DEBE incluir scripts `db:up` y `db:down` en `package.json` que envuelvan `docker compose up -d db` y `docker compose down` respectivamente.

**Verificación:** `pnpm run db:up` levanta el servicio; `pnpm run db:down` lo detiene; documentados en README o comentario en `docker-compose.yml`.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json) | Requirements |
|---|---|
| package.json con scripts dev, build, check, test | R1 |
| SvelteKit 5 + TypeScript + Tailwind configurados | R2, R3, R4 |
| vitest y playwright con ≥1 smoke test | R6, R7 |
| postgres.js + módulo db stub | R8, R9 |
| .env.example sin secretos | R10 |
| Dockerfile + compose Postgres dev | R14, R15 |
| pnpm run build y pnpm test pasan | R11, R6 |
