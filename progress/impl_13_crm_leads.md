# Implementación — #13 13_crm_leads

> Documento de trazabilidad R↔test (T15). Gate vitest verificado 2026-06-13.

## Resumen

Mini-CRM: migración `008_crm_leads.sql`, capa `src/lib/server/crm/`, DB `crm-leads.ts`, APIs batch + staff, vista `/crm`.

## Trazabilidad

| Req | Test(s) |
|-----|---------|
| R1 | `tests/crm-schema.test.ts` — columnas, CHECK source/status, unicidad email case-insensitive |
| R2 | `tests/crm-state-machine.test.ts` — transiciones válidas/inválidas, `CRM_INVALID_TRANSITION` |
| R3 | `tests/crm-state-machine.test.ts` — `linkAudit` contactado→auditado con eventos; `tests/api/crm-leads.test.ts` — PATCH audit_id sobre descartado 409 |
| R4 | `tests/api/crm-leads-batch.test.ts` — 401 sin/mal token, env sin `CRM_API_TOKEN`, conteo DB intacto |
| R5 | `tests/api/crm-leads-batch.test.ts` — 400 lote atómico (ítem sin email), máx 201 ítems |
| R6 | `tests/api/crm-leads-batch.test.ts` — upsert dedupe, conserva status/source, completa telefono |
| R7 | `tests/api/crm-leads.test.ts` — 401 sin sesión; técnico GET/status OK, POST/PATCH 403; admin OK |
| R8 | `tests/api/crm-leads.test.ts` — evento con `changed_by`; `tests/crm-state-machine.test.ts` — inválida no inserta evento |
| R9 | `tests/api/crm-leads.test.ts` — descartado excluido default, visible con filtro; sin ruta DELETE |
| R10 | `tests/api/crm-leads.test.ts` — filtros status/source y `q`; `e2e/crm.spec.ts` — lista y filtros UI *(e2e no ejecutable: build roto)* |
| R11 | `tests/api/crm-leads.test.ts` — contadores funnel 6 etapas; `e2e/crm.spec.ts` — chips contadores *(e2e no ejecutable)* |
| R12 | `tests/api/crm-leads.test.ts` — transición válida 200, inválida 409; `e2e/crm.spec.ts` — avance UI *(e2e no ejecutable)* |
| R13 | `tests/api/crm-leads.test.ts` — PATCH notas/fecha; rechaza email 400 |
| R14 | `tests/api/crm-leads.test.ts` — client_id válido 200, inexistente 404, conteo `client` intacto |

## Gate ejecutado

```bash
./init.sh                    # OK — 513 tests vitest
pnpm exec vitest run tests/crm-schema.test.ts tests/crm-state-machine.test.ts tests/api/crm-leads*.test.ts  # OK (incluido en init)
pnpm exec playwright test e2e/crm.spec.ts  # FAIL — webServer build (psys/view.ts → server/schemas)
pnpm run build               # FAIL — mismo error de import browser/server
```

## Archivos principales

- `migrations/008_crm_leads.sql`
- `src/lib/server/crm/{state-machine,schemas,errors}.ts`
- `src/lib/server/db/crm-leads.ts`
- `src/lib/server/api/require-crm-token.ts`
- `src/routes/api/crm/leads/**`
- `src/routes/(app)/crm/+page.{server,svelte}.ts`
- `src/lib/components/crm/lead-row.svelte`
- `e2e/crm.spec.ts`
