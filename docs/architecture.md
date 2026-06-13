# Arquitectura — Qué significa "hacer un buen trabajo" en auditapp

> Estándar de calidad. Los revisores evalúan código contra este archivo.

## Stack

**SvelteKit 5 · TypeScript · PostgreSQL 16 · postgres.js (SQL puro) · Cloudflare R2 · Docker · Tailwind · Zod**

Auth propia (argon2id + cookie HttpOnly). Scoring determinístico. PWA instalable.
Deploy Dokploy + Traefik. Postgres solo en red Docker interna.

## Principios

1. **Capas claras.** Cuatro capas:
   - `src/lib/server/db/` — acceso Postgres (queries SQL, sin ORM).
   - `src/lib/server/` — lógica de dominio (auth, scoring, storage R2).
   - `src/routes/` — UI SvelteKit + API routes (`+server.ts`).
   - `migrations/` — schema versionado, runner propio.
   No añadir capas (repositorios abstractos, DI frameworks) sin documentar en spec.

2. **Inmutabilidad por defecto.** Objetos de dominio y estado de UI: crear copias,
   no mutar in-place. Ver `docs/conventions.md`.

3. **Errores explícitos.** Funciones que pueden fallar lanzan errores tipados o
   devuelven `Result` con mensaje claro. Nunca silenciar fallos.

4. **Validación en fronteras.** Todo input externo (formularios, API, uploads)
   pasa por Zod antes de tocar DB o R2.

5. **API envelope consistente.** Respuestas JSON:
   `{ success, data, error, meta? }` — ver convenciones.

6. **Data-driven templates.** Plantillas IT/ERP viven en Postgres
   (`template → section → template_item`), no en código.

## Flujo de datos (auditoría)

```
cliente (briefing) ─→ audit_response (source=cliente)
                              │
técnico (form PWA) ─→ audit_response (source=tecnico) + attachment (R2)
                              │
cierre ─→ audit_section_score + audit_closure + scoring determinístico
                              │
export ─→ JSON canónico (schema_version) → pipeline IA (SPEC-08)
                              │
presupuesto ─→ POST presupuestossys M2M (contrato v1.0, #16)
```

## Estructura de directorios (post-scaffolding)

```
src/
├── lib/
│   ├── server/
│   │   ├── db/          # postgres.js queries
│   │   ├── auth/        # sesiones, argon2id
│   │   ├── scoring/     # motor determinístico
│   │   └── storage/     # presigned R2 (aws4fetch)
│   └── components/      # UI compartida
├── routes/
│   ├── (app)/           # backoffice autenticado
│   ├── briefing/[token]/ # público cliente
│   └── api/             # endpoints JSON
migrations/              # NNN_description.sql
tests/                   # vitest unit/integration
e2e/                     # playwright
```

## Qué NO hacer

- No usar ORM (Prisma, Drizzle). Solo postgres.js + SQL.
- No exponer Postgres a internet.
- No hardcodear secretos. Variables de entorno validadas al arranque.
- No mezclar lógica de scoring en componentes Svelte — vive en `lib/server/scoring/`.
- No editar plantillas como código — son filas en DB.
- No marcar auditoría cerrada sin invalidar `public_token`.

## Referencia

Specs archivadas: `docs/source-specs/specs-07/`. PRDs: `docs/source-specs/prds/`.

Integración presupuestossys (#16): contrato M2M versionado en
[`specs/16_presupuesto_psys/design.md`](../specs/16_presupuesto_psys/design.md) §Contrato.
