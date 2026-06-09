# Review — feature #9 `09_contrato_datos`

**Veredicto:** APPROVED

**Fecha:** 2026-06-09  
**Reviewer:** agente `reviewer`  
**Gate:** `./init.sh` exit 0 — 244 tests (69 archivos), todos verdes.

## Resumen

Implementación completa del contrato JSON canónico v1: módulo `src/lib/server/canonical/`, endpoint `GET /api/audits/[id]/export` admin-only con header `X-Schema-Version`, integración de cierre vía `buildCanonicalAuditJson` + `buildReportPreview`, seed `cab_modulos_tango`, fixtures golden y suite de tests dedicada. Cumple spec EARS, trazabilidad R↔test y checkpoints C1–C6.

## Trazabilidad

- R1: [x] `tests/canonical-schema.test.ts` > CANONICAL_SCHEMA_VERSION is 1.0
- R2: [x] `tests/canonical-builder.test.ts` > builds full canonical payload for closed combo audit
- R3: [x] `tests/canonical-builder.test.ts` > payload schema_version matches constant
- R4: [x] `tests/canonical-builder.test.ts` > generated_at is ISO 8601 with timezone offset
- R5: [x] `tests/api/audit-export.test.ts` > GET export returns canonical JSON for admin
- R6: [x] `tests/api/audit-export.test.ts` > response includes X-Schema-Version header
- R7: [x] `tests/api/audit-export.test.ts` > returns 401 without session; returns 403 for tecnico role
- R8: [x] `tests/api/audit-export.test.ts` > returns 409 when audit not closed
- R9: [x] `tests/canonical-builder.test.ts` > scored sections have score_basis auto
- R10: [x] `tests/canonical-builder.test.ts` > item score_contribution matches score_breakdown; `tests/canonical-contract.test.ts` > score_contribution sum aligns with section score
- R11: [x] `tests/canonical-builder.test.ts` > market_data has all required keys
- R12: [x] `tests/canonical-builder.test.ts` > market_data maps client columns and CAB multiselect
- R13: [x] `tests/canonical-builder.test.ts` > market_data emits null for missing source fields
- R14: [x] `tests/canonical-preview.test.ts` > preview indices match canonical indices; preview risks match canonical top_risks
- R15: [x] `tests/canonical-preview.test.ts` > internal preview includes upsell_findings; stripInternalFindings removes internal upsell entries
- R16: [x] `tests/canonical-schema.test.ts` > schema accepts golden fixture; schema rejects invalid payload
- R17: [x] `tests/canonical-contract.test.ts` > canonical JSON matches snapshot
- R18: [x] `tests/canonical-builder.test.ts` > item attachments are r2_key strings
- R19: [x] `tests/canonical-builder.test.ts` > indices include only applicable types
- R20: [x] `specs/09_contrato_datos/design.md` § Versionado + `tests/canonical-schema.test.ts` > schema version field is semver string + comentario en `version.ts`

## Tasks

- T1: [x] — T24: [x] (24/24 completadas en `specs/09_contrato_datos/tasks.md`)

## Checkpoints

- C1: [x] Arnés completo; `./init.sh` exit 0
- C2: [x] Una sola feature `in_progress` (#9); tests asociados verdes; `progress/current.md` describe sesión activa
- C3: [x] Capas respetadas (`lib/server/canonical/`, API route); Zod en frontera; SQL parametrizado vía postgres.js; sin `console.log` ni TODOs en módulo canonical
- C4: [x] Funciones públicas canonical cubiertas; 244 tests vitest verdes
- C5: [x] Sesión documentada en `progress/current.md` e `impl_09_contrato_datos.md` (cierre formal pendiente de marcar `done` post-review)
- C6: [x] Spec EARS completo (`requirements.md`, `design.md`, `tasks.md`); tasks `[x]`; R1–R20 con test

## Verificación arquitectural

| Criterio spec | Evidencia |
|---|---|
| `CANONICAL_SCHEMA_VERSION = '1.0'` única fuente | `src/lib/server/canonical/version.ts` |
| Builder + `canonicalAuditSchema.parse` antes de retornar | `src/lib/server/canonical/build.ts` L320 |
| Export JSON directo (sin envelope) + header versión | `src/routes/api/audits/[id]/export/+server.ts` |
| Preview compartido con cierre | `src/lib/server/closure/load-closure.ts`; preview cliente vía `buildClientReportPreview` |
| `cab_modulos_tango` en seed ERP | `seed/templates/erp-tango-v2.json` |
| Errores tipados 404/409/401/403 | `errors.ts` + manejo en export route |

## Cambios requeridos

Ninguno.

## Recomendación post-aprobación

1. Marcar `status: "done"` en `feature_list.json` para feature #9.
2. Mover resumen de `progress/current.md` a `progress/history.md` y vaciar plantilla de sesión.
3. Commit + push cuando el humano lo solicite (una feature por commit).
