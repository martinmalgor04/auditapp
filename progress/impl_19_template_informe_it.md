# Implementación #19 — 19_template_informe_it

## Resumen

Template A4 propio para auditorías IT puras y composición mixta IT+ERP sobre la infraestructura de #14.
Despacho en `renderInformeHtml` por `tipoAuditoria`; ERP byte-idéntico salvo `data-template="erp"`.
Canónico 1.1 con `template_code` por sección; prompt 2.1 por tipo; schema draft parametrizado para mixta.

## Trazabilidad R → test

| Req | Verificación |
|-----|----------------|
| R1 | `tests/informe-render-it.test.ts` — despacho `data-template` it/mixta/erp |
| R2 | `tests/informe-render.test.ts` — snapshot ERP + `data-template="erp"` |
| R3 | `tests/informe-render-it.test.ts` — 7 páginas IT, hallazgos por área, mejoras |
| R4 | `tests/informe-render-it.test.ts` — `--sys-*`, logos R2, `@media print` |
| R5 | `tests/informe-render-it.test.ts` — 9 páginas mixto, doble gauge, tablas separadas |
| R6 | `tests/informe-pipeline.test.ts` — mixta sin `template_code` → `error` |
| R7 | `tests/informe-schemas.test.ts` — `reportClientDraftSchemaFor` erp/it/mixta |
| R8 | `tests/informe-prompt.test.ts` — bloques IT/ERP/mixta, versión 2.1 |
| R9 | `tests/informe-render-it.test.ts` — sin copy ERP prohibido; editabilidad |
| R10 | `docs/plantillas/informe/template_informe_pdf_a4_it_v1.html` |
| R11 | `./init.sh` — 572 tests verdes; sin cambios en `e2e/` |

## Archivos clave

- Render: `src/lib/informe/render{,-shared,-erp,-it,-mixto,-mixto-parts}.ts`
- Dominio: `src/lib/server/informe/tipo.ts`, `model.ts`, `errors.ts`
- Canónico: `src/lib/server/canonical/{schema,build,version}.ts` → 1.1
- Schemas/prompt: `schemas.ts`, `prompts/generate-report.ts` (2.1)
- Fixtures: `tests/fixtures/informe-canonical-variants.ts`

## Gate

`./init.sh` exit 0 — 572 passed, 2 skipped.
