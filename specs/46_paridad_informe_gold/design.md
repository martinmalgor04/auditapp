# Design — 46_paridad_informe_gold

## Alcance y ubicación de los cambios

Toda la lógica de render vive en **`src/lib/informe/web-render.ts`** (vista web pública,
consumida por `report-web-render.svelte` y el snapshot test). El modelo de datos es
**`src/lib/informe/render-shared.ts`** (`RenderClientDraft`, `InformeRenderModel`) y se
re-exporta desde **`src/lib/informe/render.ts`**. El builder del modelo es
**`src/lib/server/informe/model.ts`**, que mapea desde el canónico
(**`src/lib/server/canonical/schema.ts`**).

No se toca `render-erp.ts` / `render-it.ts` / `render-mixto.ts` (render A4 imprimible
del editor) salvo si la puerta humana decide que el print A4 robusto debe vivir ahí.
Ver Open Question OQ-4.

Referencia visual: `~/Downloads/2026-informe-grupo_agros_formosa-auditoria-erp-it.html`
(clases `.equip-table`, `.steps/.step/.sn`, `.excl-grid/.excl-box`, `.tl/.tl-item`,
bloque `@media print` + `@page`).

---

## Estado actual relevante (verificado en el código)

- `RenderClientDraft` (render-shared.ts:14) YA tiene:
  - `plan.necesitamos_cliente: string[]` y `plan.no_incluye: string[]` (líneas 36–37).
  - `proximos_pasos: string[]` (línea 48) — **ya existe pero `web-render.ts` no lo usa**.
  - `plan.etapas` con `{ semana, titulo, descripcion }`.
- `web-render.ts::renderPlan` hoy: timeline horizontal `.tl-h` + bloque `.twocol`
  (necesitamos / no_incluye). NO hay sección "Próximos pasos" separada, NO usa
  `draft.proximos_pasos`.
- `InformeRenderModel.secciones` (render-shared.ts:59) expone por sección:
  `code, title, score, semaforo, domain, standardRef`. **NO expone `items` ni
  `observations`** — y `model.ts:81` descarta `s.items` / `s.observations` del canónico.
- El canónico (`canonicalSectionSchema`) sí tiene `items[]` con
  `{ label, value, na, observations, ... }` y `observations` de sección.

**Consecuencia:** las brechas 2, 3 y 4 se resuelven solo en `web-render.ts`
(los datos ya existen en el draft). La brecha 1 (tabla seguridad) requiere **exponer
datos nuevos en el modelo** porque hoy no llegan a `web-render.ts`. Ver decisión abajo.

---

## Brecha 1 — Tabla de control de usuarios y seguridad

### Cómo se decide si la sección existe (R1/R2)
Por **section code** del canónico. La sección de seguridad se identifica por un
`code` conocido (p. ej. prefijo `SEG`/`seguridad`/`control_usuarios`) en
`model.secciones`. El render busca esa sección; si no está, no emite nada (R2).

### De dónde salen las filas control / estado / observaciones (R3)
Las filas vienen de los `items` de esa sección canónica
(`label` → control, `value` → estado, `observations` → observaciones). Como hoy el
modelo NO transporta `items`, se agrega un campo dedicado al draft/modelo:

- **Opción elegida:** agregar a `RenderClientDraft` un bloque opcional
  ```ts
  seguridad?: {
    titulo: string;
    filas: Array<{ control: string; estado: string; observaciones: string }>;
  } | null;
  ```
  poblado por el builder del draft (server) a partir de la sección canónica de
  seguridad (o por el generador IA, igual que el resto de `client_draft`). El render
  emite la tabla solo si `draft.seguridad` tiene filas. Esto mantiene la regla
  "todo el render sale de `client_draft`" (R18) y deja la curaduría editorial del
  texto en el draft, no en items crudos.
- **Alternativa descartada:** exponer `secciones[].items` en `InformeRenderModel` y
  que `web-render.ts` arme la tabla desde items crudos. Descartada porque (a) rompe el
  contrato actual de `secciones` (solo metadatos de score), (b) arrastra items crudos
  no curados (riesgo de exponer texto no apto), y (c) acopla el render a la forma del
  canónico en vez de al draft editable.

### Render (R1, R4)
Nueva función `renderSeguridad(model)` insertada dentro de `renderHallazgos` (o
inmediatamente después, como sub-bloque de la sección 02). HTML:

