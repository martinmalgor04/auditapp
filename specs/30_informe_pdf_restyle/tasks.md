# Tasks — 30_informe_pdf_restyle

> Orden de implementación. Cada tarea referencia `R<n>` de `requirements.md`.
> No empezar hasta aprobación humana (spec_ready → in_progress). Verificación:
> `pnpm run check`, `pnpm test`, `./init.sh`. NO tocar `src/lib/server/scoring/`.
>
> **Decisiones de la puerta humana (2026-06-17) ya incorporadas:** NO unificar
> PDF↔web (restyle en sitio); mantener editor inline; construir sobre el árbol
> actual (incluye #25). No hay tarea de unificación.

## Fase 0 — Base / secuenciación

- [x] T1 — Confirmar que el árbol de trabajo incluye lo de #25 (columna Norma
  siempre en tabla IT, metodología IT, prompt v2.2, `tests/informe-normas.test.ts`).
  #30 se construye sobre ese árbol y reemplazará la regla de norma (OQ3). El
  implementer dejará documentado en `progress/impl_30_*.md` que el neto sobre
  `main` incluye #25. Cubre: alcance, OQ3.

## Fase 1 — Restyle de la hoja STYLE A4 (centro del cambio)

- [x] T2 — En `src/lib/informe/render-shared.ts`: reemplazar la hoja `STYLE` A4
  vieja (`.informe-a4 .page` + tabla) por el CSS del contrato
  `ref_informe_a4_v2_plastipress.html` adaptado al DOM paginado existente:
  `@page { size:A4 portrait; margin:14mm 16mm }` (R5), portada `.page` oscura
  `page-break-after:always`, páginas blancas, `break-inside:avoid` en
  card/risk/fix/score-row (R5, R6), piezas visuales web-v2 (portada oscura con
  gauge, `.score-row`+`.bar`, `.risk`, `.fix`, timeline, footer branded) (R1).
  **Excluir todo `.ps-*`.** NO unificar con `web-render.ts`. Cubre: R1, R5, R6, R7b.
- [x] T3 — En `render-shared.ts`: agregar/ajustar helpers de markup web-v2
  reutilizables por los renders PDF: barra estática
  `<div class="bar"><i style="width:N%"></i></div>` (R7), gauge print con
  `stroke-dashoffset` final directo + número fijo (R7), `.score-row`, `.risk`/`.fix`
  cards. Conservar tipos, `e`/`escapeHtml`, `LOGO_*`, `semaphore*`,
  `gaugeDasharray`, `field()`. NO eliminar renders. Cubre: R7.

## Fase 2 — Norma condicional (PDF + web consistente)

- [x] T4 — Implementar `hayNorma(sec)` en `render-shared.ts`
  (`domain==='it' && (standardRef??'').trim().startsWith('CIS')`). Cubre: R8, R12.
- [x] T5 — En `web-render.ts`: aplicar `hayNorma` en la línea `.detail` del
  score-row de hallazgos (norma inline solo si `hayNorma`; sin norma → nada). Sin
  ningún otro cambio visual/estructural; `web-render.ts` no se reescribe. Cubre:
  R8–R10, R13.

## Fase 3 — Restyle del markup de los renders PDF (NO reescribir)

- [x] T6 — `src/lib/informe/render-erp.ts`: conservar estructura `.informe-a4
  .page` y firma; ajustar el **markup mínimo** para emitir las piezas web-v2 que
  el nuevo `STYLE` espera — hallazgos como `.score-row` con `.bar i style="width:N%"`
  (en vez de filas de tabla, R7), riesgos en `.risk` cards, día a día en `.fix`
  cards, plan en timeline, portada/cierre con gauge y logos. Las 6 secciones se
  preservan (R17). Cubre: R2, R7, R17.
- [x] T7 — `src/lib/informe/render-it.ts`: idem restyle. Aplicar la norma inline
  en el `.detail` del score-row **solo si `hayNorma`**; **eliminar** la
  columna/celda "Norma" siempre-presente de #25 y cualquier resto de etiqueta
  'Control interno' (R10, R11). Si ninguna sección tiene norma → no se renderiza
  encabezado/columna "Norma" (R11, por construcción). Bloque metodología IT solo
  si hay contexto IT y ≥1 sección con norma. Cubre: R3, R8–R11, R17.
- [x] T8 — `src/lib/informe/render-mixto.ts` y `render-mixto-parts.ts`: idem
  restyle, combinando ERP+IT con sus piezas web-v2; norma condicional en la parte
  IT. Cubre: R4, R8–R11, R17.
