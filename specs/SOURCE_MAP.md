# Mapa source-specs → specs SDD

> Referencia de trazabilidad. Fuentes históricas en `docs/source-specs/`.
> Specs vivos SDD en `specs/<NN_feature>/{requirements,design,tasks}.md`.
> El prefijo numérico coincide con `id` y `name` en `feature_list.json`.

## Catálogo numerado (#1–#10)

| # | Feature SDD | Spec histórica | PRD |
|---|-------------|----------------|-----|
| 1 | `01_stack_scaffolding` | `specs-07/01-stack-scaffolding/` | (incluido en #10 PRD, fase inicial) |
| 2 | `02_modelo_datos` | `specs-07/02-modelo-datos/` | `prds/auditapp-02-modelo-datos.prd.md` |
| 3 | `03_auth_roles` | `specs-07/03-auth-roles/` | `prds/auditapp-03-auth-roles.prd.md` |
| 4 | `04_backoffice` | `specs-07/04-backoffice/` | `prds/auditapp-04-backoffice.prd.md` |
| 5 | `05_briefing_externo` | `specs-07/05-briefing-externo/` | `prds/auditapp-05-briefing-externo.prd.md` |
| 6 | `06_storage_r2` | `specs-07/06-storage-r2/` | `prds/auditapp-06-storage-r2.prd.md` |
| 7 | `07_form_tecnico` | `specs-07/07-form-tecnico-mobile/` | `prds/auditapp-07-form-tecnico-mobile.prd.md` |
| 8 | `08_cierre_scoring` | `specs-07/08-cierre-auditoria/` | `prds/auditapp-08-cierre-auditoria.prd.md` |
| 9 | `09_contrato_datos` | `specs-07/09-contrato-datos-ia/` | `prds/auditapp-09-contrato-datos-ia.prd.md` |
| 10 | `10_deploy_dokploy` | `specs-07/10-deploy-dokploy/` | `prds/auditapp-10-deploy-dokploy.prd.md` |

Contexto global (no implementable): `specs-07/spec.md` + `prds/auditapp.prd.md`.

## Desglose stack/deploy (#1 + #10)

| Feature | Alcance |
|---------|---------|
| `#1 01_stack_scaffolding` | SvelteKit 5, TS, Tailwind, Zod, vitest, playwright, postgres.js stub, `.env.example`, Postgres local Docker |
| `#10 10_deploy_dokploy` | Dockerfile, entrypoint migraciones, Dokploy, Traefik, seed prod, CI gate, PWA prod |

## Decisiones vigentes

La spec histórica `10-deploy-dokploy/spec.md` menciona Drizzle — **descartado**.
Fuente de verdad: `docs/architecture.md`, `auditapp-10-deploy-dokploy.prd.md`, postgres.js + SQL en `migrations/`.

## Orden de implementación

1. `01_stack_scaffolding` ✅
2. `02_modelo_datos` ✅
3. `03_auth_roles`
4. `04_backoffice`
5. `05_briefing_externo`
6. `06_storage_r2`
7. `07_form_tecnico`
8. `08_cierre_scoring`
9. `09_contrato_datos`
10. `10_deploy_dokploy`

Una feature a la vez. Puerta humana en cada `spec_ready`.
