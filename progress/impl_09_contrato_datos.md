# Implementación #9 `09_contrato_datos`

## Resumen

- Módulo `src/lib/server/canonical/` con builder, schema Zod v1.0, market_data, preview compartido y errores tipados.
- Endpoint `GET /api/audits/[id]/export` admin-only con header `X-Schema-Version`.
- Cierre (#8) refactorizado: `loadClosurePage` y preview informe consumen `buildCanonicalAuditJson` + `buildReportPreview`.
- Ítem `cab_modulos_tango` añadido a plantilla `erp-tango-v2.json` (options.item_code).
- `./init.sh` verde (244 tests).

## Trazabilidad

- R1 → `tests/canonical-schema.test.ts` > CANONICAL_SCHEMA_VERSION is 1.0
- R2 → `tests/canonical-builder.test.ts` > builds full canonical payload for closed combo audit
- R3 → `tests/canonical-builder.test.ts` > payload schema_version matches constant
- R4 → `tests/canonical-builder.test.ts` > generated_at is ISO 8601 with timezone offset
- R5 → `tests/api/audit-export.test.ts` > GET export returns canonical JSON for admin
- R6 → `tests/api/audit-export.test.ts` > response includes X-Schema-Version header
- R7 → `tests/api/audit-export.test.ts` > returns 401 without session; returns 403 for tecnico role
- R8 → `tests/api/audit-export.test.ts` > returns 409 when audit not closed
- R9 → `tests/canonical-builder.test.ts` > scored sections have score_basis auto
- R10 → `tests/canonical-contract.test.ts` > score_contribution sum aligns with section score
- R11 → `tests/canonical-builder.test.ts` > market_data has all required keys
- R12 → `tests/canonical-builder.test.ts` > market_data maps client columns and CAB multiselect
- R13 → `tests/canonical-builder.test.ts` > market_data emits null for missing source fields
- R14 → `tests/canonical-preview.test.ts` > preview indices match canonical indices; preview risks match canonical top_risks
- R15 → `tests/canonical-preview.test.ts` > internal preview includes upsell_findings; stripInternalFindings removes internal upsell entries
- R16 → `tests/canonical-schema.test.ts` > schema accepts golden fixture; schema rejects invalid payload
- R17 → `tests/canonical-contract.test.ts` > canonical JSON matches snapshot
- R18 → `tests/canonical-builder.test.ts` > item attachments are r2_key strings
- R19 → `tests/canonical-builder.test.ts` > indices include only applicable types
- R20 → `design.md` § Versionado + `tests/canonical-schema.test.ts` > schema version field is semver string

## Archivos clave

| Área | Archivos |
|---|---|
| Canonical | `src/lib/server/canonical/{version,types,schema,build,market-data,preview,errors}.ts` |
| Export API | `src/routes/api/audits/[id]/export/+server.ts` |
| Integración cierre | `src/lib/server/closure/load-closure.ts`, `cierre/preview/+page.{server,svelte}.ts` |
| Seed | `seed/templates/erp-tango-v2.json`, `seed/templates/manifest.json` |
| Tests | `tests/canonical-*.test.ts`, `tests/api/audit-export.test.ts`, `tests/fixtures/canonical-audit.{ts,golden.json}` |

## Notas

- `item_code` vive en `template_item.options.item_code` (sin migración de schema).
- Preview informe cliente usa `buildClientReportPreview` (sin upsell); cierre interno mantiene upsell vía `buildReportPreview`.
- Tests preexistentes (session, attachments 409, audit-crud FK): verdes en suite completa; audit-crud reforzado con `setSqlForTests` en beforeEach.
