# Mapa source-specs → specs SDD

> Referencia de trazabilidad. Fuentes históricas en `docs/source-specs/`.
> Specs vivos SDD en `specs/<NN_feature>/{requirements,design,tasks}.md`.
> El prefijo numérico en `name` identifica la carpeta SDD; `id` en `feature_list.json` define orden de implementación (puede diferir: #10 = `11_ui_branding_sys`, #11 = `10_deploy_dokploy`).

## Catálogo numerado (#1–#11)

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
| 10 | `11_ui_branding_sys` | `specs-07/spec.md` §6 + skill `sys-brand` | (transversal UI; sin PRD dedicado) |
| 11 | `10_deploy_dokploy` | `specs-07/10-deploy-dokploy/` | `prds/auditapp-10-deploy-dokploy.prd.md` |

Contexto global (no implementable): `specs-07/spec.md` + `prds/auditapp.prd.md`.

## Desglose stack/deploy (#1 + #11 deploy)

| Feature | Alcance |
|---------|---------|
| `#1 01_stack_scaffolding` | SvelteKit 5, TS, Tailwind, Zod, vitest, playwright, postgres.js stub, `.env.example`, Postgres local Docker |
| `#11 10_deploy_dokploy` | Dockerfile, entrypoint migraciones, Dokploy, Traefik, seed prod, CI gate, PWA prod |

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
10. `11_ui_branding_sys` — branding SyS antes de prod (tokens, shell, PWA manifest)
11. `10_deploy_dokploy` — deploy con UI ya unificada

Una feature a la vez. Puerta humana en cada `spec_ready`.

## Marca transversal (#10 en backlog)

| Fuente viva | Uso en auditapp |
|---|---|
| `sys-brand/SKILL.md` | Identidad global |
| `sys-brand/references/palette.md` | Tokens CSS/Tailwind |
| `sys-brand/references/assets.md` | Logos → `static/brand/` |
| `sys-brand/references/formats-web.md` | Botones, inputs, shell |
| `sys-brand/references/typography.md` | Montserrat |

Deuda actual: `brand.css` legacy (`#1e4d8c`), manifest `#003366`, placeholder `sys-logo.svg`. Feature #10 (`11_ui_branding_sys`) unifica sin rediseño funcional.
