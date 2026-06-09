# Tasks — #10 10_deploy_dokploy

Implementación en orden. Marcar `[x]` al completar. Requiere `01_stack_scaffolding` (#1) y `02_modelo_datos` (#2) implementados; PWA plugin de `07_form_tecnico` (#7) para R11–R12. Documentar trazabilidad R→test en `progress/impl_10_deploy_dokploy.md`.

## Prerrequisitos

- [ ] T0 — Confirmar #1 `done`: `adapter-node`, `pnpm run build`, `.env.example`. Cubre: dependencia base.
- [ ] T1 — Confirmar #2 `done`: `runMigrations`, `runSeed`, `pnpm run db:migrate`, `pnpm run db:seed`, `tests/migrate.test.ts`. Cubre: **R3, R4, R14**.
- [ ] T2 — Confirmar #7 implementa `@vite-pwa/sveltekit` con manifest e íconos SyS. Cubre: **R11, R12**.

## Docker multi-stage

- [ ] T3 — Crear `.dockerignore` excluyendo artefactos de dev y secretos. Cubre: **R1**.
- [ ] T4 — Crear `Dockerfile` multi-stage (`deps`, `build`, `runtime`) con `node:22-bookworm-slim`. Cubre: **R1, R2**.
- [ ] T5 — Añadir paso build que compile runner de migrate a JS invocable en runtime (p. ej. `build:migrate`). Cubre: **R3**.
- [ ] T6 — Configurar `HEALTHCHECK` y `EXPOSE 3000`; `PORT`/`HOST` env. Cubre: **R18, R19**.

## Entrypoint y migraciones

- [ ] T7 — Crear `docker/migrate-cli.mjs` que invoca `runMigrations` y cierra conexión. Cubre: **R3**.
- [ ] T8 — Crear `docker/entrypoint.sh`: migrate → `exec node build/index.js`; sin seed. Cubre: **R3, R5, R15**.
- [ ] T9 — Crear `tests/entrypoint.test.ts` (migrate antes de server, fallo aborta, sin seed). Cubre: **R3, R4, R5, R15**.
- [ ] T10 — Verificar idempotencia en segundo arranque (reutilizar/fixture migrate). Cubre: **R4**.

## Health y seguridad bundle

- [ ] T11 — Crear `src/routes/health/+server.ts` con envelope JSON estándar. Cubre: **R19**.
- [ ] T12 — Crear `tests/docker.test.ts` (build, debian base, PORT, HEALTHCHECK, grep secretos en `build/client`). Cubre: **R1, R2, R18, R19, R20**.

## Dokploy y red interna

- [ ] T13 — Crear `deploy/dokploy.compose.example.yml` (Postgres sin `ports:`, red `internal`, labels Traefik). Cubre: **R6, R8**.
- [ ] T14 — Crear `tests/deploy-compose.test.ts` (sin port mapping Postgres, labels Traefik presentes). Cubre: **R6, R8**.

## Variables y documentación

- [ ] T15 — Actualizar `.env.example` con host `postgres`, `PUBLIC_APP_URL` prod HTTPS. Cubre: **R7, R10**.
- [ ] T16 — Crear `docs/deploy-dokploy.md` (dominio, env, primer deploy, seed, pre-push, troubleshooting). Cubre: **R8, R13, R17**.
- [ ] T17 — Crear `tests/deploy-env.test.ts` y `tests/deploy-docs.test.ts`. Cubre: **R7, R8, R10, R13, R17**.

## Cookies HTTPS

- [ ] T18 — Ajustar emisión de cookie de sesión (#3) para `Secure` cuando `PUBLIC_APP_URL` es `https`. Cubre: **R9**.
- [ ] T19 — Extender/añadir `tests/auth-cookie.test.ts > sets Secure cookie when PUBLIC_APP_URL is https`. Cubre: **R9**.

## PWA en prod

- [ ] T20 — Crear `tests/pwa-prod.test.ts` (manifest 200, SW, íconos desde contenedor o preview prod). Cubre: **R11, R12**.
- [ ] T21 — Crear `e2e/pwa-install.spec.ts` smoke del manifest. Cubre: **R11**.

## Seed producción

- [ ] T22 — Documentar comando seed one-shot en `docs/deploy-dokploy.md` alineado con `pnpm run db:seed`. Cubre: **R13**.
- [ ] T23 — Crear `tests/deploy-seed.test.ts` (script documentado existe en package.json). Cubre: **R14**.

## Gate pre-push

- [ ] T24 — Crear `scripts/pre-push.sh` (`pnpm test` → `pnpm run build` → `docker build`). Cubre: **R16**.
- [ ] T25 — Añadir script pnpm `prepush` opcional en `package.json`. Cubre: **R16**.
- [ ] T26 — Crear `tests/pre-push.test.ts` (script existe, contiene los tres comandos). Cubre: **R16**.

## Verificación final

- [ ] T27 — Ejecutar `docker build -t auditapp:test .` y arrancar con Postgres efímero; verificar `/health` y migraciones. Cubre: **R1, R3, R19**.
- [ ] T28 — Ejecutar `./scripts/pre-push.sh` con entorno verde. Cubre: **R16**.
- [ ] T29 — Ejecutar `./init.sh` y confirmar exit code 0. Cubre: todos.
- [ ] T30 — Documentar trazabilidad R→test en `progress/impl_10_deploy_dokploy.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → tests/docker.test.ts > docker build succeeds
- R2 → tests/docker.test.ts > runtime image is debian-based
- R3 → tests/entrypoint.test.ts > runs migrations before starting node server
- R4 → tests/migrate.test.ts + tests/entrypoint.test.ts > second start skips applied
- R5 → tests/entrypoint.test.ts > exits non-zero when migration fails
- R6 → tests/deploy-compose.test.ts > postgres service has no host port mapping
- R7 → tests/deploy-env.test.ts > production DATABASE_URL uses internal hostname
- R8 → tests/deploy-docs.test.ts > documents traefik domain
- R9 → tests/auth-cookie.test.ts > sets Secure cookie when PUBLIC_APP_URL is https
- R10 → tests/deploy-env.test.ts > documents all required production vars
- R11 → tests/pwa-prod.test.ts + e2e/pwa-install.spec.ts
- R12 → tests/pwa-prod.test.ts > serves service worker and pwa icons
- R13 → tests/deploy-docs.test.ts > documents production seed procedure
- R14 → tests/deploy-seed.test.ts + tests/seed.test.ts (reutilizado)
- R15 → tests/entrypoint.test.ts > entrypoint does not invoke seed
- R16 → tests/pre-push.test.ts + ./scripts/pre-push.sh manual
- R17 → tests/deploy-docs.test.ts > documents mandatory pre-push gate
- R18 → tests/docker.test.ts > container listens on PORT env
- R19 → tests/docker.test.ts > Dockerfile defines HEALTHCHECK
- R20 → tests/docker.test.ts > client bundle does not contain secrets
```
