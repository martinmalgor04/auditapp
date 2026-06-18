# Design — 30_informe_pdf_restyle

> Cómo se **restila** el PDF A4 (sin reescribir sus renders ni unificarlo con el
> web) para que use el lenguaje visual del web-v2, cómo se hace la norma
> condicional consistente en PDF y web, y cómo se aplican los logos CDN. No toca
> el motor de scoring. Decisiones de la puerta humana (OQ1/OQ2/OQ3, 2026-06-17)
> incorporadas; ver requirements.md.

## 1. Estado actual verificado (cadena de render)

```
AuditReportRow
  → buildInformeRenderModel (server/informe/model.ts)
       secciones[].standardRef = section.standard_ref ?? null   ✅ ya viaja
  → InformeRenderModel (render-shared.ts)
  ├─ renderInformeHtml  (render.ts → render-erp/it/mixto + mixto-parts)   ← PDF A4 (modelo .page)
  │     consumido por report-render.svelte + rutas …/imprimir (window.print)
  └─ renderInformeWebHtml (web-render.ts)                                 ← web-v2 (modelo .score-row)
        consumido por report-web-render.svelte
```

- **PDF actual** = modelo `.informe-a4 .page` (210×297mm fijas, `footer('NN')`
  hardcodeado, tabla de hallazgos `<table>`). Logos ya por CDN
  (`LOGO_VERT_URL`/`LOGO_COLOR_URL` en `render-shared.ts`).
- **Web actual** = modelo `.informe-web` con `.hero` + gauge SVG, `.score-row` +
  `.bar i[data-w]`, `.risk`, `.fix`, `.tl-step`, `.callout`. Animado por
  `web-effects.ts` (gauge dashoffset, contadores, barras por IntersectionObserver).
- **#25 ya en el árbol actual (en `done`, sin commitear como todo el repo):**
  columna "Norma" **siempre** en tabla IT (celda vacía cuando falta), bloque
  `data-metodologia="it"`, `renderMetodologiaBlock`, `INFORME_PROMPT_VERSION='2.2'`,
  `tests/informe-normas.test.ts`. #30 se construye **sobre** este árbol y
  **reemplaza** la regla de norma (OQ3; ver §5). El implementer documenta que el
  neto sobre `main` incluye lo de #25.
- **Contrato de referencia** `ref_informe_a4_v2_plastipress.html`: confirmado que
  su `@media print` reusa las clases del web-v2 y agrega `@page A4 portrait
  14mm 16mm`, portada `section.hero` oscura con `page-break-after:always`,
  páginas `section.wrap:not(.hero)` blancas, `.bar i[data-w]` con anchos
  hardcodeados, `break-inside:avoid` en cards/riesgos/fix/score-row, `footer`
  con `page-break-after`. El bloque `.ps-*` (propuestas) **no pertenece** al
  informe.

## 2. Estrategia central: restyle en sitio (NO unificar) — puerta humana 2026-06-17

> Decisión de la puerta humana (OQ1 → **NO unificar**). Se descarta emitir un
> HTML común para PDF y web. El PDF A4 **conserva** su estructura paginada
> (`.informe-a4 .page`, despacho `render-erp/it/mixto/mixto-parts`) y se le
> cambian **solo los estilos** (la hoja `STYLE` de `render-shared.ts`) más el
> **markup mínimo** necesario para las piezas visuales web-v2. `web-render.ts`
> **no se reescribe** (único cambio: norma condicional).

### 2.1 Forma del cambio

El centro del cambio es la **hoja `STYLE` A4** que vive en `render-shared.ts`
(la que hoy produce el look `.informe-a4 .page` con tabla `<table>`). Se reemplaza
su contenido por el CSS del contrato `ref_informe_a4_v2_plastipress.html` adaptado
al DOM paginado existente:

- `@page { size: A4 portrait; margin: 14mm 16mm }`, portada `.page` oscura con
  `page-break-after:always`, páginas `.page` blancas (R5, R6).
- Piezas visuales web-v2: `.hero`/portada oscura + gauge, `.score-row` con
  `.bar i`, `.risk` cards con borde rojo, `.fix` cards claras, timeline del plan,
  footer branded (R1).
