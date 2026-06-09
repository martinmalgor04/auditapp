# auditapp — Plataforma de auditorías IT/ERP (SyS)

App web **mobile-first** para digitalizar auditorías: backoffice, briefing del cliente y carga en campo.

## Arnés de desarrollo

Este repo usa **harness-sdd** (Spec-Driven Development):

| Recurso | Qué es |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Mapa de navegación para agentes |
| [`feature_list.json`](feature_list.json) | Backlog activo (10 features) |
| [`ROADMAP.md`](ROADMAP.md) | Vista alto nivel + dependencias |
| [`specs/README.md`](specs/README.md) | Índice numerado #1–#10 de specs EARS |
| `specs/<NN_feature>/` | Specs EARS vivos (`01_stack_scaffolding` … `10_deploy_dokploy`) |
| [`docs/source-specs/`](docs/source-specs/) | PRDs y specs históricas (referencia) |

**Empezar:** `./init.sh` → `/leader` en Cursor.

## Stack

SvelteKit 5 · TypeScript · PostgreSQL · postgres.js · R2 · Docker · Tailwind · Zod

Ver [`docs/architecture.md`](docs/architecture.md) y [`PROJECT.md`](PROJECT.md).

## Comandos (tras 01_stack_scaffolding)

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
├── docs/source-specs/ # PRDs y specs históricas (01–10 en specs-07/)
├── specs/             # specs EARS #1–#10 (ver specs/README.md)
├── progress/          # bitácora de sesiones
├── seed/              # datos de seed (clientes CSV)
└── src/               # (tras feature #1 01_stack_scaffolding)
```
