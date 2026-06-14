# Tasks — #19 19_template_informe_it

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en
`progress/impl_19_template_informe_it.md`.

> Prerrequisito: #14 en `done`. Sin dependencias nuevas de paquetes.

## Contrato visual

- [x] T1 — Crear `docs/plantillas/informe/template_informe_pdf_a4_it_v1.html` (borrador): copiar el
  ERP y reemplazar páginas 1, 2, 3 y 6 según la tabla del design (portada IT, gauge IT + stats de
  áreas, hallazgos por área A1–A14 sin CAB, mejoras prioritarias); placeholders `__LOGO_*__`,
  comentarios `✏️` en campos editables; verificar impresión A4 sin desbordes en navegador. Cubre:
  **R3, R4, R10**.

## Canónico y modelo

- [x] T2 — `src/lib/server/canonical/schema.ts` + `build.ts`: agregar `template_code` opcional por
  sección, poblarlo desde DB, bump `CANONICAL_SCHEMA_VERSION` a `1.1`; actualizar fixtures de tests
  canónicos/informe. Cubre: **R6**.
- [x] T3 — Crear `src/lib/server/informe/tipo.ts` (mover `tipoAuditoria` desde `model.ts`) y
  extender `buildInformeRenderModel`: `domain: 'it' | 'erp'` por sección vía
  `TEMPLATE_CODE_TO_INDEX`, fallback mono-dominio para snapshots 1.0, y
  `InformeDomainUnresolvedError` (nuevo en `errors.ts`) si mixto sin `template_code`; el pipeline
  la traduce a estado `error`. Cubre: **R1, R6**.

## Render

- [x] T4 — Refactor move-only: extraer `render-shared.ts` (STYLE, `escapeHtml`, `field`, `footer`,
  gauge, helpers) y `render-erp.ts` con las 7 páginas actuales; `renderInformeHtml` queda como
  despachador en `render.ts` y agrega `data-template` al contenedor. Actualizar snapshot ERP: el
  diff debe ser únicamente el atributo. Cubre: **R1, R2**.
- [x] T5 — Implementar `render-it.ts`: 7 páginas IT del design (portada sin sistema/módulos, gauge
  `indices.it`, stats de áreas con placeholder «a editar», tabla de hallazgos por área filtrada
  `domain === 'it'` y sin CAB, mejoras prioritarias con «hoy N/100» del snapshot, cierre); mismo
  STYLE compartido, mismos `data-field` paths, bloques canónicos no editables, sin cadenas
  «Tango»/«módulos»/«circuito». Cubre: **R3, R4, R9**.
- [x] T6 — Implementar `render-mixto.ts`: composición de 9 páginas (portada IT+ERP, resumen doble
  gauge, hallazgos IT, hallazgos ERP, mejoras IT, riesgos únicos, plan único, día a día ERP,
  cierre), split de `hallazgos.circuitos` y `dia_a_dia.circuitos` por `domain`, lectura transversal
  solo en la página IT, footers/eyebrows renumerados. Cubre: **R4, R5, R9**.

## Schemas y prompt

- [x] T7 — `schemas.ts`: `reportClientDraftSchemaFor(tipo)` — misma referencia para `erp`/`it`,
  variante `mixta` con `lectura_transversal` 3–6, `riesgos.items` 3–6, `dia_a_dia.circuitos` 2–6;
  cablear en `pipeline.ts` y en el PATCH de `[version]/+server.ts` derivando el tipo del snapshot
  de la fila. Cubre: **R7**.
- [x] T8 — `prompts/generate-report.ts`: bloque por tipo (ERP textual idéntico al actual; IT sin
  funcionalidades Tango, mejoras por área; mixta cross-dominio con límites ampliados), bump de
  `INFORME_PROMPT_VERSION`, jerga prohibida y líneas/rangos presentes en las tres variantes.
  Cubre: **R8**.

## Tests

- [x] T9 — `tests/informe-render-it.test.ts`: snapshots IT y mixto con fixtures deterministas
  (secciones A1–A14 + circuitos ERP en el mixto); aserciones de R3 (7 páginas, sin cadenas
  prohibidas, CAB excluida), R5 (9 páginas, dos gauges, tablas separadas), R4 (tokens `--sys-*`,
  logos R2, `@media print`) y R9 (editabilidad por tipo de bloque). Cubre: **R3, R4, R5, R9, R11**.
- [x] T10 — Actualizar `tests/informe-render.test.ts` (solo `data-template="erp"`),
  `tests/informe-schemas.test.ts` (variantes de `reportClientDraftSchemaFor`),
  `tests/informe-prompt.test.ts` (bloques por tipo, versión nueva) y
  `tests/informe-pipeline.test.ts` (mixto sin dominio resoluble → `error`). Verificar `pnpm test`
  verde, `pnpm run check` limpio y `git diff e2e/` vacío. Cubre: **R2, R6, R7, R8, R11**.
