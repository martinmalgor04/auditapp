# Design — #10 10_deploy_dokploy

## Alcance

Infraestructura de deploy en Dokploy para auditapp: imagen Docker multi-stage, entrypoint con migraciones SQL, red interna Postgres, HTTPS Traefik, verificación PWA en prod, seed manual documentado y gate pre-push local.

| Incluido | Excluido |
|---|---|
| `Dockerfile` multi-stage + `.dockerignore` | GitHub Actions / CI remoto complejo |
| `docker/entrypoint.sh` (migrate → node) | Monitoreo/alertas (infra Dokploy) |
| Plantilla compose/labels Dokploy | Backups automáticos Postgres |
| `docs/deploy-dokploy.md` operativo | Seed automático en cada restart |
| `scripts/pre-push.sh` | Multi-réplica / orquestación K8s |
| Tests de contenedor y docs | Cambios al schema SQL (#2) |

## Dependencias de features

| Feature | Aporta |
|---|---|
| `01_stack_scaffolding` (#1) | `adapter-node`, `package.json` scripts, `.env.example` base, estructura `migrations/` |
| `02_modelo_datos` (#2) | `runMigrations()`, `runSeed()`, `pnpm run db:migrate`, `pnpm run db:seed`, `schema_migration` |
| `03_auth_roles` (#3) | Cookies de sesión; flag `Secure` condicionado a HTTPS |
| `07_form_tecnico` (#7) | `@vite-pwa/sveltekit`, manifest SyS, SW shell — esta feature verifica que se sirvan en prod |

## Archivos a crear o modificar

### Docker

| Archivo | Propósito |
|---|---|
| `Dockerfile` | Multi-stage: deps → build → runtime Debian slim |
| `.dockerignore` | Excluir `node_modules`, `.git`, `tests`, `e2e`, `.env`, `playwright-report` |
| `docker/entrypoint.sh` | Migrate + exec `node build/index.js` |
| `docker/migrate-cli.mjs` | Wrapper ESM que importa/ejecuta `runMigrations` sin levantar servidor |

### Deploy Dokploy

| Archivo | Propósito |
|---|---|
| `deploy/dokploy.compose.example.yml` | Referencia: app + postgres, red interna, labels Traefik, sin puertos DB |
| `docs/deploy-dokploy.md` | Runbook: primer deploy, dominio, env vars, seed, pre-push, troubleshooting |

### Scripts y CI local

| Archivo | Propósito |
|---|---|
| `scripts/pre-push.sh` | Gate: `pnpm test` → `pnpm run build` → `docker build` |
| `package.json` | Añadir script `prepush` → `./scripts/pre-push.sh` (opcional alias) |

### App (mínimo)

| Archivo | Propósito |
|---|---|
| `src/routes/health/+server.ts` | `GET` → `{ success: true, data: { status: 'ok' } }` para HEALTHCHECK |
| `.env.example` | Actualizar `PUBLIC_APP_URL` prod y comentarios Dokploy |

### Tests

| Archivo | Propósito |
|---|---|
| `tests/docker.test.ts` | R1, R2, R18, R19, R20 |
| `tests/entrypoint.test.ts` | R3, R4, R5, R15 |
| `tests/deploy-compose.test.ts` | R6 |
| `tests/deploy-env.test.ts` | R7, R10 |
| `tests/deploy-docs.test.ts` | R8, R13, R17 |
| `tests/deploy-seed.test.ts` | R14 |
| `tests/pwa-prod.test.ts` | R11, R12 |
| `tests/pre-push.test.ts` | R16 |
| `e2e/pwa-install.spec.ts` | R11 (smoke manifest) |

## Dockerfile multi-stage

```dockerfile
# syntax=docker/dockerfile:1

# ── Stage 1: deps ─────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY . .
ENV NODE_ENV=production
RUN pnpm run build

# ── Stage 3: runtime ──────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Solo prod deps + build output + migraciones + entrypoint
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/build ./build
COPY migrations ./migrations
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/migrate-cli.mjs ./docker/migrate-cli.mjs
# Código TS compilado o fuente necesaria para migrate (ver nota abajo)
COPY src/lib/server/db ./src/lib/server/db

RUN chmod +x /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
```

**Nota migrate en runtime:** `migrate.ts` vive en TypeScript. Opciones (elegir una en implementación):

1. **Recomendada:** compilar `src/lib/server/db/migrate.ts` a `build/migrate.cjs` en stage build e invocar desde entrypoint.
2. Alternativa: incluir `tsx` como dependencia de producción solo para migrate (más peso).

El design asume opción 1: script build adicional `pnpm run build:migrate` o paso en Dockerfile post-`pnpm run build`.

## Entrypoint

```bash
#!/usr/bin/env sh
set -eu

echo "[entrypoint] applying SQL migrations..."
node docker/migrate-cli.mjs

echo "[entrypoint] starting SvelteKit (adapter-node)..."
exec node build/index.js
```

`docker/migrate-cli.mjs`:

```javascript
import { createSql } from '../build/migrate-deps.js'; // o path acordado en implementación
import { runMigrations } from '../build/migrate.js';

const sql = createSql(process.env.DATABASE_URL);
const result = await runMigrations(sql);
console.log('[migrate] applied:', result.applied.join(', ') || '(none)');
console.log('[migrate] skipped:', result.skipped.join(', ') || '(none)');
await sql.end();
```

**Contrato:** si `runMigrations` lanza, el shell termina con exit ≠ 0 (`set -e`). No invocar `runSeed`.

## Plantilla Dokploy / Compose

```yaml
# deploy/dokploy.compose.example.yml — referencia, no secretos reales
services:
  postgres:
    image: postgres:16-bookworm
    environment:
      POSTGRES_USER: auditapp
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: auditapp
    volumes:
      - auditapp_pgdata:/var/lib/postgresql/data
    networks:
      - internal
    # SIN ports: — solo red interna

  app:
    build: .
    environment:
      DATABASE_URL: postgres://auditapp:${POSTGRES_PASSWORD}@postgres:5432/auditapp
      SESSION_SECRET: ${SESSION_SECRET}
      PUBLIC_APP_URL: https://app.auditoriaserviciosysistemas.com.ar
      R2_ACCOUNT_ID: ${R2_ACCOUNT_ID}
      R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID}
      R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY}
      R2_BUCKET: ${R2_BUCKET}
      R2_ENDPOINT: ${R2_ENDPOINT}
      PORT: "3000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - internal
      - traefik
    labels:
      - traefik.enable=true
      - traefik.http.routers.auditapp.rule=Host(`app.auditoriaserviciosysistemas.com.ar`)
      - traefik.http.routers.auditapp.entrypoints=websecure
      - traefik.http.routers.auditapp.tls.certresolver=letsencrypt
      - traefik.http.services.auditapp.loadbalancer.server.port=3000

networks:
  internal:
    internal: true
  traefik:
    external: true

volumes:
  auditapp_pgdata:
```

En Dokploy UI: equivalente — servicio Postgres sin publicar puerto; app con dominio custom y Let's Encrypt.

## Variables de entorno producción

```bash
# .env.example (sección producción — placeholders)
DATABASE_URL=postgres://auditapp:changeme@postgres:5432/auditapp
SESSION_SECRET=replace-with-openssl-rand-base64-32
PUBLIC_APP_URL=https://app.auditoriaserviciosysistemas.com.ar
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=auditapp
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
PORT=3000
```

`getServerEnv()` (#1) valida al arranque; contenedor falla rápido si falta `SESSION_SECRET` o `DATABASE_URL`.

## PWA en producción

`@vite-pwa/sveltekit` (#7) genera en build:

- `build/client/manifest.webmanifest` (o inyectado en rutas)
- Service worker en `build/client/sw.js` o workbox equivalente
- Íconos en `static/` copiados al cliente

`adapter-node` sirve estáticos desde `build/client`. Verificaciones:

| Ruta esperada | Origen |
|---|---|
| `/manifest.webmanifest` | vite-pwa |
| `/sw.js` o workbox SW | vite-pwa |
| `/pwa-192x192.png`, `/pwa-512x512.png` | `static/` |

Headers: Traefik no debe cachear agresivamente el SW (config opcional `Cache-Control: no-cache` para `sw.js` en doc).

## Seed en producción

Flujo documentado en `docs/deploy-dokploy.md`:

1. Deploy app + Postgres; entrypoint aplica migraciones.
2. Operador ejecuta **una vez**:
   ```bash
   docker compose exec app pnpm run db:seed
   # o: docker exec <container> node build/seed-cli.js
   ```
3. Cambiar contraseñas de usuarios seed (`admin@...`, técnicos) desde backoffice o SQL.
4. Re-ejecutar seed es idempotente (#2) pero no necesario en restarts.

**Motivo de no seed en entrypoint:** ~1905 clientes + plantillas voluminosas alargan cada restart y no son idempotentes de negocio si se mezclan con datos reales.

## Gate pre-push

`scripts/pre-push.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "── pre-push gate ──"
pnpm test
pnpm run build
docker build -t auditapp:pre-push .
echo "── pre-push OK ──"
```

Documentar en `docs/deploy-dokploy.md`:

> Antes de `git push` (dispara auto-deploy Dokploy): `./scripts/pre-push.sh`. No pushear con gate rojo.

Hook git opcional (documentado, no instalado automáticamente):

```bash
# .git/hooks/pre-push — ejemplo local del operador
./scripts/pre-push.sh
```

## Firmas nuevas

### `src/routes/health/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ success: true, data: { status: 'ok' }, error: null });
};
```

### `scripts/pre-push.sh`

Sin exports; script bash ejecutable.

## Errores

| Situación | Comportamiento |
|---|---|
| `DATABASE_URL` ausente en entrypoint | Exit 1; log `'DATABASE_URL is not set'` |
| Postgres no alcanzable al migrate | Exit 1; Dokploy reinicia según política |
| Migración SQL inválida | Exit 1; no arranca Node |
| `docker build` falla en pre-push | Exit 1; operador no pushea |
| Manifest PWA 404 en prod | Bug de build/vite-pwa; falla R11 en tests |
| argon2 falla en runtime Alpine | Evitado por R2 (Debian) |

## Alternativa descartada: single-stage Dockerfile

**Descartado:** imagen única que instala devDependencies y compila en el mismo layer final.

**Motivo:** Acceptance y PRD actualizado por el humano exigen multi-stage: imagen runtime más chica, sin toolchain de build, superficie de ataque menor.

## Alternativa descartada: Drizzle migrate en entrypoint

**Descartado:** `drizzle-kit migrate` (SPEC-07h histórico).

**Motivo:** Proyecto usa postgres.js + SQL files + `runMigrations()` (#2). Coherencia arquitectónica.

## Alternativa descartada: seed en entrypoint

**Descartado:** ejecutar `runSeed()` en cada `docker start`.

**Motivo:** Tiempo de arranque, riesgo en re-deploys con datos reales, CSV pesado. Seed es operación one-shot documentada.

## Alternativa descartada: GitHub Actions como gate obligatorio

**Descartado:** pipeline CI remoto como único gate.

**Motivo:** PRD 07h — SyS usa Dokploy auto-deploy on push; gate local pre-push + tests es suficiente v1. Actions queda fuera de alcance.

## Alternativa descartada: Postgres gestionado externo expuesto

**Descartado:** DB managed con endpoint público y firewall rules.

**Motivo:** `docs/architecture.md` y reglas de seguridad: Postgres no expuesto a internet; red Docker interna en Dokploy.

## Notas para implementer

- Probar `docker build` en Mac ARM si aplica; imagen `bookworm-slim` multi-arch.
- Tests de contenedor pueden usar `testcontainers` o script que levanta compose efímero — si no hay Docker en CI de `init.sh`, tests de docker pueden ser `describe.skipIf(!process.env.DOCKER_AVAILABLE)`.
- Reutilizar `tests/migrate.test.ts` de #2 sin duplicar lógica.
- Actualizar `init.sh` solo si el implementer lo necesita; no es requisito de este spec.
- No commitear `.env` ni passwords de Dokploy.
