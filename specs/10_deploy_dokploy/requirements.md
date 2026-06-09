# Requirements — #10 10_deploy_dokploy

> Deploy reproducible en Dokploy: Docker multi-stage, migraciones SQL en entrypoint, Postgres en red interna, HTTPS Traefik, PWA en prod, seed documentado y gate pre-push.
> Milestones 8b–8d de SPEC-07h. Complementa `01_stack_scaffolding` (#1).
> Depende de: `01_stack_scaffolding` (#1), `02_modelo_datos` (#2) para runner `migrate.ts` y `runSeed`; PWA plugin de `07_form_tecnico` (#7) para assets en prod.
> Fuentes: `docs/source-specs/specs-07/10-deploy-dokploy/spec.md`, `docs/source-specs/prds/auditapp-10-deploy-dokploy.prd.md`.

## R1 — Dockerfile multi-stage

El sistema DEBE incluir un `Dockerfile` multi-stage que compile SvelteKit con `@sveltejs/adapter-node` y produzca una imagen de runtime con solo dependencias de producción y el artefacto `build/`.

**Verificación:** `docker build -t auditapp:test .` exit code 0; inspección del Dockerfile confirma al menos tres stages (`deps`, `build`, `runtime`).

## R2 — Imagen base compatible con argon2id

El sistema DEBE usar una imagen base Debian/glibc (no Alpine/musl) en el stage de runtime para que el binding nativo de `argon2` compile y ejecute sin fallback.

**Verificación:** `tests/docker.test.ts > runtime image is debian-based`; contenedor de test ejecuta `node -e "require('argon2')"` sin error.

## R3 — Migraciones SQL en entrypoint antes de la app

CUANDO el contenedor de la app arranca, el sistema DEBE ejecutar el runner de migraciones SQL (`runMigrations` de `src/lib/server/db/migrate.ts`) contra `DATABASE_URL` antes de iniciar el servidor Node de SvelteKit.

**Verificación:** `tests/entrypoint.test.ts > runs migrations before starting node server`; log de arranque muestra migraciones aplicadas/skipped previo a «Listening».

## R4 — Migraciones idempotentes en deploy

SI el entrypoint se ejecuta más de una vez con el mismo schema ENTONCES el sistema DEBE omitir migraciones ya registradas en `schema_migration` sin error ni duplicación de DDL.

**Verificación:** `tests/migrate.test.ts > skips already applied migrations` (reutilizado de #2); `tests/entrypoint.test.ts > second container start skips applied migrations`.

## R5 — Fallo de migración aborta el arranque

SI una migración SQL falla durante el entrypoint ENTONCES el sistema DEBE terminar el proceso con código de salida distinto de cero y NO iniciar el servidor de la app.

**Verificación:** `tests/entrypoint.test.ts > exits non-zero when migration fails`; contenedor no pasa healthcheck si DDL inválido.

## R6 — Postgres solo en red Docker interna

El sistema DEBE desplegar Postgres como servicio accesible únicamente desde la red Docker interna de Dokploy, sin `ports:` publicados al host ni binding `0.0.0.0`.

**Verificación:** inspección de `deploy/dokploy.compose.example.yml` (o equivalente) confirma ausencia de mapeo de puertos en el servicio Postgres; `tests/deploy-compose.test.ts > postgres service has no host port mapping`.

## R7 — DATABASE_URL apunta al hostname interno

El sistema DEBE documentar que `DATABASE_URL` en producción usa el nombre de servicio Docker interno (p. ej. `postgres://auditapp:***@postgres:5432/auditapp`), no `localhost` ni IP pública.

**Verificación:** `.env.example` y `docs/deploy-dokploy.md` muestran host `postgres`; `tests/deploy-env.test.ts > production DATABASE_URL uses internal hostname`.

## R8 — HTTPS Traefik en dominio de producción

El sistema DEBE documentar la configuración Dokploy/Traefik para servir la app en `https://app.auditoriaserviciosysistemas.com.ar` con terminación TLS en el reverse proxy.

**Verificación:** `docs/deploy-dokploy.md` incluye dominio, labels Traefik y `PUBLIC_APP_URL=https://app.auditoriaserviciosysistemas.com.ar`; `tests/deploy-docs.test.ts > documents traefik domain`.

## R9 — Cookies Secure en producción

MIENTRAS `PUBLIC_APP_URL` usa esquema `https`, el sistema DEBE emitir cookies de sesión con flag `Secure`.

**Verificación:** `tests/auth-cookie.test.ts > sets Secure cookie when PUBLIC_APP_URL is https` (extiende #3); variable prod en `.env.example` usa `https://`.

## R10 — Variables de entorno de producción documentadas

El sistema DEBE actualizar `.env.example` con valores de ejemplo para producción (placeholders, sin secretos reales) incluyendo `PUBLIC_APP_URL=https://app.auditoriaserviciosysistemas.com.ar`.

**Verificación:** inspección `.env.example`; `tests/deploy-env.test.ts > documents all required production vars`.

## R11 — PWA manifest accesible en prod

CUANDO la app corre en el contenedor de producción, el sistema DEBE responder HTTP 200 en la ruta del manifest PWA (`/manifest.webmanifest` o ruta configurada por `@vite-pwa/sveltekit`) con `Content-Type` de manifiesto web.

**Verificación:** `tests/pwa-prod.test.ts > serves manifest with 200 from production container`; `e2e/pwa-install.spec.ts > manifest is fetchable` (contra preview o contenedor).

## R12 — Service worker y assets PWA en prod

CUANDO la app corre en el contenedor de producción, el sistema DEBE servir el service worker registrado y los íconos estáticos PWA referenciados en el manifest sin 404.

**Verificación:** `tests/pwa-prod.test.ts > serves service worker`; `tests/pwa-prod.test.ts > serves pwa icons from static`.

## R13 — Seed de producción documentado

El sistema DEBE documentar en `docs/deploy-dokploy.md` el procedimiento de seed inicial en producción (una sola vez post-deploy): comando, prerequisitos (`DATABASE_URL`, migraciones aplicadas) y advertencia de cambiar contraseñas seed de dev.

**Verificación:** `tests/deploy-docs.test.ts > documents production seed procedure`; sección describe `pnpm run db:seed` o `docker compose exec` equivalente.

## R14 — Seed de producción ejecutable

CUANDO un operador ejecuta el comando de seed documentado contra la DB de producción con migraciones ya aplicadas, el sistema DEBE completar el seed idempotente definido en `02_modelo_datos` (#2) sin error.

**Verificación:** `tests/seed.test.ts` (reutilizado de #2); `tests/deploy-seed.test.ts > seed command is documented and matches package.json script`.

## R15 — Seed NO automático en cada arranque

El entrypoint del contenedor NO DEBE ejecutar el seed completo de clientes/plantillas en cada reinicio del contenedor.

**Verificación:** inspección `docker/entrypoint.sh` confirma ausencia de `runSeed` en el flujo de arranque; `tests/entrypoint.test.ts > entrypoint does not invoke seed`.

## R16 — Gate pre-push con build Docker y tests

El sistema DEBE proveer un script `scripts/pre-push.sh` que ejecute en orden `pnpm test`, `pnpm run build` y `docker build` y termine con código distinto de cero si cualquier paso falla.

**Verificación:** `tests/pre-push.test.ts > pre-push script exists and runs gate commands`; ejecución manual `./scripts/pre-push.sh` exit 0 en entorno verde.

## R17 — Gate documentado como obligatorio

El sistema DEBE documentar en `docs/deploy-dokploy.md` que el gate pre-push es obligatorio antes de cada push que dispara auto-deploy en Dokploy.

**Verificación:** `tests/deploy-docs.test.ts > documents mandatory pre-push gate`.

## R18 — Contenedor escucha en puerto configurable

El sistema DEBE exponer el servidor `adapter-node` en el puerto definido por `PORT` (default `3000`) dentro del contenedor, sin hardcodear otro puerto.

**Verificación:** `tests/docker.test.ts > container listens on PORT env`; variable `PORT=3000` en compose de ejemplo.

## R19 — Healthcheck del contenedor app

El sistema DEBE incluir un `HEALTHCHECK` en el Dockerfile o compose que verifique que el servidor HTTP responde (p. ej. `GET /` o ruta `/health`).

**Verificación:** `tests/docker.test.ts > Dockerfile defines HEALTHCHECK`; contenedor pasa a `healthy` tras arranque con DB disponible.

## R20 — Sin secretos en el bundle cliente

El sistema DEBE garantizar que variables no `PUBLIC_*` no aparecen en el artefacto cliente generado por `pnpm run build`.

**Verificación:** `tests/docker.test.ts > client bundle does not contain SESSION_SECRET or R2_SECRET`; grep sobre `build/client` tras build.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json) | Requirements |
|---|---|
| Dockerfile multi-stage para SvelteKit | R1, R2, R18 |
| Entrypoint ejecuta migraciones SQL antes de arrancar app | R3, R4, R5, R15 |
| Deploy Dokploy con HTTPS Traefik en app.auditoriaserviciosysistemas.com.ar | R8, R9, R10 |
| Postgres solo red Docker interna, sin puerto expuesto | R6, R7 |
| PWA assets servidos correctamente en prod | R11, R12 |
| Seed prod documentado y ejecutable | R13, R14, R15 |
| CI: build+tests pre-push | R16, R17 |
