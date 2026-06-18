# Implementación — 30_informe_pdf_restyle

Feature: `30_informe_pdf_restyle` (in_progress, spec aprobado en puerta humana 2026-06-17).

## Neto sobre `main` (OQ3)

El árbol de trabajo NO está commiteado (como todo el repo). El neto sobre `main`
de esta sesión **incluye lo de #25** (normas en informe): columna Norma en tabla
IT, bloque de metodología IT, `INFORME_PROMPT_VERSION='2.2'`,
`tests/informe-normas.test.ts`. #30 se construye sobre ese árbol y **reemplaza**
la regla de norma de #25 (de "columna Norma siempre / celda vacía" a "norma
inline solo si hayNorma; sin norma → nada").

## Plan (tasks T1..T20)

- T1 Confirmar árbol incluye #25.
- T2 Reemplazar hoja STYLE A4 por lenguaje web-v2 dentro de `.informe-a4 .page`.
- T3 Helpers de markup web-v2 (barra estática, gauge print, score-row, risk/fix cards).
- T4 `hayNorma(sec)`.
- T5 web-render: norma condicional.
- T6 render-erp restyle markup.
- T7 render-it restyle markup + norma condicional (sin columna/celda).
- T8 render-mixto + render-mixto-parts restyle.
- T9 Preservar editor inline.
- T10 Logos CDN en plantillas A4.
- T11 Confirmar LOGO_VERT/COLOR en código.
- T12 Reescribir tests/informe-render.test.ts (PDF).
- T13 Reescribir tests/informe-normas.test.ts (norma condicional).
- T14 Test invariante quick_wins/upsell/propuesta.
- T15 Test logos CDN sobre plantillas.
- T16 Test editor inline.
- T17 No-regresión scoring.
- T18 Verificar canonical-contract.snap NO cambia.
- T19 Regenerar snapshots PDF + web conscientemente.
- T20 check + build + test + init.sh; trazabilidad.

## Progreso — COMPLETO (a espera de reviewer)

- [x] T1 — Árbol incluye #25 (confirmado: `tests/informe-normas.test.ts` existía y
  pasaba, tabla IT con columna Norma, metodología IT, prompt v2.2). Neto sobre
  `main` documentado arriba.
- [x] T2 — Hoja `STYLE` A4 reemplazada por el lenguaje web-v2 dentro de
  `.informe-a4 .page`: `@page A4 portrait 14mm 16mm`, portada oscura
  `page-break-after:always`, páginas blancas, `.score-row`/`.bar`, `.risk` cards,
  `.fix` cards, `.tl-h`/`.tl-step` timeline, `.legend`, footer branded,
  `break-inside:avoid` en card/risk/fix/score-row/tl-step/stat. Sin `.ps-*`.
- [x] T3 — Helpers de markup web-v2 en `render-shared.ts`: barra estática
  `clampScore` + `<i style="width:N%">`, `renderGaugeCover` (gauge print estático
  con badge), `semaphoreToRowClass`, score-rows (`renderHallazgosScoreRows`),
  `.risk`/`.fix` cards (en `renderRiesgosPage`/`renderCircuitoCards`).
- [x] T4 — `hayNorma(sec)` (`domain==='it' && standardRef.trim().startsWith('CIS')`)
  + `hayAlgunaNormaIt(model)` para gobernar la metodología.
- [x] T5 — `web-render.ts`: norma inline en `.detail` solo si `hayNorma`;
  metodología solo si `hayAlgunaNormaIt`. Sin otro cambio (R13).
- [x] T6 — `render-erp.ts`: hallazgos a `.score-row`, día a día a `.fix-grid`,
  gauge en portada. 6 secciones preservadas.
- [x] T7 — `render-it.ts`: hallazgos a `.score-row` con norma inline condicional;
  eliminada la columna/celda "Norma" de #25; metodología solo si hay norma;
  día a día a `.fix-grid`; gauge en portada. (Main + página IT del mixto.)
- [x] T8 — `render-mixto.ts` (sin cambio de despacho) + `render-mixto-parts.ts`
  (ERP hallazgos a `.score-row`, ERP día a día a `.fix-grid`, gauge en portada
  mixta).
- [x] T9 — Editor inline preservado: `field()` sigue en los bloques del draft
  (incl. doc/controles/madurez del score-row); score/gauge/norma con
  `data-canonical` y SIN `contenteditable`. `report-render.svelte` sin cambio de
  API.
