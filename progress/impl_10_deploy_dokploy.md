# Implementación — #10 10_deploy_dokploy

## Resumen

Infraestructura de deploy Dokploy: Dockerfile multi-stage (node:22-bookworm-slim), entrypoint migrate→node, health `/health`, compose ejemplo Traefik, docs operativas, gate pre-push, cookies Secure en HTTPS, tests de contenedor/docs/PWA.

## Archivos creados/modificados

| Archivo | Cambio |
|---|---|
| `Dockerfile` | Multi-stage deps/build/runtime + HEALTHCHECK |
| `.dockerignore` | Excluye dev/tests/secretos |
| `docker/entrypoint.sh` | migrate-cli → exec node build/index.js |
| `docker/migrate-cli.mjs` | runMigrations vía build/migrate*.js |
| `scripts/build-migrate.mjs` | Compila migrate con esbuild |
| `scripts/pre-push.sh` | test → build → docker build |
| `deploy/dokploy.compose.example.yml` | Postgres red interna + Traefik |
| `docs/deploy-dokploy.md` | Runbook deploy |
| `src/routes/health/+server.ts` | GET health envelope |
| `src/lib/server/auth/session.ts` | Secure cookie si PUBLIC_APP_URL https |
| `.env.example` | Host postgres prod, PUBLIC_APP_URL https |
| `package.json` | build:migrate, prepush, esbuild devDep |
| Tests deploy + e2e/pwa-install.spec.ts | R1–R20 |

## Verificación manual

- `pnpm run build:migrate` → `build/migrate.js`, `build/migrate-deps.js`
- `docker build -t auditapp:test .` → exit 0
- `./init.sh` → exit 0 (288 passed, 2 skipped)

## Trazabilidad

- R1 → tests/docker.test.ts > docker build succeeds (skipIf !DOCKER_AVAILABLE)
- R2 → tests/docker.test.ts > runtime image is debian-based + argon2 native (skipIf docker)
- R3 → tests/entrypoint.test.ts > runs migrations before starting node server
- R4 → tests/migrate.test.ts + tests/entrypoint.test.ts > second start skips applied
- R5 → tests/entrypoint.test.ts > exits non-zero when migration fails
- R6 → tests/deploy-compose.test.ts > postgres service has no host port mapping
- R7 → tests/deploy-env.test.ts > production DATABASE_URL uses internal hostname
- R8 → tests/deploy-docs.test.ts > documents traefik domain
- R9 → tests/auth-cookie.test.ts > sets Secure cookie when PUBLIC_APP_URL is https
- R10 → tests/deploy-env.test.ts > documents all required production vars
- R11 → tests/pwa-prod.test.ts + e2e/pwa-install.spec.ts
- R12 → tests/pwa-prod.test.ts > serves service worker + pwa icons from static
- R13 → tests/deploy-docs.test.ts > documents production seed procedure
- R14 → tests/deploy-seed.test.ts + tests/seed.test.ts (reutilizado)
- R15 → tests/entrypoint.test.ts > entrypoint does not invoke seed
- R16 → tests/pre-push.test.ts + scripts/pre-push.sh
- R17 → tests/deploy-docs.test.ts > documents mandatory pre-push gate
- R18 → tests/docker.test.ts > container listens on PORT env
- R19 → tests/docker.test.ts > Dockerfile defines HEALTHCHECK + src/routes/health
- R20 → tests/docker.test.ts > client bundle does not contain SESSION_SECRET or R2_SECRET

## Notas

- PWA: manifest/SW manual en `static/` (no @vite-pwa/sveltekit); tests verifican preview prod.
- Tests docker con `DOCKER_AVAILABLE=1` habilitan build/run de imagen.
- `esbuild` añadido como devDependency para `build:migrate` (runtime Docker compila en stage build).