- [x] T9 — Preservar el editor inline: confirmar que `render-erp/it/mixto`
  siguen propagando `editMode` y emitiendo `field()` (`data-field`/
  `contenteditable`) en los bloques del `client_draft`; los canónicos
  (score/gauge/norma) NUNCA editables. El restyle solo cambia clases/wrapper, no
  el contrato de edición. Verificar `report-render.svelte` y las rutas
  `.../imprimir` (app y público) sin cambio de API; el PDF no incluye Loom.
  Cubre: R20b, R20c.

## Fase 4 — Logos CDN

- [x] T10 — Reemplazar en `docs/plantillas/informe/template_informe_pdf_a4_v1.html`
  y `template_informe_pdf_a4_it_v1.html` los `data:image/png;base64,__LOGO_VERT__`
  → `…/LOGOS/sys_vertical_w.png` y `__LOGO_COLOR__` → `…/LOGOS/sys_horizontal_b.png`.
  Cubre: R16.
- [x] T11 — Confirmar en código que portada/cierre usan `LOGO_VERT_URL` y el
  footer claro usa `LOGO_COLOR_URL`; sin base64 en ningún render. Cubre: R14, R15.

## Fase 5 — Tests

- [x] T12 — Reescribir `tests/informe-render.test.ts` (PDF) a aserciones del nuevo
  formato, conservando las que validan la estructura de páginas: estructura
  `.informe-a4 .page` y existencia de `render-erp/it/mixto` (R7b), 6 secciones
  (R17), piezas web-v2 presentes (R1), `@page` A4 + print (R5), barras `width:N%`
  (R7), scores del canónico intactos (R22), logos CDN + sin base64 (R14/R15), sin
  `ERP B\d`/`ERP E\d` (R12). Mantener test ERP, IT y agregar mixta. Cubre: R1–R7b,
  R12, R14, R15, R17, R22.
- [x] T13 — Reescribir `tests/informe-normas.test.ts` para la **norma condicional**
  #30: con norma `CIS…` → aparece inline en `.detail` (PDF y web, R9); sin norma
  (IT sin `CIS`, o ERP) → NO aparece `data-canonical="norma"` ni "Control interno"
  ni separador (R10); auditoría sin ninguna norma → PDF sin encabezado/columna
  "Norma" (R11); sin `ERP B\d`/`ERP E\d` (R12). Reemplaza las aserciones de
  "columna Norma siempre / celda vacía" de #25. Cubre: R8–R12.
- [x] T14 — **Test invariante quick_wins/upsell/propuesta**
  (`tests/informe-invariantes.test.ts` nuevo o en `informe-render`): con fixture
  que tiene quick_wins y `upsell_findings`, el HTML de `renderInformeHtml` y
  `renderInformeWebHtml` NO contiene esos textos; tampoco marcadores de propuesta
  comercial (`ps-`, "Validez", "Inversión"). Cubre: R18, R19, R20.
- [x] T15 — **Test logos CDN** sobre las plantillas A4 (lectura de archivo):
  `template_informe_pdf_a4*.html` no contienen `__LOGO_VERT__`/`__LOGO_COLOR__`
  ni `data:image/png;base64`; sí las URLs CDN. Cubre: R16.
- [x] T16 — **Test editor inline** sobre el markup restilado: `editMode` →
  bloques del draft con `data-field …contenteditable`; canónicos
  (score/gauge/norma) sin contenteditable. Porta el test R30 de #14. Cubre:
  R20b, R20c.
- [x] T17 — No-regresión scoring: confirmar que la suite de `scoring/` sigue verde
  y que ningún archivo de `src/lib/server/scoring/` cambió; scores del PDF/web
  por sección == canónico. Cubre: R21, R22.

## Fase 6 — Snapshots y cierre de verificación

- [x] T18 — Verificar que `canonical-contract.test.ts.snap` NO cambia. Si cambia,
  detener (regresión). Cubre: R21.
- [x] T19 — Tras T12–T17 verdes (aserciones explícitas), regenerar
  conscientemente los snapshots PDF (`informe-render`, `informe-render-it`) y el
  web (`informe-web-render`). Revisar el diff: PDF = misma estructura de páginas
  con piezas web-v2; web = SOLO norma condicional (sin "próximos pasos" ni otras
  secciones nuevas). Cubre: R1–R13, R17.
- [x] T20 — `pnpm run check` 0 errores, `pnpm run build` OK, `pnpm test` verde,
  `./init.sh` verde. Documentar trazabilidad R↔test y el neto sobre `main`
  (incluye #25) en `progress/impl_30_informe_pdf_restyle.md`. Cubre: verificación
  final.

## Notas

- **No hay tarea de unificación** (OQ1 → NO unificar). `web-render.ts` solo cambia
  por la norma condicional; `render-erp/it/mixto` se restilan, no se eliminan.
- El **puente informe↔presupuesto** (#16) queda anotado como futuro en
  `design.md` §11 y `requirements.md` — **no** es tarea de #30.
