# auditapp — Stack y deploy

**ID**: SPEC-07h | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 8 de 8 | **Depende de**: todos

---

## Problem

Sin un stack técnico fijado y un deploy reproducible la app no llega a producción. Cada sesión de desarrollo puede re-discutir el stack, y si el deploy no es reproducible cualquier cambio puede romper prod. SyS opera su propia infra (Dokploy) — la app tiene que deployarse ahí sin fricciones.

## Evidence

- El stack está acordado con Martín: SvelteKit full-stack, Postgres en Dokploy, R2 para binarios, Docker para el deploy.
- Dokploy ya corre en la infra de SyS — no hay que provisionar nada nuevo, solo agregar la app.
- La app es mobile-first con form técnico: sin `adapter-node` + Docker la app no funciona en el servidor.

## Users

- **Primary — Martín (deploy)**: tiene que poder deployar la app en Dokploy y correr migraciones sin intervención manual compleja.
- **Primary — Claude Code (desarrollo)**: tiene que tener el stack fijo para no re-discutirlo en cada sesión.
- **Not for**: usuarios finales — este spec es de infra.

## Hypothesis

Creemos que SvelteKit + `adapter-node` + `postgres.js` (SQL puro) + Docker + Dokploy es el stack más simple que cubre todos los requisitos sin vendor lock-in. Sabremos que funciona cuando un `docker build` + runner de migraciones SQL + seed deje la app funcional en Dokploy con HTTPS, PWA instalable y la DB sin exponer a internet.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Build reproducible desde cero | `docker build` + deploy en < 10 min | Medición en el primer deploy |
| Migraciones idempotentes | Re-run no rompe nada | Test de idempotencia del runner SQL |
| Postgres no accesible desde fuera de la red Docker | 0 puertos DB expuestos al host | Inspección del compose/red de Dokploy |
| 0 secrets expuestos al cliente | Audit de `PUBLIC_*` vars | Inspección del bundle |

## Scope

**MVP** — SvelteKit 5 + adapter-node, TypeScript, `postgres.js` (SQL puro, sin ORM), migraciones como SQL files versionados, auth propia (argon2id + session), Cloudflare R2 vía `aws4fetch`, Tailwind/CSS vars de sys-brand, `@vite-pwa/sveltekit`, Zod para validación. Dockerfile, `.env.example`, deploy en Dokploy con HTTPS por Traefik. **Postgres NO expuesto a internet**: vive solo en la red Docker interna junto a la app. Estructura de repo fijada.

**Flujo de deploy**: gate pre-push = `docker build` + tests (obligatorio, nunca se saltea). Push al repo → Dokploy reconstruye y despliega. Migraciones SQL en el entrypoint del container.

**Out of scope**

- Pipeline CI/CD externo complejo (GitHub Actions con stages, etc.) — el gate es local pre-push + auto-deploy de Dokploy.
- Multi-stage Docker build (v1: single stage está bien para el tamaño del proyecto).
- Monitoreo / alertas (responsabilidad de infra de Dokploy).
- Backups automáticos de Postgres (responsabilidad de infra; alinear con política de backups de SyS).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 8a | Scaffolding inicial SvelteKit | Repo con estructura fija, TypeScript, `postgres.js`, Tailwind, Zod configurados | pending | — |
| 8b | Dockerfile y deploy Dokploy | `docker build` funciona; app + Postgres en red Docker interna (DB no expuesta); HTTPS por Traefik; env vars documentadas | pending | — |
| 8c | Migraciones en deploy | Runner de SQL files versionados corre al arrancar el container; idempotente | pending | — |
| 8d | PWA configurada | Manifest SyS, SW de shell, instalable Android/iOS | pending | — |

## Open Questions

- [x] ~~ORM~~ — **✅ postgres.js puro con SQL. Sin Drizzle ni Kysely.**
- [x] ~~Dominio/subdominio de la app~~ — **✅ `app.auditoriaserviciosysistemas.com.ar`** (subdominio del dominio secundario ya comprado).
- [x] ~~Estrategia de migraciones~~ — **✅ En el entrypoint del container**: corre los SQL pendientes al arrancar, antes de levantar la app. Idempotente.
- [x] ~~CI / deploy~~ — **✅ Flujo: antes de pushear, siempre `docker build` del contenedor + correr los tests (sin falta). Push → Dokploy auto-deploya.** El build y los tests son el gate previo al push; Dokploy reconstruye y despliega al recibir el push.

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Postgres expuesto por error a internet | Baja | Alto | DB solo en red Docker interna; sin port mapping al host; verificar en el compose de Dokploy |
| argon2 no compila en Alpine Linux | Baja | Bajo | Usar imagen Debian o fallback a bcrypt |
| Traefik no configura SSL automáticamente | Baja | Bajo | Dokploy ya gestiona Traefik; seguir la documentación de Dokploy |
| Migraciones no idempotentes rompen prod | Media | Alto | SQL files versionados con control de aplicadas; testar en staging primero |

---

## Spec técnica de referencia

### Stack fijado

| Capa | Elección | Notas |
|---|---|---|
| Framework | SvelteKit (Svelte 5) | SSR + form actions + API endpoints |
| Adapter | `adapter-node` | Corre como server Node en Dokploy |
| Lenguaje | TypeScript | |
| DB | PostgreSQL 16 | Servicio en Dokploy |
| Acceso a DB | `postgres.js` (SQL puro) | Sin ORM — SQL directo, tipado manual |
| Migraciones | SQL files versionados (`/migrations/*.sql`) | `drizzle-kit` eliminado |
| Auth | Propia (argon2id + session + cookie) | |
| Storage | R2 vía `aws4fetch` | Liviano, S3-compatible, ideal para R2 |
| Estilos | Tailwind + CSS vars de sys-brand | |
| PWA | `@vite-pwa/sveltekit` | |
| Validación | Zod (server-side) | |

### Estructura del repo

```
src/
  lib/
    server/
      db/        # cliente postgres.js + queries SQL
      auth/      # sesiones, hash, guards
      r2/        # presigned URLs (aws4fetch)
      scoring/   # motor de scoring determinístico (07f)
    components/  # form fields data-driven, UI mobile
    forms/       # motor render data-driven (compartido tec/cliente)
  routes/
    (app)/       # backoffice + form técnico (protegido)
      tablero/
      auditorias/[id]/
      plantillas/
      usuarios/
    briefing/[token]/  # público, sin auth
    login/
    api/               # autosave, presign, export JSON canónico (07i)
  hooks.server.ts      # resolución de sesión
migrations/            # SQL files versionados
static/                # manifest PWA, íconos SyS
Dockerfile
.env.example
```

### Variables de entorno (.env.example)

```
DATABASE_URL=postgres://user:pass@host:5432/sysaudit
SESSION_SECRET=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=sysaudit
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
PUBLIC_APP_URL=https://app.auditoriaserviciosysistemas.com.ar
```

---

*Status: DRAFT. Spec de referencia completa en [`specs/10_deploy_dokploy/requirements.md`](../../specs/10_deploy_dokploy/requirements.md).*
