# Mapa source-specs → specs SDD

> Referencia de trazabilidad. Las fuentes viven en `docs/source-specs/` (histórico).
> Los specs vivos SDD viven en `specs/<feature-name>/{requirements,design,tasks}.md`.
> El `feature-name` coincide con el campo `name` de `feature_list.json`.

## Relación 1:N (desglose)

| Fuente | SDD feature(s) | Notas |
|---|---|---|
| `specs-07/spec.md` + `prds/auditapp.prd.md` | — (contexto global) | No es feature implementable; alimenta todos los specs |
| `07a-modelo-datos` | `modelo_datos` (#2) | 1:1 |
| `07b-auth-roles` | `auth_roles` (#3) | 1:1 |
| `07c-backoffice` | `backoffice` (#4) | 1:1 |
| `07d-briefing-externo` | `briefing_externo` (#5) | 1:1 |
| `07g-storage-r2` | `storage_r2` (#6) | 1:1 |
| `07e-form-tecnico-mobile` | `form_tecnico` (#7) | 1:1; depende de storage_r2 |
| `07f-cierre-auditoria` | `cierre_scoring` (#8) | 1:1 |
| `07i-contrato-datos-ia` | `contrato_datos` (#9) | 1:1 |
| `07h-stack-deploy` | `stack_scaffolding` (#1) + `deploy_dokploy` (#10) | **1:2** — fase inicial vs fase final |

## Desglose 07h → dos features

| Milestone PRD 07h | Feature SDD | Alcance |
|---|---|---|
| 8a Scaffolding inicial | `stack_scaffolding` | SvelteKit 5, TS, Tailwind, Zod, vitest, playwright, postgres.js stub, `.env.example` |
| 8b–8d Deploy + migraciones + PWA prod | `deploy_dokploy` | Dockerfile, entrypoint migraciones, Dokploy, Traefik, seed prod, CI gate |

## Decisiones vigentes (PRD/architecture > spec-07h legacy)

La spec legacy `07h-stack-deploy/spec.md` menciona Drizzle — **descartado**.
Fuente de verdad para stack:

- `docs/architecture.md`
- `docs/source-specs/prds/auditapp-07h-stack-deploy.prd.md` (open questions cerradas)
- `postgres.js` + SQL en `migrations/`, sin ORM

## Orden de conversión (spec_author)

1. `stack_scaffolding` ← en curso
2. `modelo_datos`
3. `auth_roles`
4. `backoffice`
5. `briefing_externo`
6. `storage_r2`
7. `form_tecnico`
8. `cierre_scoring`
9. `contrato_datos`
10. `deploy_dokploy`

Una feature a la vez. Puerta humana en cada `spec_ready`.
