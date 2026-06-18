# Review — feature 30_informe_pdf_restyle

**Veredicto:** APPROVED

Revisión estricta e independiente (verificación reproducida, no se confió en el
reporte del implementer). Reviewer no editó código.

## Verificación reproducida (evidencia)

- `pnpm run check`: **0 ERRORS**, 31 warnings (todas `state_referenced_locally`
  en rutas ajenas a #30, PREEXISTENTES).
- `pnpm run build`: **OK** (adapter-node, built in ~3s).
- Suite informe + canónico
  (`informe-render`, `informe-render-it`, `informe-normas`, `informe-web-render`,
  `informe-invariantes`, `informe-logos-edit`, `informe-prompt`,
  `informe-pipeline`, `canonical-contract`): **95/95 verde**.
- Suite completa vía `./init.sh`: **904 passed | 2 skipped (906)** — esta corrida
  fue toda verde (la flakiness de `tests/audits-create.test.ts` no se manifestó).
- `./init.sh`: **[FAIL]** con un único motivo: §3 "Hay 2 features en in_progress
  (máximo 1)" (#12 parqueado + #30). Condición PREEXISTENTE y aceptada por la
  consigna; NO cuenta como rechazo de #30. Tests verdes.

## Puntos críticos verificados

1. **NO unificación (OQ1):** `git diff src/lib/informe/render.ts` y
   `render-mixto.ts` **vacíos** (despacho intacto). `render-erp/it/mixto-parts`
   conservan `<section class="page">` / `.informe-a4 .page` (snapshot ERP: 109
   `informe-a4`, 12 `class="page"`). Cambio = CSS/markup, no reescritura del modelo.
2. **Restyle visual web-v2:** snapshot PDF ERP contiene `score-row` (13),
   `class="bar"` con `width:N%`, `class="risk"` (4), `class="fix"` (3), timeline
   (`tl-h`/`tl-step`), `page dark cover`, `@page A4 portrait 14mm 16mm`,
   `break-inside:avoid` (8). Coherente con el contrato
   `ref_informe_a4_v2_plastipress.html`.
3. **Logos 100% CDN:** plantillas A4 sin `__LOGO_VERT__`/`__LOGO_COLOR__` ni
   `data:image/png;base64` (grep rc=1); 7 refs CDN por plantilla. Renders y
   snapshots: cero base64; `sys_vertical_w.png` (oscuro) / `sys_horizontal_b.png`
   (footer claro). Test `informe-logos-edit` lo afirma.
4. **Norma condicional:** `hayNorma(sec) = domain==='it' && standardRef.trim()
   .startsWith('CIS')` (exacto al spec). Sin rastro de `<th>Norma`, columna fija
   ni "Control interno" (grep rc=1 en `src/lib/informe`). Norma inline en `.detail`
   solo cuando hay CIS (PDF IT y web). Consistente PDF↔web.
5. **Invariante quick_wins/upsell:** `informe-invariantes.test.ts` prueba primero
   que el golden SÍ trae quick_wins/upsell, luego que NO aparecen en PDF ni web
   (no vacuo). Sin marcadores de propuesta (`ps-`, "Validez", "Inversión"). 6
   secciones (eyebrows 01–06) presentes.
6. **editMode/editor inline:** `report-render.svelte` sin cambios, sigue
   `renderInformeHtml(model,{editMode})`. doc/controles/madurez vía `field()`
   (contenteditable solo en editMode); score/gauge/norma con `data-canonical`,
   nunca `contenteditable`. Test lo afirma (R20b/R20c).
7. **Scoring intacto:** `git diff src/lib/server/scoring/` **vacío**.
   `canonical-contract.test.ts.snap` **sin cambios** (git diff vacío). Scores del
   snapshot PDF (30/45/72) inalterados.
8. **Snapshots:** web `+4/−3` líneas, **todas** norma/metodología (R13). PDF
   ERP/IT cambian a propósito (restyle), estructura de páginas preservada. Sin
   colaterales.

> Nota OQ3 (informativa, no objeción): el diff incluye, además, la fontanería de
> #25 ya presente en el árbol (`model.ts` standardRef; `generate-report.ts`
> prompt v2.2). Coherente con lo documentado en `progress/impl_30_*.md`.

## Trazabilidad
- R1: [x] `informe-render` (piezas web-v2; score-rows)
- R2: [x] `informe-render` (ERP 6 secciones + piezas)
- R3: [x] `informe-render-it` (IT estructura)
- R4: [x] `informe-render-it` + `informe-normas` (mixta)
- R5: [x] `informe-render` (@page A4 14/16mm + break-inside)
- R6: [x] cubierto por R5 + box model `.page` (border-box, overflow:hidden)
- R7: [x] `informe-render` (barra `width:N%`)
- R7b: [x] render.ts/render-mixto.ts sin diff; `.informe-a4 .page` preservado
- R8: [x] `informe-normas` (CIS/null/ERP)
- R9: [x] `informe-normas` (norma inline PDF + web)
- R10: [x] `informe-normas` (sin norma → nada)
- R11: [x] `informe-normas` (sin columna)
- R12: [x] `informe-normas` (sin `ERP B/E`)
- R13: [x] diff web snapshot solo norma + `informe-normas` web
- R14: [x] `informe-logos-edit`
- R15: [x] `informe-logos-edit` (vert/cover + footer color)
- R16: [x] `informe-logos-edit` (plantillas sin base64)
- R17: [x] `informe-render*` (eyebrows 01–06)
- R18: [x] `informe-invariantes` (quick_wins)
- R19: [x] `informe-invariantes` (upsell)
- R20: [x] `informe-invariantes` (propuesta)
- R20b: [x] `informe-logos-edit` (data-field + contenteditable)
- R20c: [x] `informe-logos-edit` (canónicos no editables)
- R21: [x] diff scoring vacío + canonical snap sin cambios + suite scoring
- R22: [x] `informe-render` + `informe-normas` (scores del canónico)

## Tasks
- T1–T20: [x] todas marcadas; verificadas contra el árbol (estructura, tests,
  plantillas, snapshots, check/build).

## Checkpoints
- C1: [x] arnés completo (init.sh corre; archivos base presentes)
- C2: [~] >1 in_progress (#12+#30) — PREEXISTENTE/aceptada, fuera de alcance #30
- C3: [x] sin queries raw nuevas, sin secretos, sin console.log de debug en #30
- C4: [x] tests cubren funciones públicas de `src/lib/informe`; suite verde
- C5: [x] sin archivos basura; specs/progress de #30 presentes
- C6: [x] SDD: specs completos, EARS, tasks [x], cada R↔test

## Cambios requeridos
Ninguno.

APPROVED -> progress/review_30_informe_pdf_restyle.md