```html
<table class="equip-table">
  <thead><tr><th>Control</th><th>Estado</th><th>Observaciones</th></tr></thead>
  <tbody>
    <tr>
      <td data-label="Control"><strong>{control}</strong></td>
      <td data-label="Estado">{estado}</td>
      <td data-label="Observaciones">{observaciones}</td>
    </tr>
  </tbody>
</table>
```

Todas las celdas pasan por `escapeHtml` (R4). CSS `.equip-table` se porta del gold,
re-tematizado con tokens `--sys-*` (header `--sys-azul-electrico`/`--sys-celeste`,
texto sobre fondo oscuro en web; tema claro en print por R15). Incluye el patrón
responsive `data-label` (display:block en mobile) del gold.

---

## Brecha 2 — Sección "Próximos pasos" (steps + excl-grid)

Nueva función `renderProximosPasos(model)`:

- Pasos numerados desde `draft.proximos_pasos` (R5): contenedor `.steps`, cada paso
  `.step` con `.sn` (número correlativo 1..N) + `<h4>`/texto. Si el array está vacío,
  se omite el bloque de pasos (R7) pero la sección puede seguir mostrando el excl-grid.
- `excl-grid` con dos `excl-box` (R6): "Qué necesitamos de {razonSocial}" desde
  `plan.necesitamos_cliente`; "Qué no incluye esta etapa" desde `plan.no_incluye`.
  Reutiliza el contenido que hoy está en `.twocol`.
- **Reemplazo del `.twocol`** (R8): el bloque `.twocol` de `renderPlan` se elimina y su
  contenido (necesitamos/no_incluye) pasa al `excl-grid` de esta sección, para no
  duplicar. `renderPlan` queda solo con título + descripción + timeline.
- Orden en el documento: la sección "Próximos pasos" va después de "El plan" (05),
  antes del CTA. El eyebrow puede numerarse (p. ej. "06 · Próximos pasos") **siempre
  que NO se confunda con la sección 06 "Propuesta de abono"** (excluida): usar rótulo
  textual sin chocar con la numeración del abono. Ver OQ-1.

CSS `.steps/.step/.sn` y `.excl-grid/.excl-box` portados del gold con tokens `--sys-*`.

---

## Brecha 3 — Timeline horizontal vs vertical

- **Criterio (R9/R10):** umbral por cantidad de etapas. Si `etapas.length <= UMBRAL`
  → horizontal `.tl-h` (actual). Si `> UMBRAL` → vertical `.tl`/`.tl-item`. Valor
  propuesto `UMBRAL = 4` (4 columnas caben cómodas en 860px; a 5+ el horizontal se
  comprime). Constante nombrada `TL_HORIZONTAL_MAX` en `web-render.ts`. Ver OQ-2.
- **Render vertical:** función `renderTimelineVertical(etapas)` con `.tl` y un
  `.tl-item` por etapa (`.week` + `<h3>` + `<p>`), línea vertical por `::before`
  (portada del gold). `renderPlan` elige horizontal o vertical según el umbral.
- Ambos paths derivan de `draft.plan.etapas` y escapan todos los campos (R11).

---

## Brecha 4 — `@media print` A4 robusto

Hoy `web-render.ts` solo oculta cue/amb/prog en print (línea 84). Se agrega un bloque
`@media print` + `@page` completo, portado y adaptado del gold:

- `@page { size: A4 portrait; margin: 14mm 16mm }` (R12).
- Salto de página por sección: `section.hero { page-break-after: always }` y
  `section.wrap:not(.hero)` con `page-break-inside: auto` + borde superior claro (R12).
- **Gauge estático (R13):** en print, el arco `[data-gauge-arc]` se fuerza a su valor
  final. Estrategia: el render ya emite `data-gauge-score` y el arco con
  `stroke-dashoffset` inicial = circunferencia (animado por JS en pantalla). Para print,
  el render debe emitir además el `stroke-dashoffset` **final** calculado server-side
  (vía `gaugeDasharray`/circunferencia × score) en un atributo o en un `<style>`/regla
  print que lo fije, de modo que sin JS el arco aparezca lleno. Se reemplaza la
  dependencia de la animación JS por un valor estático impreso. Igual el número:
  emitir el valor final como texto y forzarlo en print (no `0`).
- **Barras y contadores estáticos (R14):** patrón del gold —
  `.bar i { transition:none !important }` + reglas `.bar i[data-w="N"] { width:N% }`.
  El render ya emite `data-w` en las barras (web-render.ts:308). En print, las cards
  `data-count` deben mostrar el valor final (regla print que muestre el número real,
  no la animación a 0). Se documenta que el número final debe estar presente en el DOM
  (texto estático) para que el print no dependa de JS.
