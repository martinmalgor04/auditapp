# auditapp — Plataforma de auditorías IT/ERP (SyS)

App web **mobile-first** para digitalizar auditorías: backoffice, briefing del cliente y carga en campo.

## Arnés de desarrollo

Este repo usa **harness-sdd** (Spec-Driven Development):

| Recurso | Qué es |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Mapa de navegación para agentes |
| [`feature_list.json`](feature_list.json) | Backlog activo (10 features) |
| [`ROADMAP.md`](ROADMAP.md) | Vista alto nivel + dependencias |
| `specs/<feature>/` | Specs EARS vivos (se generan por etapa) |
| [`docs/source-specs/`](docs/source-specs/) | PRDs y specs históricas (referencia) |

**Empezar:** `./init.sh` → `/leader` en Cursor.

## Stack

SvelteKit 5 · TypeScript · PostgreSQL · postgres.js · R2 · Docker · Tailwind · Zod

Ver [`docs/architecture.md`](docs/architecture.md) y [`PROJECT.md`](PROJECT.md).

## Comandos (tras stack_scaffolding)

```bash
pnpm install
pnpm run dev          # http://localhost:5173
pnpm run db:up        # Postgres 16 local (Docker)
pnpm run db:down      # detiene contenedor db
pnpm test             # vitest
pnpm exec playwright test
./init.sh
```


```
auditapp/
├── AGENTS.md, feature_list.json, init.sh
├── docs/              # arquitectura, convenciones, verificación, SDD
├── docs/source-specs/ # specs/07* y PRDs archivados
├── specs/             # specs EARS por feature (vivos)
├── progress/          # bitácora de sesiones
├── seed/              # datos de seed (clientes CSV)
└── src/               # (tras feature #1 stack_scaffolding)
```
