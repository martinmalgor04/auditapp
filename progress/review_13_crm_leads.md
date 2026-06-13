# Review — feature 13

**Veredicto:** CHANGES_REQUESTED

## Trazabilidad

- R1: [x] `tests/crm-schema.test.ts` — columnas, CHECKs, unicidad email
- R2: [x] `tests/crm-state-machine.test.ts` — transiciones válidas/inválidas
- R3: [x] `tests/crm-state-machine.test.ts` + `tests/api/crm-leads.test.ts` — linkAudit y 409 descartado
- R4: [x] `tests/api/crm-leads-batch.test.ts` — guards token 401
- R5: [x] `tests/api/crm-leads-batch.test.ts` — Zod 400 atómico, máx 200
- R6: [x] `tests/api/crm-leads-batch.test.ts` — dedupe upsert sin pisar status/source
- R7: [x] `tests/api/crm-leads.test.ts` — 401/403 por rol y acción
- R8: [x] `tests/api/crm-leads.test.ts` + `tests/crm-state-machine.test.ts` — eventos y no-evento en inválida
- R9: [x] `tests/api/crm-leads.test.ts` — descartado lógico, listado default/filtro
- R10: [~] API [x] `tests/api/crm-leads.test.ts`; E2E [ ] `e2e/crm.spec.ts` no ejecutable (build falla)
- R11: [~] API [x] `tests/api/crm-leads.test.ts`; E2E [ ] no ejecutable
- R12: [~] API [x] `tests/api/crm-leads.test.ts`; E2E [ ] no ejecutable
- R13: [x] `tests/api/crm-leads.test.ts` — PATCH notas/fecha, email inmutable 400
- R14: [x] `tests/api/crm-leads.test.ts` — client_id válido/404, client count intacto

**Nota:** Cobertura vitest completa R1–R14. E2E declarado en R10/R12 no corre por fallo de build ajeno al CRM.

## Tasks

- T1: [x] migración `008_crm_leads.sql`
- T2: [x] `tests/crm-schema.test.ts`
- T3: [x] state-machine + errors
- T4: [x] `tests/crm-state-machine.test.ts`
- T5: [x] schemas Zod
- T6: [x] `db/crm-leads.ts`
- T7: [x] `require-crm-token.ts` + `.env.example`
- T8: [x] batch API
- T9: [x] `tests/api/crm-leads-batch.test.ts`
- T10: [x] staff APIs GET/POST/PATCH
- T11: [x] status POST API
- T12: [x] `tests/api/crm-leads.test.ts`
- T13: [x] vista `/crm` + lead-row + nav
- T14: [x] `e2e/crm.spec.ts` escrito; **no verificado en ejecución**
- T15: [~] impl doc creado en review; gate playwright/build **rojo**

## Checkpoints

- C1: [x] `./init.sh` exit 0 (513 vitest)
- C2: [x] feature #13 única `in_progress`; tests vitest CRM verdes
- C3: [x] SQL parametrizado, Zod en fronteras, sin console.log en módulo CRM
- C4: [~] vitest OK; **playwright e2e/crm.spec.ts FAIL**; **pnpm run build FAIL**
- C5: [~] `progress/impl_13_crm_leads.md` faltaba (creado en review); sesión activa en `current.md`
- C6: [x] specs EARS completos; tasks [x]; trazabilidad vitest R1–R14

## Gate ejecutado por reviewer

| Comando | Resultado |
|---------|-----------|
| `./init.sh` | OK (513 tests) |
| `pnpm exec playwright test e2e/crm.spec.ts` | **FAIL** — webServer no arranca |
| `pnpm run build` | **FAIL** — import server→browser |

Error de build:

```
src/lib/psys/view.ts imports $lib/server/psys/schemas.ts (runtime value PSYS_PROPOSAL_STATUSES)
→ psys-card.svelte → auditorias/[id]/+page.svelte
```

Origen probable: feature #16 (`16_presupuesto_psys`), no código CRM.

## Cambios requeridos

1. **Desbloquear build y e2e:** mover `PSYS_PROPOSAL_STATUSES` (y labels si aplica) a `$lib/psys/` sin importar `$lib/server/` en código de browser; verificar `pnpm run build` y `pnpm exec playwright test e2e/crm.spec.ts` verdes.
2. **Completar verificación T15:** re-ejecutar gate completo (`pnpm run check`, `pnpm run build`, playwright CRM) y actualizar `progress/impl_13_crm_leads.md` con resultados verdes.
3. **Opcional (R9):** test explícito de ausencia de handler DELETE en rutas CRM (hoy verificado por inspección, no por test).

## Observaciones (no bloqueantes)

- `requirements.md` cita migración `006_crm_leads.sql`; implementación usa `008_crm_leads.sql` (correcto vs secuencia actual).
- R13 spec menciona rechazo de cambio `source`; test solo cubre `email` — aceptable si schema rechaza `source` en PATCH (verificar al re-review).