- **Tema claro (R15):** `section.wrap:not(.hero)` fondo blanco, texto `#102A43`,
  acentos con `--sys-*`. Hero mantiene fondo azul SyS. Portado del gold.
- **Anti-corte (R16):** `break-inside: avoid` en `.card`, `.score-row`, `.risk`,
  `.fix`, `.equip-table tr`, `.step`, `.tl-item`, `.excl-box`.

### Nota sobre animación vs print
El JS de animación (reveal, count-up, gauge fill, barras) vive en
`web-effects.ts`/cliente. La estrategia de print NO depende de ejecutar ese JS: el
render emite los valores finales en el DOM y `@media print` los fija con reglas CSS
estáticas. Así un "Imprimir a PDF" sin JS (o con JS a medio animar) sale fiel.

---

## Branding y no-regresión

- Todo CSS nuevo usa tokens `--sys-azul-electrico`, `--sys-celeste`, `--sys-rojo`,
  `--sys-naranja`, `--sys-verde`, `--sys-azul-profundo`, `--sys-azul-medio` (R17).
- Render solo desde `InformeRenderModel`/`client_draft`; `upsell_findings` y
  observaciones internas nunca entran (R18). Test explícito.
- Snapshots ERP/IT existentes intactos salvo cambios intencionales (R19): los nuevos
  bloques solo aparecen cuando hay datos (`draft.seguridad`, `proximos_pasos`,
  etapas > umbral); con fixtures sin esos datos, el output no cambia.

---

## Archivos a crear / modificar

| Archivo | Cambio |
|---|---|
| `src/lib/informe/render-shared.ts` | Agregar `seguridad?` opcional a `RenderClientDraft`. |
| `src/lib/informe/web-render.ts` | `renderSeguridad`, `renderProximosPasos`, `renderTimelineVertical`; refactor `renderPlan` (quita `.twocol`); STYLE: `.equip-table`, `.steps/.step/.sn`, `.excl-grid/.excl-box`, `.tl/.tl-item`; bloque `@media print` + `@page`. |
| `src/lib/server/informe/model.ts` / builder del draft | Poblar `draft.seguridad` desde la sección canónica de seguridad (solo si existe). |
| `src/lib/server/informe/schemas.ts` | Reflejar `seguridad` en el schema Zod del draft si aplica. |
| Tests (`tests/…`) | Snapshots nuevos: tabla seguridad (presente/ausente), próximos pasos, timeline vertical, print; test de no-exposición de material interno; no-regresión ERP/IT. |

---

## Firmas nuevas (propuestas)

```ts
// render-shared.ts — RenderClientDraft
seguridad?: {
  titulo: string;
  filas: Array<{ control: string; estado: string; observaciones: string }>;
} | null;

// web-render.ts
function renderSeguridad(model: InformeRenderModel): string;       // R1–R4
function renderProximosPasos(model: InformeRenderModel): string;   // R5–R8
function renderTimelineVertical(
  etapas: RenderClientDraft['plan']['etapas']
): string;                                                          // R9, R11
const TL_HORIZONTAL_MAX = 4;                                        // R9/R10
```

---

## Open Questions para la puerta humana (Martín)

- **OQ-1 (numeración de secciones):** la sección 06 "Propuesta de abono" está excluida.
  ¿"Próximos pasos" se rotula como sección 06 (y el abono futuro pasa a 07), o se rotula
  sin número para no reservar el 06? Afecta el eyebrow.
- **OQ-2 (umbral timeline):** ¿`TL_HORIZONTAL_MAX = 4` es correcto, o el corte
  horizontal↔vertical debe ser otro (p. ej. 3, o decidido por longitud de texto)?
- **OQ-3 (identificación de la sección seguridad):** ¿cuál es el/los `code` canónicos
  exactos de la sección de seguridad / control de usuarios? Hoy no hay un code fijo
  cableado en el código. Necesito la lista de codes (o el criterio por `title`/`domain`)
  para R1/R2.
- **OQ-4 (print A4 también en render A4 del editor):** el gold mezcla vista web y print.
  ¿El `@media print` robusto se aplica solo a la vista web pública (`web-render.ts`), o
  también debe portarse al render A4 imprimible del editor (`render-*.ts`)? La spec
  asume solo `web-render.ts`; confirmar.
- **OQ-5 (origen del estado en la tabla seguridad):** ¿`estado` es texto libre curado en
  el draft, o un enum (OK / Parcial / Faltante) con color? El gold usa texto. La spec
  asume texto curado en `draft.seguridad`.
