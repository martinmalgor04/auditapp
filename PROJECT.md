# auditapp

Auditapp permite a los técnicos de Servicios y Sistemas auditar empresas en toda su infraestructura IT e ERP, desde la agenda del cliente hasta el cierre de la auditoría con presupuestos acordes al mismo origen de presupuestos.serviciosysistemas.com.ar.

## Stack

**SvelteKit 5 · TypeScript · PostgreSQL 16 (Dokploy, red interna) · postgres.js (SQL puro) · Cloudflare R2 (aws4fetch) · Docker · Tailwind · Zod**

Auth propia (argon2id + cookie). Scoring automático determinístico. PWA instalable. Deploy en Dokploy con Traefik/HTTPS; Postgres no expuesto a internet.

## Backlog y specs

| Recurso | Ubicación |
|---|---|
| Backlog activo | [`feature_list.json`](feature_list.json) |
| Mapa para agentes | [`AGENTS.md`](AGENTS.md) |
| Specs EARS (vivos) | `specs/<feature>/` |
| Specs históricas | [`docs/source-specs/`](docs/source-specs/) |
| Roadmap alto nivel | [`ROADMAP.md`](ROADMAP.md) |

## Comandos útiles

| Acción | Cursor | Claude Code |
|--------|--------|-------------|
| Siguiente feature SDD | `/leader` | Rol `leader` automático |
| Verificar entorno | `./init.sh` | `./init.sh` |
| Tests (post-scaffolding) | `npm test` | `npm test` |

## Notas del proyecto

Dominio prod: `app.auditoriaserviciosysistemas.com.ar`
Seed clientes: `seed/clientes-presupuestossys.csv`