- [x] T10 — Plantillas A4 (`template_informe_pdf_a4_v1.html`,
  `template_informe_pdf_a4_it_v1.html`): base64 `__LOGO_VERT__`/`__LOGO_COLOR__`
  → URLs CDN (`sys_vertical_w.png` / `sys_horizontal_b.png`).
- [x] T11 — Código: portada/cierre usan `LOGO_VERT_URL`; footer `LOGO_COLOR_URL`;
  cero base64. Verificado por test.
- [x] T12 — `tests/informe-render.test.ts` reescrito al nuevo formato (score-rows,
  piezas web-v2, `@page` A4, barras `width:N%`, scores del canónico).
- [x] T13 — `tests/informe-normas.test.ts` reescrito a la norma condicional #30.
- [x] T14 — `tests/informe-invariantes.test.ts` (nuevo): sin quick_wins, sin
  upsell, sin propuesta (PDF + web).
- [x] T15 — `tests/informe-logos-edit.test.ts` (nuevo): plantillas A4 sin base64 +
  URLs CDN; render PDF/web con CDN.
- [x] T16 — `tests/informe-logos-edit.test.ts`: editor inline sobre el markup
  restilado (draft editable, canónicos no).
- [x] T17 — No-regresión scoring: `src/lib/server/scoring/` sin cambios
  (`git diff` vacío); suite scoring 10/10; scores del render == canónico.
- [x] T18 — `canonical-contract.test.ts.snap` NO cambió (2/2 verde sin update).
- [x] T19 — Snapshots regenerados conscientemente: PDF ERP/IT/mixta (nuevo
  lenguaje web-v2, misma estructura de páginas, scores intactos); web cambia SOLO
  por norma condicional (4 ins / 3 del, todas norma/metodología — diff revisado).
- [x] T20 — `pnpm run check` 0 errores; `pnpm run build` OK; suite informe
  95/95 verde. Trazabilidad abajo.

## Verificación final