- `break-inside:avoid` en cards/riesgos/fix/score-row (R5).

El **markup** de `render-erp/it/mixto/mixto-parts` se ajusta lo mínimo para que
las clases que el nuevo `STYLE` espera estén presentes: p. ej. donde hoy se emite
la tabla `<table>` de hallazgos se emiten `.score-row` con `.bar i style="width:N%"`
(R7); donde hoy hay listas de riesgos se emiten `.risk` cards; etc. **No** se
reescriben esos módulos ni se eliminan: conservan su firma, su despacho por tipo
y su estructura de páginas (`.informe-a4 .page`, R7b). El despacho
`render.ts → render-erp/it/mixto` se mantiene.

### 2.2 Barras y gauge estáticos en print (R7)

El PDF se imprime vía `window.print()` sin JS de animación. Por eso:

- **Barra score-row:** `<div class="bar"><i style="width:${score}%"></i></div>`
  con ancho **inline estático** derivado del score canónico (R7). No depende de
  `data-w` + JS (eso es del camino web).
- **Gauge:** `stroke-dashoffset` final calculado directo
  (`webGaugeDashoffset(valor)` o el helper de gauge ya existente del A4) y el
  número del centro fijo = `valor`. Color/badge por `semaforo`.

### 2.3 Por qué NO unificar (alternativa descartada en la puerta)

La propuesta del borrador era unificar PDF + web en un `renderInformeBody(model,
{medium})` con dos hojas de estilo. La puerta humana la **descartó** a favor de
restilar en sitio, porque:

- **Menor churn / menor riesgo.** Restilar dentro de la estructura existente
  preserva el despacho por tipo y el modelo de páginas ya probado; no reescribe
  `render-erp/it/mixto` ni reorganiza `web-render.ts`. El diff queda acotado a
  CSS + markup puntual.
