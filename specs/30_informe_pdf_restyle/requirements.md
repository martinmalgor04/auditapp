# Requirements — 30_informe_pdf_restyle

> Llevar el **PDF A4** del informe al mismo lenguaje visual que el render web-v2
> que ya aprobó Martín (#15), aplicar logos 100% desde el CDN R2 y hacer la
> **norma por sección condicional** (solo cuando existe una norma real),
> consistente en PDF y web. No cambia el motor de scoring ni los valores de
> score/semáforo.

## Contexto verificado

- **Dos formatos, dos renders (NO se unifican — puerta humana 2026-06-17):**
  - **PDF A4** → `renderInformeHtml()` (`src/lib/informe/render.ts` →
    `render-erp.ts` / `render-it.ts` / `render-mixto.ts` /
    `render-mixto-parts.ts`, helpers en `render-shared.ts`). Usa el modelo
    de páginas fijas `.informe-a4 .page` (210×297mm, `page-break-after:always`,
    `footer('NN')` hardcodeado). **Esta estructura paginada se preserva**; #30
    solo le cambia los **estilos** (la hoja `STYLE` de `render-shared.ts`) y el
    **markup mínimo** necesario dentro de esa estructura para adoptar el lenguaje
    visual del web-v2. Lo consume `report-render.svelte` y las dos rutas de
    impresión (`/auditorias/[id]/informe/[version]/imprimir` y
    `/informe/[token]/imprimir`) vía `window.print()`.
  - **Web-v2** → `renderInformeWebHtml()` (`src/lib/informe/web-render.ts`,
    entrega pública #15). Look aprobado por Martín: `.informe-web` con `.hero`
    + gauge SVG, `.score-row` con `.bar i[data-w]`, `.risk`, `.fix`, `.tl-step`,
    `.callout`. **NO se rediseña ni se reescribe.** Único cambio admisible: la
    norma condicional (R8–R10/R13).
- **Contrato visual del PDF restilado:**
  `docs/plantillas/informe/ref_informe_a4_v2_plastipress.html` (HTML a mano de
  Martín). Verificado: su `@media print` (líneas ~414–672) toma el **lenguaje
  visual del web-v2** (`section.hero`, `.card`, `.score-row`, `.bar i[data-w=..]`,
  `.risk`, `.fix`, `.tl-item`, `.callout-dark`, `.fortaleza-dark`, `footer`) y lo
  presenta en A4 limpio: portada oscura con gauge + `page-break-after:always`,
  páginas blancas, cards con `break-inside:avoid`,
  `@page { size:A4 portrait; margin:14mm 16mm }`. El contrato es la **referencia
  de estilo** a la que debe llegar el PDF; **no** implica copiar su DOM ni
  unificar con el web. La estructura de páginas actual del PDF (`.informe-a4
  .page`) se conserva y se le aplican estos estilos. El bloque `.ps-*`
  (propuestas comerciales, desde `<div class="ps-root">` hasta el final) **NO es
  parte del informe** (decisión 5).
- **Logos:** `render-shared.ts` ya centraliza `LOGO_VERT_URL`
  (`sys_vertical_w.png`, fondo oscuro) y `LOGO_COLOR_URL` (`sys_horizontal_b.png`,
  fondo claro) apuntando al CDN R2 base
  `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/`. El render PDF y
  web ya usan esas constantes. Las **plantillas HTML A4**
  (`template_informe_pdf_a4_v1.html`, `template_informe_pdf_a4_it_v1.html`) son
  docs de referencia y todavía usan placeholders base64 `__LOGO_VERT__` /
  `__LOGO_COLOR__` (verificado: líneas 202/263/308/351/404/466/503).
- **Norma por sección (estado heredado de #25):** el dato `standard_ref` viaja
  al canónico (`canonical/build.ts`, `schema.ts:42`) y llega a
  `InformeRenderModel.secciones[].standardRef` (`model.ts:65`). El código de #25
  **ya está en el working tree** (no commiteado, `feature_list` lo tiene fuera de
  `done`): columna "Norma" **siempre presente** en la tabla IT (celda vacía
  `<td data-canonical="norma"></td>` cuando no hay norma), bloque de metodología
  IT, `INFORME_PROMPT_VERSION='2.2'`, test `tests/informe-normas.test.ts`. **#30
  AJUSTA ese comportamiento** (ver §Decisiones tomadas, punto 4).
- **Scoring:** `src/lib/server/scoring/` no se toca. `indexToSemaphore` y los
  scores del canónico son la única fuente de score/semáforo (R12 de #25 sigue).
- **Invariante histórico:** quick_wins y `upsell_findings` **nunca** se renderizan
  en el informe cliente. `stripInternalFindings` (`canonical/preview.ts`) filtra
  `upsell_findings`; `RenderClientDraft` (`render-shared.ts`) no contiene
  quick_wins ni upsell. Hoy ya no aparecen; #30 lo blinda con test explícito.

## Decisiones tomadas (puerta humana 2026-06-17 — NO re-preguntar)

1. **Dos formatos, NO se unifican.** Web-v2 (`web-render.ts`) tiene el look
   aprobado y **NO se rediseña ni se reescribe**. El **PDF A4** conserva su
   estructura paginada actual (`.informe-a4 .page`, despacho por
   `render-erp/it/mixto/mixto-parts`); se le cambian **solo los estilos** (hoja
   `STYLE` de `render-shared.ts` + markup mínimo) para que adopte el lenguaje
   visual del web-v2. Se **descarta** la propuesta de unificar PDF y web en un
   único `renderInformeSharedHtml`/`renderInformeBody` (ver OQ1, Decisiones de la
   puerta humana). Consecuencia: menor churn — la estructura de páginas se
   preserva; los snapshots PDF ERP/IT igual cambian a propósito por el nuevo
   CSS/markup.
2. **Contrato visual:** `ref_informe_a4_v2_plastipress.html`, bloque `@media
   print`, como **referencia de estilo** (no de DOM). El `.ps-*` (propuesta
   comercial) queda fuera del informe.
3. **Logos 100% CDN.** Eliminar los base64 `__LOGO_VERT__`/`__LOGO_COLOR__` de
   las plantillas A4; usar la variante por fondo (vertical blanco en portada
   oscura, horizontal oscuro en footer/fondo claro), desde las constantes ya
   centralizadas en `render-shared.ts`.
4. **Norma condicional (ajusta #25).** La norma de una sección se muestra **solo
   si existe una norma real** (`standardRef` no nulo y con prefijo `CIS`). Si no
   hay norma → **no se muestra nada** (sin celda vacía, sin etiqueta "Control
   interno"). Consistente en PDF y web.
5. **Seis secciones.** El informe cliente mantiene: Resumen ejecutivo, Hallazgos,
   Riesgos priorizados, Qué cambia en el día a día, El plan/roadmap, Próximos
   pasos. quick_wins / upsell_findings **nunca** aparecen. La propuesta/cotización
   comercial NO va en el informe (sigue en presupuestossys #16); el puente
   informe↔presupuesto queda documentado como futuro, fuera de alcance.
6. **Scoring intacto.** Score/semáforo no cambian.

## Definición operativa "hay norma" (regla de negocio, R8)

Reutiliza el criterio de #25 (la norma publicable solo existe en contexto IT y
empieza con `CIS`). Una sección **tiene norma** si y solo si:

```
hayNorma(sec) ≡ sec.domain === 'it'
              && (sec.standardRef ?? '').trim().startsWith('CIS')
```

- Contexto ERP → nunca hay norma (no se expone nomenclatura interna `ERP B1`).
- IT con `standardRef` null/vacío o sin prefijo `CIS` → no hay norma → no se
  muestra nada (ni celda, ni separador, ni etiqueta).
- IT con `'CIS N · NIST: fase'` → hay norma → se muestra tal cual.

## Requirements (EARS estricto)

### A. Restyle visual del PDF A4 (lenguaje web-v2 dentro de la estructura paginada)

**R1.** El sistema DEBE restilar el PDF A4 (`renderInformeHtml`) para que adopte
el lenguaje visual del render web-v2 —portada/hero oscura con gauge, `score-row`
con barra de progreso, riesgos en cards con borde rojo, "qué cambia en el día a
día" en cards claras, plan en timeline y footer branded—, **conservando** la
estructura paginada actual (`.informe-a4 .page`, despacho por
`render-erp/it/mixto/mixto-parts`).

**R2.** CUANDO se renderiza el PDF A4 de una auditoría `erp`, el sistema DEBE
emitir las seis secciones (resumen, hallazgos, riesgos, día a día, plan, próximos
pasos) con el lenguaje visual web-v2, dentro de su estructura de páginas.

**R3.** CUANDO se renderiza el PDF A4 de una auditoría `it`, el sistema DEBE
emitir las seis secciones con el lenguaje visual web-v2, dentro de su estructura
de páginas.

**R4.** CUANDO se renderiza el PDF A4 de una auditoría `mixta`, el sistema DEBE
emitir las seis secciones con el lenguaje visual web-v2, dentro de su estructura
de páginas.

**R5.** El sistema DEBE incluir en el PDF A4 una regla `@media print`/`@page` con
`{ size: A4 portrait; margin: 14mm 16mm }` que produzca portada oscura
(`page-break-after:always`) y páginas blancas, evitando cortes de tarjetas
(`break-inside: avoid` en cards/riesgos/fix/score-row).

**R6.** CUANDO el PDF A4 se imprime a papel/PDF, el sistema NO DEBE producir
desbordes horizontales: el ancho del contenido DEBE caber en el área útil A4
(210mm − 2×16mm de margen).

**R7.** El sistema DEBE pintar cada barra de `score-row` del PDF con un ancho
estático derivado del score canónico (sin depender de JavaScript en tiempo de
impresión), de modo que la barra se vea llena al porcentaje correcto en el PDF.

**R7b.** El sistema NO DEBE alterar la estructura de páginas del PDF A4 (el
modelo `.informe-a4 .page` y el despacho por tipo de auditoría hacia
`render-erp/it/mixto`): el cambio se limita a estilos (`STYLE` de
`render-shared.ts`) y al markup mínimo necesario para las piezas visuales web-v2,
sin reescribir esos renders ni unificarlos con `web-render.ts`.

### B. Norma condicional (ajusta #25), consistente PDF + web

**R8.** El sistema DEBE considerar que una sección "tiene norma" únicamente
cuando su `domain` es `it` y su `standardRef` (sin espacios) empieza con `CIS`;
en cualquier otro caso la sección NO tiene norma.

**R9.** CUANDO una sección de hallazgos tiene norma (R8), el sistema DEBE mostrar
ese `standardRef` tal cual en la fila correspondiente, tanto en el PDF A4 como en
la web (`web-render.ts`).

**R10.** SI una sección de hallazgos NO tiene norma (R8) ENTONCES el sistema NO
DEBE mostrar para esa fila ninguna marca de norma: ni celda de norma, ni
separador, ni etiqueta "Control interno", ni texto sustituto, ni en PDF ni en
web.

**R11.** CUANDO ninguna sección de hallazgos del informe tiene norma (R8), el
sistema NO DEBE renderizar la columna/encabezado "Norma" en la tabla de hallazgos
del PDF A4 (no queda una columna vacía).

**R12.** El sistema NO DEBE exponer en ninguna salida del informe (PDF o web) la
nomenclatura interna ERP cruda (`ERP B1`, `ERP E3`, etc.).

**R13.** El render web-v2 (`web-render.ts`) NO DEBE cambiar su lenguaje visual:
el único cambio admisible respecto del snapshot web actual es el ajuste de la
norma condicional (R8–R10).

### C. Logos desde el CDN R2

**R14.** El sistema DEBE servir todos los logos del informe (PDF y web) desde el
CDN R2 (`https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/`), usando las
constantes `LOGO_VERT_URL` y `LOGO_COLOR_URL` de `render-shared.ts`.

**R15.** El sistema DEBE usar el logo vertical blanco (`sys_vertical_w.png`,
`LOGO_VERT_URL`) sobre fondo oscuro (portada/cierre) y el logo horizontal oscuro
(`sys_horizontal_b.png`, `LOGO_COLOR_URL`) sobre fondo claro (footer de página).

**R16.** El sistema NO DEBE referenciar logos vía `data:image/png;base64` ni
placeholders `__LOGO_VERT__` / `__LOGO_COLOR__` en las plantillas A4
(`docs/plantillas/informe/template_informe_pdf_a4_v1.html`,
`template_informe_pdf_a4_it_v1.html`): DEBEN apuntar a las URLs del CDN.

### D. Secciones, invariantes y alcance

**R17.** El informe al cliente (PDF y web) DEBE contener exactamente las seis
secciones (resumen ejecutivo, hallazgos, riesgos priorizados, qué cambia en el
día a día, el plan, próximos pasos) y NO DEBE agregar ni quitar secciones.

**R18.** El sistema NO DEBE incluir en el informe al cliente (PDF ni web) ningún
texto proveniente de quick_wins.

**R19.** El sistema NO DEBE incluir en el informe al cliente (PDF ni web) ningún
texto proveniente de `upsell_findings`.

**R20.** El sistema NO DEBE incluir en el informe al cliente la propuesta o
cotización comercial (vive en presupuestossys #16).

**R20b.** CUANDO `renderInformeHtml` se invoca con `editMode` activo, el sistema
DEBE seguir emitiendo el editor inline existente (R30 de #14) en los bloques del
`client_draft`: `data-field` + `contenteditable`, igual que hoy. El restyle del
PDF NO DEBE remover ni romper ese comportamiento.

**R20c.** El sistema NO DEBE hacer editable ningún dato canónico del informe
(score, gauge/índice, norma): esos elementos NUNCA llevan `contenteditable`,
independientemente de `editMode`.

### E. No-regresión de scoring

**R21.** El sistema NO DEBE modificar el motor de scoring, los umbrales, ni los
valores de score/semáforo de ninguna sección al rediseñar el PDF.

**R22.** CUANDO el PDF A4 muestra el score de una sección, ese valor DEBE
provenir del snapshot canónico (no del `client_draft`), idéntico al actual.

## Criterios de verificación (resumen R ↔ test)

| R | Verificación concreta |
|---|---|
| R1 | HTML PDF contiene clases web-v2: `score-row`, `bar`, `risk`, `fix`, `tl`/timeline, `hero`/portada oscura, footer branded |
| R2 | PDF `erp`: 6 secciones presentes (eyebrows 01..06) con vocabulario web-v2 |
| R3 | PDF `it`: 6 secciones presentes con vocabulario web-v2 |
| R4 | PDF `mixta`: 6 secciones presentes con vocabulario web-v2 |
| R5 | HTML PDF contiene `@page` A4 portrait `14mm 16mm` y `break-inside:avoid` en cards |
| R6 | test: ningún ancho fijo de contenido supera el área útil; sin `width:210mm` rígido fuera de la página/print |
| R7 | cada `.bar i` del PDF lleva `style="width:N%"` con N = score canónico |
| R7b | `render-erp.ts`/`render-it.ts`/`render-mixto.ts`/`render-mixto-parts.ts` siguen existiendo y conservan su estructura `.informe-a4 .page`; el diff de #30 es CSS + markup acotado, no reescritura/eliminación; no se crea `renderInformeBody`/`render-shared-web.ts` unificado |
| R8 | helper `hayNorma`/equivalente: true solo si domain it + `CIS…`; tests con casos CIS, null, ERP |
| R9 | fila IT con `CIS 4 · NIST: Protect` muestra ese texto (PDF y web) |
| R10 | fila sin norma: no contiene `data-canonical="norma"`, ni "Control interno", ni separador de norma (PDF y web) |
| R11 | PDF de auditoría sin ninguna norma (p.ej. ERP, o IT sin `standard_ref`): NO contiene encabezado "Norma" |
| R12 | ninguna salida contiene `ERP B\d` / `ERP E\d` |
| R13 | snapshot web cambia SOLO por norma condicional (diff revisado); estructura/clases web intactas; `web-render.ts` no se reescribe |
| R14 | PDF y web contienen `r2.dev/LOGOS/sys_vertical_w.png` y `sys_horizontal_b.png`; sin `base64` |
| R15 | portada/cierre usan `LOGO_VERT_URL`; footer usa `LOGO_COLOR_URL` |
| R16 | plantillas A4 no contienen `__LOGO_VERT__`/`__LOGO_COLOR__` ni `data:image/png;base64`; sí URLs CDN |
| R17 | PDF y web: exactamente 6 secciones de informe (conteo de eyebrows/secciones) |
| R18 | test invariante: con fixture que tiene quick_wins, el HTML cliente no contiene esos textos |
| R19 | test invariante: con fixture con `upsell_findings`, el HTML cliente no contiene esos textos |
| R20 | test: el HTML del informe no contiene marcadores de propuesta (`ps-`, "Inversión", "Validez", precios) |
| R20b | `renderInformeHtml(model,{editMode:true})` produce `data-field …contenteditable` en bloques del draft (porta test R30 de #14 al nuevo markup) |
| R20c | con `editMode:true`, los elementos `data-canonical` (score/gauge/norma) NO llevan `contenteditable` |
| R21 | tests de scoring siguen verdes; no se tocan archivos de `scoring/` |
| R22 | scores del PDF salen del canónico (assert por sección con `data-canonical="score"`) |

## Decisiones de la puerta humana (2026-06-17)

Las tres open questions del borrador quedaron resueltas en la puerta humana. La
aprobación NO se reabre; estas decisiones ya están incorporadas a los R, al
design y a las tasks.

1. **OQ1 — Modelo de DOM del PDF restilado → NO unificar.** Se mantiene el render
   PDF A4 actual con su estructura paginada (`.informe-a4 .page`,
   `render-erp/it/mixto/mixto-parts` intactos en estructura) y SOLO se le cambian
   los **estilos** (la hoja `STYLE` de `render-shared.ts` y el markup mínimo
   necesario) para que el PDF tenga el lenguaje visual del web-v2 según el
   contrato `docs/plantillas/informe/ref_informe_a4_v2_plastipress.html`: portada
   oscura con gauge, páginas blancas, score-rows con barras, riesgos en cards, día
   a día en cards, plan en timeline, footer branded, A4 portrait 14/16mm. Se
   **descarta** la propuesta de unificar PDF + web en un único
   `renderInformeSharedHtml`/`renderInformeBody`. `web-render.ts` NO se toca
   (salvo la norma condicional). `render-erp/it/mixto` conservan su estructura por
   páginas; el trabajo es CSS + ajustes de markup acotados dentro de esa
   estructura. Los snapshots PDF ERP/IT igual cambian a propósito (por el
   CSS/markup), pero la estructura de páginas se preserva → menor churn. Refleja:
   R1–R7b, R13.

2. **OQ2 — Editor inline → mantener.** El camino PDF conserva `editMode` +
   `field()`/`data-field`/`contenteditable` exactamente como hoy (R30 de #14). Lo
   canónico (score, gauge, norma) NUNCA es editable. Como NO se unifica, esto es
   naturalmente más simple: el editor inline ya vive en el render A4 actual y se
   preserva. Refleja: R20b, R20c.

3. **OQ3 — Secuenciación con #25 → construir sobre el árbol actual.** #30 se
   construye sobre el árbol actual, que ya incluye #25 (en `done`, sin commitear
   como todo el repo). #30 **reemplaza** la regla de norma de #25: de "columna
   Norma siempre presente en la tabla IT con celda vacía" a "la norma se muestra
   SOLO si existe norma real (R8); si no hay, no se muestra nada — sin etiqueta,
   sin celda visible con texto". Se quita del spec cualquier resto de la etiqueta
   'Control interno'. El implementer documenta que el neto sobre `main` incluye lo
   de #25. Refleja: R8–R11.

## Nota / futuro (fuera de alcance)

**Puente informe↔presupuesto.** La cotización comercial vive en presupuestossys
(#16, contrato M2M v1.0). A futuro, el informe podría enlazar/disparar la
generación del presupuesto a partir del cierre de auditoría. Queda anotado como
trabajo posterior; **no** se implementa en #30.
