# Review — feature #31 (31_descarga_html_informe)

**Veredicto:** APPROVED

## Trazabilidad R ↔ test
- R1: [x] `report-html-download.test.ts` (handler GET existe en `…/html/+server.ts`)
- R2: [x] `report-html-download.test.ts` (cuerpo === renderInformeHtml(buildInformeRenderModel(report, timestamps)))
- R3: [x] `report-html-download.test.ts` (byte a byte, con/sin visita)
- R4: [x] `report-html-download.test.ts` (contiene `r2.dev/LOGOS/`, sin `data:image`)
- R5: [x] `report-html-download.test.ts` (Content-Type text/html; charset=utf-8)
- R6: [x] `report-html-download.test.ts` (Content-Disposition attachment; filename=)
- R7: [x] `informe-download-name.test.ts` + `report-html-download.test.ts` (slug, tipos it/erp/mixta, solo [a-z0-9._-])
- R8: [x] `report-html-download.test.ts` (200)
- R9: [x] `report-html-download.test.ts` (sin sesión → 401)
- R10: [x] `report-html-download.test.ts` (no asignado / no aprobado → 403; aprobado → 200)
- R11: [x] revisión (solo `/api/audits/...`; share intacto)
- R12: [x] `report-html-download.test.ts` (audit inexistente → 404)
- R13: [x] `report-html-download.test.ts` (versión inválida/inexistente → 404)
- R14: [x] `report-html-download.test.ts` (sin client_draft → 409 envelope)
- R15: [x] `+page.svelte` botón `data-testid="descargar-html"`
- R16: [x] `+page.svelte` envuelto en `{#if model}`
- R17: [x] revisión `git status` — render/scoring/share sin tocar
- R18: [x] `report-html-download.test.ts` (visita presente con timestamps)
- R19: [x] `+page.server.ts` pasa timestamps; test de igualdad panel↔descarga
- R20: [x] `report-html-download.test.ts` (sin finished_at, sin visita, mismo HTML)

## Tasks
- T1–T9, T11–T13: [x] (verificadas en código)
- T10: [ ] — cierre/trazabilidad. Mapa R↔test SÍ existe (en este review y en tests),
  e init.sh/check verificados por reviewer. No bloquea (es la tarea de cierre que
  ejecuta el reviewer).

## Checkpoints
- C1: [x]  C2: [~] (ver nota) C3: [x]  C4: [x]  C5: [~] (untracked, sin commitear)  C6: [x]

## Notas
- C2: hay DOS features in_progress (#31 y #32) por el desvío de alcance del implementer.
  Decisión humana de quedarse con ambas. No es defecto de código de #31.
- Hallazgo menor (no bloquea): el endpoint de descarga `…/html/+server.ts` pasa al
  guard solo `assignedTechId` (no `assignedTechIds`). El panel y la vista de impresión
  (tocados por #32) sí pasan el set por asignación. Resultado: un técnico asignado por
  área (no líder) puede ver el panel/imprimir pero recibiría 403 en la descarga HTML.
  Fail-closed (no es agujero de seguridad). Recomendado alinear pasando
  `listAuditAssignments` también acá. Aceptable diferir.

APPROVED -> progress/review_31_descarga_html_informe.md