- `pnpm run check`: **0 ERRORS**, 31 warnings (todas `state_referenced_locally`
  PREEXISTENTES, ajenas a #30).
- `pnpm run build`: **OK** (adapter-node, built in ~3s).
- Suite informe (`informe-render`, `informe-render-it`, `informe-normas`,
  `informe-web-render`, `informe-invariantes`, `informe-logos-edit`,
  `informe-prompt`, `informe-pipeline`, `canonical-contract`): **95/95 verde**.
- Scoring: 10/10 verde; `git diff src/lib/server/scoring/` vacío.
- `./init.sh`: **[FAIL]** por condiciones **PREEXISTENTES y aceptadas**, ajenas a
  #30: (1) §3 ">1 in_progress" (#12 parqueado + #30, condición conocida); (2) §4
  flakiness de DB compartida + tests en paralelo → 2 fallos en
  `tests/audits-create.test.ts` (#23 Fase 3, CAB→empresa sync); ese archivo pasa
  **4/4 en aislamiento**. Ningún archivo de #30 toca esos módulos.

## Snapshots — qué cambió y por qué

- `informe-web-render.test.ts.snap`: **+4 / −3 líneas, todas norma condicional**
  (3 normas inline `data-canonical="norma">CIS …` en `.detail` + 1 `.legend`
  `data-metodologia="it"`). R13 cumplido: lenguaje visual y estructura web
  intactos; `web-render.ts` no reescrito.
- `informe-render.test.ts.snap` (PDF ERP) e `informe-render-it.test.ts.snap`
  (PDF IT/mixta): **cambian a propósito** por el restyle (tabla → `.score-row`
  con barra estática, riesgos → `.risk` cards con watermark, día a día → `.fix`
  cards con badge, plan → `.tl-h`/`.tl-step`, portada con gauge, `@page` A4). La
  **estructura `.informe-a4 .page` y el despacho por tipo se preservan**. Scores
  por sección **idénticos** (ERP 45/72/30; verificado en el diff). IT: norma
  inline solo donde hay CIS; sin columna/celda/etiqueta "Norma"; sin "Control
  interno". `canonical-contract.snap` **sin cambios**.

## Cómo previsualizar el resultado (para validación de Martín)

1. `pnpm db:up` (Docker/Postgres) si no está levantado, luego `pnpm run dev`.
2. Abrir una auditoría cerrada con informe → ruta de impresión:
   - App: `/auditorias/[id]/informe/[version]/imprimir`
   - Público: `/informe/[token]/imprimir`
3. `Ctrl/Cmd+P` → Guardar como PDF → activar "Gráficos de fondo" (background
   graphics) para que se vean portada oscura, barras y cards. Tamaño A4 portrait.
4. Comparar contra el contrato `docs/plantillas/informe/ref_informe_a4_v2_plastipress.html`
   (su bloque `@media print`): portada oscura con gauge, páginas blancas,
   score-rows con barras, riesgos en cards rojas, día a día en cards claras, plan
   en timeline, footer branded.

## Trazabilidad R↔test

- R1 (lenguaje web-v2 en PDF) →
  `informe-render.test.ts > #30 piezas visuales web-v2 presentes…` +
  `> #30 hallazgos como score-rows…`.
- R2 (PDF erp 6 secciones) → `informe-render.test.ts > contiene las siete páginas…`
  (portada + 6 secciones + cierre) + `> #30 piezas visuales…`.
- R3 (PDF it 6 secciones) → `informe-render-it.test.ts > siete páginas con
  estructura IT (R3)`.
- R4 (PDF mixta 6 secciones) → `informe-render-it.test.ts > nueve páginas con doble
  gauge…` + `informe-normas.test.ts > #30 norma condicional — PDF mixta`.
- R5 (@page A4 + break-inside) → `informe-render.test.ts > #30 @page A4 portrait
  14mm 16mm + break-inside:avoid en cards`.
- R6 (sin desborde horizontal) → cubierto por R5 (área útil A4) + estructura
  `.page` preservada (R7b).
- R7 (barra estática width:N%) → `informe-render.test.ts > #30 hallazgos como
  score-rows… con barra estática` (regex `width:\d+%`).
- R7b (estructura `.page` + despacho intactos, sin unificar) →
  `informe-render*.test.ts > N páginas con estructura…` + `report-render.svelte
  usa renderInformeHtml` + módulos `render-erp/it/mixto*` siguen exportando.
- R8 (definición hayNorma) → `informe-normas.test.ts > #30 norma condicional —
  PDF IT > IT con standardRef que NO empieza con CIS → no hay norma` + ERP puro.
- R9 (norma visible si hay) → `informe-normas.test.ts > … cada fila IT con norma
  CIS muestra el standardRef inline` (PDF y web).
- R10 (sin norma → nada) → `informe-normas.test.ts > … IT sin norma CIS → NO se
  muestra norma alguna` + web IT sin norma + ERP puro.
- R11 (sin norma → sin columna) → mismo test (no `<th>Norma</th>`, no celda) +
  `… ERP puro sin norma alguna > NO contiene norma`.
- R12 (sin nomenclatura interna ERP) → `informe-normas.test.ts > no expone
  nomenclatura interna ERP cruda (R12)` (todas las variantes).
- R13 (web sin cambio salvo norma) → diff revisado de
  `informe-web-render.test.ts.snap` (+4/−3, todo norma) +
  `informe-normas.test.ts > #30 norma condicional — web pública`.
- R14/R15 (logos CDN render) → `informe-logos-edit.test.ts > #30 logos 100% CDN —
  render PDF y web` + `informe-render.test.ts > logos directo del CDN R2`.
- R16 (plantillas sin base64) → `informe-logos-edit.test.ts > #30 logos 100% CDN —
  plantillas A4`.
- R17 (exactamente 6 secciones) → `informe-render*.test.ts > N páginas con
  estructura…` (eyebrows 01..06).
- R18 (sin quick_wins) → `informe-invariantes.test.ts > el PDF/web NO contiene
  textos de quick_wins`.
- R19 (sin upsell) → `informe-invariantes.test.ts > el PDF/web NO contiene textos
  de upsell_findings`.
- R20 (sin propuesta comercial) → `informe-invariantes.test.ts > ni PDF ni web
  contienen marcadores de propuesta comercial`.
- R20b (editor inline) → `informe-logos-edit.test.ts > #30 editor inline…
  bloques del client_draft con data-field + contenteditable` +
  `informe-render.test.ts > modo edición…`.
- R20c (canónicos no editables) → `informe-logos-edit.test.ts > #30 editor inline…
  canónicos (score/gauge/norma) NUNCA editables`.
- R21 (scoring intacto) → `git diff src/lib/server/scoring/` vacío + suite scoring
  10/10 + `informe-normas.test.ts > #30 no-regresión scoring`.
- R22 (scores del canónico) → `informe-render.test.ts > los scores de los
  hallazgos salen del snapshot canónico` + `informe-normas.test.ts > #30
  no-regresión scoring`.