- **El editor inline ya vive en el render A4 actual** (R30 de #14): mantenerlo es
  trivial si no se mueve el DOM (OQ2). Unificar habría obligado a portar `editMode`
  a un cuerpo nuevo.
- **El web-v2 aprobado queda intocado** salvo la norma condicional, eliminando el
  riesgo de regresión visual en la entrega pública #15.

Costo asumido: aun sin unificar, los snapshots PDF ERP/IT **cambian a propósito**
por el nuevo CSS/markup; la estructura de páginas se preserva, por lo que el churn
es menor que en la unificación (§7).

## 3. Archivos a tocar (cambios exactos)

> Reflejo de la puerta humana (OQ1 → NO unificar). El centro del cambio es la hoja
> `STYLE` de `render-shared.ts` + markup acotado en `render-erp/it/mixto`. NO se
> crea `render-shared-web.ts`; NO se elimina ningún render; `web-render.ts` solo
> cambia por la norma condicional.

| Archivo | Cambio |
|---|---|
| `src/lib/informe/render-shared.ts` | **Centro del restyle.** Reemplazar la hoja `STYLE` A4 vieja (`.informe-a4 .page` + tabla) por el CSS del contrato `ref_informe_a4_v2_plastipress.html` adaptado al DOM paginado: `@page A4 portrait 14mm 16mm` (R5), portada `.page` oscura `page-break-after:always`, páginas blancas, piezas web-v2 (`.hero`/gauge, `.score-row`+`.bar`, `.risk`, `.fix`, timeline, footer branded), `break-inside:avoid` (R1, R5, R6). Agregar/ajustar helpers de markup web-v2 reutilizados por los renders: barra estática `style="width:N%"` (R7), gauge print estático (R7), `.score-row`, `.risk`/`.fix` cards. Agregar `hayNorma(sec)` (R8). Conservar tipos, `e`/`escapeHtml`, `LOGO_VERT_URL`, `LOGO_COLOR_URL`, `semaphore*`, `gaugeDasharray`, `field()`. NO eliminar los renders. |
| `src/lib/informe/render.ts` | **Sin cambio de despacho.** Sigue conmutando por `tipoAuditoria` hacia `render-erp/it/mixto` y conservando re-exports (R7b). Solo ajustes si hace falta para inyectar la nueva `STYLE`. |
| `src/lib/informe/render-erp.ts` | **Restilar, NO reescribir.** Conserva su estructura `.informe-a4 .page` y su firma; se ajusta el **markup mínimo** para emitir las piezas web-v2 que el nuevo `STYLE` espera (score-rows con `.bar i style="width:N%"` en vez de filas de tabla, riesgos en `.risk` cards, día a día en `.fix` cards, plan en timeline, portada/cierre con gauge). Norma condicional inline en el `.detail` del score-row (R9/R10). Cubre R2. |
| `src/lib/informe/render-it.ts` | **Restilar, NO reescribir.** Idem ERP. Aquí vive el contexto IT: norma inline solo si `hayNorma` (R8–R11); se **elimina** la columna/celda "Norma" siempre-presente heredada de #25 y cualquier resto de etiqueta 'Control interno' (R10, R11). Bloque metodología IT solo si hay ≥1 sección con norma. Cubre R3. |
| `src/lib/informe/render-mixto.ts` | **Restilar, NO reescribir.** Idem, combinando ERP+IT con sus piezas web-v2. Cubre R4. |
| `src/lib/informe/render-mixto-parts.ts` | **Restilar, NO reescribir.** Ajuste de markup de las partes compartidas del mixto a las piezas web-v2. Cubre R4. |
| `src/lib/informe/web-render.ts` | **Solo norma condicional.** Aplicar `hayNorma` en la línea `.detail` del score-row de hallazgos (R8–R10). Sin ningún otro cambio visual/estructural (R13). |
| `src/lib/components/informe/report-render.svelte` | Sin cambio de API: sigue llamando `renderInformeHtml(model,{editMode})`. El editor inline ya vive en el render A4 actual; verificar que el restyle no lo rompa (R20b). |
| `docs/plantillas/informe/template_informe_pdf_a4_v1.html` | Reemplazar `data:image/png;base64,__LOGO_VERT__` → `…/LOGOS/sys_vertical_w.png` y `__LOGO_COLOR__` → `…/LOGOS/sys_horizontal_b.png` (R16). Es doc de referencia, no se ejecuta. |
| `docs/plantillas/informe/template_informe_pdf_a4_it_v1.html` | Idem logos CDN (R16). |
| `src/lib/server/scoring/**` | **Sin cambios** (R21). |
| `src/lib/server/informe/prompts/generate-report.ts` | **Sin cambios funcionales.** `INFORME_PROMPT_VERSION` ya es `2.2` (heredado de #25). #30 no cambia el prompt. |
| `seed/templates/*.json`, `migrations/` | **Sin cambios.** |

## 4. Mapeo del modelo a las piezas visuales (PDF restilado)

Los renders PDF (`render-erp/it/mixto`) consumen el mismo `InformeRenderModel` que
hoy; lo que cambia es a qué pieza visual se mapea cada sección. Mapeo objetivo
(las mismas piezas que el web-v2, pero emitidas dentro de la estructura
`.informe-a4 .page`):

| Sección del informe | Fuente en `model.draft` / `model` | Pieza visual |
|---|---|---|
| Portada / Hero | `cliente`, `periodo`, `tipoAuditoria`, `sistema`, `indices` | `section.hero` oscura + logo vertical blanco + gauge SVG (`indices.erp ?? indices.it`) |
| 01 Resumen ejecutivo | `resumen.{diagnostico,lead,interpretacion,recomendacion_central,fortalezas,circuitos_con_controles}`, `modulos` | `.card` ×3 (índice, circuitos con controles, módulos) + `callout-green` para fortalezas |
| 02 Hallazgos | `hallazgos.circuitos[]` (join con `secciones[]` por `seccion_code`), `hallazgos.lectura_transversal[]` | `.score-row` por circuito (name + detail + `.bar` + `.score-val`), `.legend` por lectura transversal, **norma condicional** en `.detail` (R9) |
| 03 Riesgos priorizados | `riesgos.{intro,items[]}` | `.risk` cards con borde rojo + watermark numérico |
| 04 Qué cambia en el día a día | `dia_a_dia.{intro,circuitos[],callout_transversal}` | `.fix` cards claras + badge `hoy N/100` + `callout` |
| 05 El plan | `plan.{titulo,descripcion,etapas[],necesitamos_cliente[],no_incluye[]}` | `.tl-h` timeline + `.twocol` |
| 06 Próximos pasos / cierre | `proximos_pasos[]` (web actual usa CTA) | sección de cierre branded (logo + firma + contacto); se incluyen los `proximos_pasos` como pasos numerados |

> **"Próximos pasos" (sin cambio de alcance en web):** como NO se unifica, cada
> render mantiene su contenido actual. El **PDF** ya lista `proximos_pasos`
> (página "06 · Próximos pasos") → se conserva, ahora con look web-v2 (R17). La
> **web** sigue como hoy (su cierre actual); NO gana ninguna sección nueva — su
> único cambio admisible es la norma condicional (R13). No hay cambio de snapshot
> web por "próximos pasos".

### 4.1 Gauge (cálculo, R7)

- Valor = `indices.erp ?? indices.it` (igual que hoy).
- print (PDF): `stroke-dashoffset` = `webGaugeDashoffset(valor)` (o el helper de
  gauge ya existente del A4) calculado **directo** (sin JS), el número del centro
  = `valor` fijo. Color/badge por `semaforo`. El contrato muestra el patrón
  (`#gaugeArc { stroke-dashoffset: 206.15 !important }`).
- web: sin cambio respecto de hoy (gauge animado por `web-effects.ts`).

### 4.2 Barras de score-row (R7)

- print (PDF): `<div class="bar"><i style="width:${score}%"></i></div>`. El ancho
  inline garantiza el llenado en el PDF sin depender de JS (el PDF se imprime con
  `window.print()`, sin animación). El score sale del canónico (R22).
- web: sin cambio respecto de hoy (`<i data-w="${score}">` + JS).
- Color de la barra por clase de fila (`.r/.o/.g`) según semáforo, igual que el
  web-v2.

## 5. Norma condicional (R8–R13) — consistente PDF + web

Helper único en `render-shared.ts` (reusado por el PDF —`render-it/mixto`— y por
`web-render.ts`):

```ts
export function hayNorma(sec: InformeRenderModel['secciones'][number]): boolean {
  return sec.domain === 'it' && (sec.standardRef ?? '').trim().startsWith('CIS');
}
```

**Dónde va la norma:** en la **línea `.detail` del score-row** (no en columna ni
celda aparte). Al restilar los hallazgos del PDF a `.score-row` (como el web-v2),
la tabla `<table>` con columna "Norma" de #25 desaparece; el `.detail` concatena
Doc · Controles · Madurez y la norma se agrega ahí (cuando existe). Esto evita una
columna vacía cuando no hay norma (R10; R11 por construcción: ya no hay "columna"
que ocultar) y deja la norma **idéntica en PDF y web** (R9, R13). El web-render
actual ya hace exactamente esto (`web-render.ts:297-300`):
`norma ? ' · <span data-canonical="norma">…</span>'`; en el PDF se aplica el mismo
patrón dentro de `render-it/mixto`.

```ts
// en el render de cada circuito de hallazgos (PDF: render-it/mixto; web: web-render):
const sec = sectionByCode.get(c.seccion_code);
const normaPiece = sec && hayNorma(sec)
  ? ` · <span data-canonical="norma">${e(sec.standardRef!.trim())}</span>`
  : '';                          // sin norma → NADA (R10)
const detail = `${e(c.doc)} · ${e(c.controles)} · ${e(c.madurez)}${normaPiece}`;
```

**Cambio respecto de #25:**
- #25 (heredado): IT siempre mostraba columna "Norma" en tabla PDF, con celda
  **vacía** `<td data-canonical="norma"></td>` si faltaba; y en web mostraba la
  norma solo si `standardRef` truthy.
- #30: **no hay columna ni celda**; la norma es una pieza inline del `.detail`
  que aparece **solo** cuando `hayNorma` (R8). IT sin `CIS` válido → no aparece
  norma (ni vacía). Consecuencia directa de pasar el PDF al modelo web-v2.
- Etiqueta "Control interno": ya no existe (eliminada en #25); #30 lo mantiene
  eliminado (R10).

**Bloque de metodología IT** (`data-metodologia="it"`, heredado de #25): se
conserva como `.legend` adicional al pie de hallazgos **solo cuando hay contexto
IT** (`tipoAuditoria` `it`|`mixta`) y **al menos una** sección con norma. Si
ninguna sección tiene norma, no se muestra metodología (coherente con R10/R11).
Se mantiene texto sin jerga prohibida (CIS Controls v8 + NIST CSF + ciclos de
vida HPE/Lenovo/Dell).

## 6. Logos CDN (R14–R16)

- **Código (PDF + web):** ya usan `LOGO_VERT_URL` (portada/cierre, fondo oscuro)
  y `LOGO_COLOR_URL` (footer, fondo claro) de `render-shared.ts`. El restyle los
  reusa: portada/hero y cierre → `LOGO_VERT_URL`; footer de página clara →
  `LOGO_COLOR_URL` (R15). Nada de base64 (R16).
- **Plantillas A4 (`docs/plantillas/informe/*.html`):** doc de referencia, no se
  ejecutan, pero el acceptance pide quitar el base64. Reemplazo textual:
  - `data:image/png;base64,__LOGO_VERT__` →
    `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png`
  - `data:image/png;base64,__LOGO_COLOR__` →
    `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_horizontal_b.png`
- Test (R14): el HTML de `renderInformeHtml` y `renderInformeWebHtml` contiene
  ambas URLs y **no** contiene `data:image/png;base64` ni `__LOGO_`. Test sobre
  los `.html` de plantilla (lectura de archivo) para R16.

## 7. Snapshots — estrategia (R13, R21, R22)

Snapshots existentes:
`tests/__snapshots__/informe-render.test.ts.snap` (PDF ERP),
`informe-render-it.test.ts.snap` (PDF IT),
`informe-web-render.test.ts.snap` (web),
`tests/__snapshots__/canonical-contract.test.ts.snap` (canónico).

- **`canonical-contract.test.ts.snap`: NO debe cambiar.** #30 no toca
  `build.ts`/`schema.ts`/`scoring`. Si cambia → error, detener.
- **`informe-render.test.ts.snap` (PDF ERP) e `informe-render-it.test.ts.snap`
  (PDF IT): cambian a propósito** por el nuevo CSS/markup (la tabla `<table>` de
  hallazgos pasa a `.score-row`, riesgos/día a día a cards, plan a timeline). La
  **estructura de páginas se preserva** (`.informe-a4 .page`, despacho por tipo),
  por lo que el churn es menor que en una unificación. Estrategia controlada:
  1. **Antes** de regenerar, tests de **aserción explícita** (no-snapshot) que
     blindan lo invariante: (a) scores del PDF salen del canónico, intactos
     (R22, R21); (b) presencia de las 6 secciones (R17); (c) piezas web-v2
     presentes (`.score-row`/`.bar`/`.risk`/`.fix`/timeline/portada oscura/footer
     branded) (R1); (d) `@page`/print A4 (R5); (e) barras con `width:N%` (R7);
     (f) la estructura `.informe-a4 .page` y los módulos `render-erp/it/mixto`
     siguen existiendo (R7b); (g) norma condicional (R9/R10/R11); (h) logos CDN
     (R14/R15); (i) sin quick_wins/upsell/propuesta (R18/R19/R20); (j) sin
     `ERP B\d`/`ERP E\d` (R12); (k) `editMode` produce `data-field`/
     `contenteditable` en draft y no en canónicos (R20b/R20c). El test
     `informe-render.test.ts` actual (que afirma columnas de `<table>`, etc.) se
     **reescribe** a las aserciones del nuevo formato, conservando las que validan
     la estructura de páginas.
  2. Recién entonces `vitest -u` regenera los snapshots PDF.
  3. Diff revisado conscientemente: el nuevo `.snap` debe ser el mismo modelo de
     páginas con las piezas web-v2; cualquier score distinto es regresión.
- **`informe-web-render.test.ts.snap` (web): cambia SOLO por la norma condicional
  (R8–R10).** NO gana "próximos pasos" ni ninguna otra sección (no se unifica,
  §4). Regla dura R13: el lenguaje visual y la estructura web no cambian, y
  `web-render.ts` no se reescribe. Validación: un test de aserción verifica que
  las clases/estructura web (`hero`, `score-row`, `bar`, `risk`, `fix`,
  `tl-step`) siguen presentes y que gauge/score salen del canónico igual que hoy;
  luego `-u`, diff revisado (solo deben aparecer/desaparecer piezas
  `data-canonical="norma"`).

Se mantiene/extiende `tests/informe-normas.test.ts` para la **nueva** regla de
norma condicional (reemplaza las aserciones de "columna Norma siempre / celda
vacía" por "norma inline solo si `hayNorma`"). Se mantiene
`tests/informe-prompt.test.ts` (prompt v2.2 intacto, R21 lado prompt).

## 8. Editor inline (OQ2 → mantener)

Como NO se unifica, el editor inline ya vive en el render A4 actual y **se
preserva tal cual**. `report-render.svelte` sigue pasando `{editMode}` a
`renderInformeHtml`, que lo propaga a `render-erp/it/mixto`; los bloques del
`client_draft` (resumen, lectura transversal, riesgos, día a día, plan, próximos
pasos) siguen usando `field(path, text, {editMode})` → `data-field` +
`contenteditable` cuando `editMode` (R20b), igual que hoy. Los bloques canónicos
(score, gauge, **norma**) NO son editables (`data-canonical=…`, sin
`contenteditable`) (R20c). El restyle solo cambia el wrapper/clases CSS de esos
bloques, no su contrato de edición. Test: `editMode` produce
`data-field …contenteditable` en draft y no en canónicos (porta el test R30 de
#14 al markup restilado).

## 9. Errores

No se introducen errores de dominio nuevos. `buildInformeRenderModel` mantiene su
único throw ("El informe no tiene borrador para renderizar"). La norma usa
`trim()` + `startsWith` (nunca lanza). Las barras/gauge clampan score a 0 si null.

## 10. Trazabilidad archivo ↔ requirements

| Archivo | Requirements |
|---|---|
| `render-shared.ts` (centro del restyle: hoja `STYLE` web-v2 + `@page` A4, helpers de barra/gauge estáticos, `hayNorma`, logos, `field`, tipos) | R1, R5, R6, R7, R8, R14, R15, R20c |
| `render.ts` (despacho por tipo intacto, re-exports) | R7b |
| `render-erp.ts` (restyle markup, no reescribir) | R2, R7, R20b |
| `render-it.ts` (restyle markup + norma condicional, sin columna/celda; sin 'Control interno') | R3, R8–R11, R20b |
| `render-mixto.ts` / `render-mixto-parts.ts` (restyle markup) | R4, R8–R11, R20b |
| `web-render.ts` (solo norma condicional, sin cambio visual) | R8–R13 |
| `report-render.svelte` (sin cambio de API; editor inline preservado) | R20b |
| `template_informe_pdf_a4*.html` (logos CDN) | R16 |
| tests (`informe-render`, `informe-render-it`, `informe-web-render`, `informe-normas`, invariantes, editor inline) | R8–R22 y verificación de todos |
| `scoring/**` (sin cambios) | R21 |

## 11. Alternativas descartadas

1. **Unificar PDF + web en un único HTML** (`renderInformeBody(model,{medium})`
   con `WEB_STYLE`/`PRINT_STYLE`, eliminando `render-erp/it/mixto`) — **descartada
   en la puerta humana (OQ1, 2026-06-17)**. Aunque reduciría divergencia futura,
   reescribe los renders, obliga a portar `editMode` a un cuerpo nuevo y arriesga
   regresión visual en la web #15. Se prefirió restilar en sitio (§2.3): menor
   churn, estructura de páginas preservada, web intocada salvo norma.
2. **Norma en columna/celda propia (como #25)** — descartada: al pasar los
   hallazgos del PDF a `.score-row`, no hay columna "Norma"; una celda/columna
   vacía cuando no hay norma viola R10/R11. La norma va inline en `.detail`, solo
   si existe.
3. **Generar el PDF server-side con motor headless (puppeteer/playwright-pdf)** —
   fuera de alcance: el pipeline actual imprime vía `window.print()` sobre el
   HTML; #30 solo cambia el HTML/CSS, no el mecanismo de exportación.
4. **Tocar el prompt / subir `INFORME_PROMPT_VERSION`** — innecesario: #30 es
   render puro; la versión ya está en `2.2` (heredada de #25).
