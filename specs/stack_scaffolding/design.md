# Design — stack_scaffolding

## Alcance

Scaffolding **local** del proyecto auditapp. Establece stack, tooling, estructura de carpetas, Postgres dev en Docker y tests smoke. No incluye deploy de la app ni PWA.

| Incluido | Excluido (otras features) |
|---|---|
| SvelteKit 5 + adapter-node | Dockerfile de la **app**, Dokploy (#10) |
| TypeScript strict + Tailwind + Zod | PWA manifest/SW (#7, #10) |
| vitest + playwright smoke | Schema/migraciones reales (#2) |
| postgres.js stub en `db/` | Auth, R2, scoring |
| `.env.example` | Runner de migraciones (#10) |
| Postgres 16 local (`docker/postgres` + compose) | Seed, SQL de schema (#2) |

## Archivos a crear

### Configuración raíz

| Archivo | Propósito |
|---|---|
| `package.json` | Scripts `dev`, `build`, `check`, `test`; campo `packageManager`; dependencias core |
| `pnpm-lock.yaml` | Lockfile versionado (pnpm) |
| `docker-compose.yml` | Servicio `db` Postgres 16 para desarrollo local |
| `docker/postgres/Dockerfile` | Imagen mínima basada en `postgres:16-bookworm` |
| `tsconfig.json` | `strict: true`, paths `$lib/*` |
| `svelte.config.js` | SvelteKit + adapter-node |
| `vite.config.ts` | Vite + plugin vitest (`test` block) |
| `tailwind.config.js` | Content paths `src/**/*.{html,js,svelte,ts}` |
| `postcss.config.js` | tailwindcss + autoprefixer |
| `playwright.config.ts` | Base URL, webServer con `pnpm run build && pnpm run preview` |
| `.env.example` | Vars documentadas, placeholders |
| `.gitignore` | `node_modules`, `.env`, `build`, `.svelte-kit`, `test-results`, `playwright-report` |
| `README.md` | Comandos mínimos (opcional, 10 líneas) |

### Aplicación SvelteKit

| Archivo | Propósito |
|---|---|
| `src/app.html` | Shell HTML |
| `src/app.css` | Directivas `@tailwind` |
| `src/routes/+layout.svelte` | Layout raíz, importa `app.css` |
| `src/routes/+page.svelte` | Home smoke: título «auditapp», clase Tailwind visible |
| `src/lib/env.ts` | Schema Zod de env server (stub, valida presencia de keys) |

### Capa db (stub)

| Archivo | Propósito |
|---|---|
| `src/lib/server/db/client.ts` | Factory del cliente postgres.js |
| `src/lib/server/db/index.ts` | Re-export público del módulo db |

### Estructura vacía (`.gitkeep`)

```
src/lib/server/auth/
src/lib/server/scoring/
src/lib/server/storage/
src/lib/components/
src/routes/(app)/
src/routes/briefing/[token]/
src/routes/api/
migrations/
static/
```

### Tests

| Archivo | Propósito |
|---|---|
| `tests/smoke.test.ts` | Smoke vitest (p. ej. suma, import de `$lib/env`) |
| `tests/db-stub.test.ts` | Exports y lazy-init del stub db |
| `e2e/smoke.spec.ts` | GET `/` responde 200 y contiene texto «auditapp» |

## Firmas

### `src/lib/server/db/client.ts`

```typescript
import postgres from 'postgres';

/** Crea cliente postgres.js; no conecta hasta la primera query. */
export function createSql(connectionString: string): postgres.Sql;

/** Singleton lazy; lee DATABASE_URL del entorno. */
export function getSql(): postgres.Sql;
```

### `src/lib/server/db/index.ts`

```typescript
export { createSql, getSql } from './client';

/** Ping opcional para health checks futuros; en stub puede no ejecutar query real. */
export async function pingDb(): Promise<boolean>;
```

### `src/lib/env.ts`

```typescript
import { z } from 'zod';

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
  SESSION_SECRET: z.string().min(32),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  PUBLIC_APP_URL: z.string().url()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parsea env en arranque server; lanza ZodError si falta var obligatoria. */
export function getServerEnv(): ServerEnv;
```

En scaffolding, `getServerEnv()` puede usarse solo en tests; la app raíz no requiere DB conectada.

## Scripts `package.json` (contrato)

| Script | Comando esperado |
|---|---|
| `dev` | `vite dev` |
| `build` | `vite build` |
| `preview` | `vite preview` (para Playwright) |
| `check` | `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json` |
| `test` | `vitest run` |
| `db:up` | `docker compose up -d db` |
| `db:down` | `docker compose down` |

Playwright se ejecuta con `pnpm exec playwright test` (script opcional `test:e2e` recomendado pero no obligatorio en R1).

## Docker — Postgres desarrollo local

### `docker/postgres/Dockerfile`

```dockerfile
FROM postgres:16-bookworm

# Credenciales de dev — NO usar en producción (prod: Dokploy #10)
ENV POSTGRES_USER=auditapp
ENV POSTGRES_PASSWORD=changeme
ENV POSTGRES_DB=auditapp
```

Sin scripts de init SQL en esta feature (el schema llega en `modelo_datos` #2). El Dockerfile fija usuario/DB por defecto; `docker-compose.yml` puede repetir las mismas vars para claridad.

### `docker-compose.yml`

```yaml
services:
  db:
    build: ./docker/postgres
    image: auditapp-postgres-dev
    ports:
      - "5432:5432"
    volumes:
      - auditapp_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U auditapp -d auditapp"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  auditapp_pgdata:
```

- Puerto `5432` expuesto solo en **localhost** para dev (prod en #10: sin puerto expuesto).
- `DATABASE_URL` de `.env.example` apunta a `postgres://auditapp:changeme@localhost:5432/auditapp`.
- Añadir `docker-compose.override.yml` a `.gitignore` si el equipo necesita overrides locales.

## Variables `.env.example`

```bash
# Postgres (local o Docker en dev)
DATABASE_URL=postgres://auditapp:changeme@localhost:5432/auditapp

# Auth — generar con: openssl rand -base64 32
SESSION_SECRET=replace-with-random-secret-min-32-chars

# Cloudflare R2 (feature storage_r2)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=auditapp
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com

# URL pública de la app
PUBLIC_APP_URL=http://localhost:5173
```

Sin valores reales de producción. Comentarios explican cada var.

## Errores

| Situación | Comportamiento |
|---|---|
| `DATABASE_URL` ausente al llamar `getSql()` | Lanzar `Error` con mensaje `'DATABASE_URL is not set'` (sin stack al cliente) |
| Env inválida en `getServerEnv()` | Propagar `ZodError`; en tests verificar mensaje |
| Build sin Node ≥ 20 | Falla en CI/local; documentado en README |

No se introducen clases de error de dominio en esta feature.

## Alternativa descartada: Drizzle ORM

**Descartado:** Drizzle ORM + drizzle-kit (mencionado en SPEC-07h histórico).

**Motivo:** Decisión de proyecto (PRD 07h, `docs/architecture.md`): SQL puro con postgres.js. Migraciones como archivos `.sql` en `migrations/` con runner propio (feature #2 y #10). Drizzle añade capa de abstracción y tooling de migraciones incompatible con el enfoque acordado.

**Alternativa descartada secundaria:** Prisma — descartado por peso y ORM completo.

## Alternativa descartada: adapter-auto / adapter-static

**Descartado:** `@sveltejs/adapter-auto` o `adapter-static`.

**Motivo:** Deploy planificado en Dokploy con Node (`adapter-node`, feature #10). Configurar desde el scaffolding evita reconfiguración posterior.

## Alternativa descartada: Postgres instalado en el host

**Descartado:** instalar PostgreSQL 16 directamente en macOS/Linux del desarrollador.

**Motivo:** Docker da entorno reproducible, alineado con prod (Postgres 16 en Dokploy) y evita drift de versiones entre Facu/Simón/Martín.

## Alternativa descartada: PWA en scaffolding

**Descartado:** `@vite-pwa/sveltekit` en esta feature.

**Motivo:** PWA completa (manifest SyS, SW shell) pertenece a `form_tecnico` (#7) y `deploy_dokploy` (#10). Incluirla ahora mezalaría alcance.

## Dependencias (pnpm)

Bootstrap: `pnpm create svelte@latest` (o equivalente SvelteKit 5), luego `pnpm install`.

**Producción:** `@sveltejs/kit`, `svelte`, `postgres`, `zod`

**Desarrollo:** `@sveltejs/adapter-node`, `@sveltejs/vite-plugin-svelte`, `typescript`, `svelte-check`, `vite`, `vitest`, `@playwright/test`, `tailwindcss`, `postcss`, `autoprefixer`, `@types/node`

Versiones: últimas estables compatibles con SvelteKit 2 / Svelte 5 al momento de implementar.

## Notas para implementer

- Usar `pnpm create svelte@latest` o equivalente SvelteKit 5 como base, luego adaptar estructura.
- El stub db NO debe requerir Postgres corriendo para `pnpm test`; tests usan `createSql` con string mock o verifican exports sin query.
- Playwright `webServer` levanta preview post-build para smoke e2e determinista.
- No commitear `.env`. Solo `.env.example`.
- `pnpm run db:up` antes de probar conexión real a DB (feature #2); en #1 los tests no requieren Docker corriendo.
