# Design — 25_normas_informe

> Cómo se extiende el modelo de render y cada salida para mostrar (1) la norma
> por sección en hallazgos y (2) un bloque de metodología, sin tocar scoring ni
> romper snapshots existentes.

## 1. Resumen de la cadena de datos (verificado)

```
seed/templates/*.json  (section.standard_ref)
   → migración/DB (template.section.standard_ref)
   → canonical/build.ts:252  (standard_ref: section.standard_ref)   ✅ ya viaja
   → canonical/schema.ts:42  (standard_ref: z.string().nullable())  ✅ ya validado
   → preview.ts stripInternalFindings()  → devuelve CanonicalAudit completo,
        sections[].standard_ref intacto                              ✅ ya disponible
   → server/informe/model.ts buildInformeRenderModel()  ← ❌ HOY descarta standard_ref
   → render-shared.ts InformeRenderModel.secciones[]    ← ❌ HOY no tiene el campo
   → render-erp / render-it / render-mixto / web-render ← ❌ HOY no muestra norma
```

El corte está exclusivamente en `model.ts` → `render-shared.ts` → renders.
`stripInternalFindings` (`src/lib/server/canonical/preview.ts:67`) hace spread del
canónico y solo filtra `upsell_findings`, por lo que `standard_ref` por sección
ya llega a `buildInformeRenderModel`.

## 2. Archivos a modificar

> Actualizado tras la puerta humana (2026-06-17). Ver §11 Decisiones. La columna
> Norma y el bloque de metodología son **solo IT/mixta-IT**; ERP queda intacto. El
> helper `normaLabel` se elimina. El prompt SÍ se toca.

| Archivo | Cambio |
|---|---|
| `src/lib/informe/render-shared.ts` | (a) agregar `standardRef: string \| null` al tipo `secciones[]` de `InformeRenderModel`; (b) helper `renderMetodologiaBlock(tipo)` solo para `it`/`mixta` (marco IT); (c) extender el render de filas de hallazgos **IT** con la celda Norma (mostrar `standardRef` IT tal cual; vacío si null/empty) |
| `src/lib/server/informe/model.ts` | mapear `standardRef: s.standard_ref` en `secciones` |
| `src/lib/informe/render-it.ts` | header `<th>` Norma + anchos de la tabla IT en `renderInformeIt` y en `renderHallazgosItPage` (usada por mixto); insertar bloque metodología IT en la página de hallazgos |
| `src/lib/informe/render-erp.ts` | **sin cambios** (ERP puro idéntico al actual: sin columna Norma, sin metodología) |
| `src/lib/informe/render-mixto-parts.ts` / `render-mixto.ts` | la parte IT del mixto usa el render IT con columna Norma; la parte ERP (`renderHallazgosErpPage`) queda **sin columna Norma**; el bloque metodología del mixto declara **solo marco IT** |
| `src/lib/informe/web-render.ts` | norma por fila solo en hallazgos IT en `renderHallazgos`; filas ERP sin norma; bloque metodología IT en web cuando hay contexto IT |
| `seed/templates/*.json` | **sin cambios** (el dato ya está) |
| `migrations/` | **sin cambios** (no hay cambio de schema) |
| `src/lib/server/informe/prompts/generate-report.ts` | **SÍ se toca** (Decisión 3): instrucción de usar `standard_ref`/no inventar normas (IT/mixta) + `INFORME_PROMPT_VERSION` `2.1`→`2.2` (R15, R16) |

## 3. Firmas nuevas / modificadas

### 3.1 Tipo extendido (`render-shared.ts`)

```ts
export type InformeRenderModel = {
  // ...sin cambios...
  secciones: Array<{
    code: string;
    title: string;
    score: number | null;
    semaforo: RenderSemaphore | null;
    domain: 'it' | 'erp';
    standardRef: string | null;   // NUEVO (R1)
  }>;
  // ...
};
```

### 3.2 Presentación de la norma en contexto IT (sin helper) — R5, R6, R13, R14

> El helper `normaLabel` se **elimina** (Decisión 1). No hay mapeo de ERP ni
> etiqueta `Control interno`: la norma solo se renderiza en contexto IT y se
> muestra el `standardRef` tal cual.

La celda Norma de una fila IT se llena con:

```ts
// contexto IT únicamente
const norma = (sec?.standardRef ?? '').trim(); // '' si null/vacío (R13)
// se renderiza e(norma) — 'CIS N · NIST: fase' o cadena vacía
```

Reglas:
- IT con `standard_ref` `'CIS N · NIST: fase'` → se muestra tal cual (R5).
- IT sin `standard_ref` (null/vacío) → celda **vacía** (R13), sin etiqueta
  sustituta, sin lanzar.
- Contexto ERP → no se renderiza columna Norma, por lo que `standardRef` ERP
  nunca llega a una salida (R6, R14 por construcción).

No se necesita helper exportado; basta el `trim()` inline. Igualmente se valida
en test que ninguna salida contiene `ERP B`/`ERP E` crudo (R14).

### 3.3 Bloque de metodología (`render-shared.ts`) — R7, R9, R11

```ts
export function renderMetodologiaBlock(
  tipo: 'it' | 'mixta'
): string;  // devuelve HTML de un .callout compacto reutilizable (solo IT)
```

Se invoca **solo** para `it` y `mixta` (no existe variante `erp`). Contenido
(texto exacto a fijar en implementación, sin jerga prohibida):

- `it` (R9) y `mixta` (R11): "Los valores de este informe se evalúan contra CIS
  Controls v8 y el NIST Cybersecurity Framework. El estado de fin de vida del
  hardware se mide por los ciclos de vida de cada fabricante (HPE, Lenovo, Dell)."

El bloque declara **solo el marco IT**; en `mixta` NO se agrega texto de control
interno ERP (Decisión 1, R11). En `erp` no se llama al helper y no aparece bloque
alguno (R10).

Se reutiliza la clase `.callout` ya definida en `STYLE` (no agrega CSS nuevo →
menor impacto en snapshots; cero impacto en ERP).

### 3.4 Celda Norma en hallazgos IT — R3

El render de filas de hallazgos **IT** (`render-it.ts` / `renderHallazgosItPage`)
agrega una celda `<td>` con `e(norma)` (§3.2) después de la celda de score. La
columna queda como **lectura del canónico** (no editable), igual que el score
(sin `contenteditable`, R30 de #14 intacto). El render de hallazgos ERP
(`render-erp.ts`, `renderHallazgosErpPage`) **no se toca**.

## 4. Layout de la tabla de hallazgos (PDF) — solo tabla IT

> La columna Norma se agrega **únicamente** a la tabla de hallazgos IT
> (`render-it.ts`: `renderInformeIt` + `renderHallazgosItPage`). La tabla ERP
> (`render-erp.ts` y `renderHallazgosErpPage` de mixto) **no cambia** (Decisión 1,
> R3c, R6).

Tabla IT actual: `Sección (42%) · Score (14%) · Doc. (14%) · Controles (16%) ·
Madurez (14%)`. Se agrega **Norma**. Reparto propuesto para no romper el ancho A4
(~174mm útiles):

`Sección 30% · Norma 16% · Score 12% · Doc. 12% · Controles 16% · Madurez 14%`.

La columna Norma va inmediatamente después del nombre de sección (lectura
natural: "esta sección se mide contra esta norma"). En `mixta`, las páginas IT
usan este layout; las páginas ERP conservan el layout actual sin columna Norma.

## 5. Ubicación del bloque de metodología (decisión)

**Decisión: franja compacta (`.callout`) dentro de la página de Hallazgos**, no
una página nueva ni la portada. **Confirmada por la puerta humana (Decisión 2).**
Aplica solo a la página de Hallazgos IT (no a ERP).

Justificación:
- El template A4 tiene paginación fija (`render-shared.ts` STYLE:
  `min-height:297mm; max-height:297mm; overflow:hidden` con
  `page-break-after:always`). Agregar una página nueva renumera todas las
  páginas siguientes y rompe todos los `footer('NN')` hardcodeados y los
  snapshots de forma masiva.
- La portada (`.cover`) es densa y de impacto; meter un párrafo metodológico ahí
  la ensucia y obliga a tocar `tituloPortada`/meta.
- La página de Hallazgos es el lugar semánticamente correcto: el lector ve la
  norma por fila y, al pie de la tabla, el marco que la respalda. La franja
  `.callout` cabe debajo de "Lectura transversal" sin agregar página.

Alternativa descartada: **página de metodología dedicada**. Se descarta porque
obliga a renumerar páginas (`02`…`06`), reescribir todos los `footer()` y
regenerar todos los snapshots por desplazamiento, con alto riesgo de regresión
visual no controlada — justo lo que el acceptance pide evitar.

## 6. Manejo de snapshots (R12, controlado)

Hay 4 archivos `.snap` que tocan el render:
`informe-render.test.ts.snap` (ERP), `informe-render-it.test.ts.snap` (IT),
`informe-web-render.test.ts.snap` (web), `canonical-contract.test.ts.snap`.

- `canonical-contract.test.ts.snap`: **no debe cambiar** — el canónico ya tenía
  `standard_ref`; esta feature no toca `build.ts`/`schema.ts`. Si cambia, es un
  error y se detiene.
- **`informe-render.test.ts.snap` (ERP puro): NO debe cambiar** (Decisión 1, R3c,
  R10). El informe ERP no agrega columna Norma ni metodología. Si este snapshot
  cambia, es regresión y se detiene. Esto se valida con un test explícito de que
  el snapshot ERP es idéntico (ver §6 test dedicado).
- `informe-render-it.test.ts.snap` (IT) y `informe-web-render.test.ts.snap` (web):
  cambian **solo** por el agregado de la columna Norma IT y la franja de
  metodología IT. La actualización es deliberada:
  1. Antes de actualizar, un test de aserción explícita (no-snapshot) verifica
     que los **valores de score/semáforo no cambiaron** (R12) y que aparece la
     norma esperada por fila IT (R5, R13).
  2. Recién entonces `vitest -u` regenera **solo** los snapshots IT y web.
  3. El diff del `.snap` se revisa: debe contener únicamente `<th>Norma`,
     celdas de norma IT y el `.callout` de metodología IT; cualquier otro cambio
     es regresión.

Se agrega un test dedicado `tests/informe-normas.test.ts` con aserciones
explícitas (independientes del snapshot) para R1–R14, de modo que el snapshot no
sea la única red de seguridad. Incluye **explícitamente** la aserción de que el
HTML del informe **ERP puro no cambió** (no contiene `<th>Norma` ni `.callout` de
metodología; sus scores/semáforos son idénticos al fixture).

## 7. Web pública (#15) — R4, R8

`web-render.ts` `renderHallazgos` (línea ~286) ya arma `sectionByCode` desde
`model.secciones`. Se agrega la norma **solo en filas IT** (al `detail` o como
pieza propia del `.score-info`, manteniendo el layout `score-row`); las filas ERP
quedan sin norma. El bloque de metodología web (marco IT) se inserta como
sección/`legend` adicional al final de hallazgos **solo cuando hay contexto IT**
(`it`/`mixta`), coherente con el estilo `reveal`. Una web de auditoría `erp` pura
no muestra norma ni metodología. Snapshot web actualizado igual que §6.

## 8. Prompt de IA — R15, R16, R17 (firme)

> Actualizado tras la puerta humana (Decisión 3): el prompt **SÍ se toca**.

Se modifica `src/lib/server/informe/prompts/generate-report.ts`:
- Se agrega al texto del prompt una instrucción para contexto IT/mixta: usar el
  `standard_ref` del canónico al nombrar la norma de cada sección y **nunca
  inventar una norma**. Texto orientativo (exacto a fijar en implementación, sin
  jerga prohibida): *"Al referir la norma o estándar de una sección, usá
  exclusivamente el `standard_ref` provisto en el canónico (p. ej. `CIS N · NIST:
  fase`). Nunca inventes ni completes una norma que no esté en el dato."* (R15).
- Se sube la constante `INFORME_PROMPT_VERSION` de `'2.1'` a `'2.2'`
  (`generate-report.ts:11`) porque cambia el texto enviado al modelo (R16). El
  sufijo dinámico (`+rag`/`+catalogo`/`+fewshot`) que arma `buildPromptVersion`
  se mantiene tal cual sobre la nueva base `2.2`.
- El pipeline sin contexto extra sigue verde (R17), cubierto por
  `tests/informe-pipeline.test.ts`; el test del prompt
  (`tests/informe-prompt.test.ts`) se actualiza para verificar la nueva
  instrucción y `INFORME_PROMPT_VERSION === '2.2'`.

## 9. Errores

No se introducen errores de dominio nuevos. La presentación de norma IT es total
(`trim()` inline, nunca lanza; celda vacía si falta el dato).
`buildInformeRenderModel` mantiene su único throw existente
("El informe no tiene borrador para renderizar").

## 10. Trazabilidad de archivos ↔ requirements

| Archivo | Requirements |
|---|---|
| `render-shared.ts` (tipo `secciones[].standardRef`, `renderMetodologiaBlock` IT/mixta, helper de filas IT) | R1, R5, R7, R9, R11, R13, R14 |
| `server/informe/model.ts` | R1, R2 |
| `render-erp.ts` (**sin cambios**) | R3c, R6, R10 (no-regresión ERP) |
| `render-it.ts` | R3, R5, R7, R9, R13 (+ mixto-IT vía `renderHallazgosItPage`) |
| `render-mixto-parts.ts` / `render-mixto.ts` | R3, R3b, R6, R7, R11 |
| `web-render.ts` | R4, R8, R9, R11 |
| `generate-report.ts` (**firme**) | R15, R16, R17 |
| tests + snapshots | R3c, R10, R12 y verificación de todos |

## 11. Decisiones de la puerta humana (2026-06-17)

1. **ERP sin columna Norma (Decisión 1).** La columna "Norma" y el bloque de
   metodología son **solo IT** (auditorías `it` y secciones/páginas IT de
   `mixta`). El informe ERP puro queda **idéntico** (sin columna Norma, sin
   metodología, snapshot `informe-render.test.ts.snap` sin cambios). En `mixta`,
   las páginas ERP no llevan columna Norma y el bloque de metodología declara
   **solo marco IT**. Se **elimina** el helper `normaLabel` y la etiqueta
   `Control interno`: `render-erp.ts` ya no se toca; `render-mixto-parts.ts` solo
   toca la parte IT. Afecta §2, §3.2, §3.3, §3.4, §4, §6, §7, §10.
2. **Ubicación del bloque de metodología (Decisión 2).** Franja compacta
   (`.callout`) en la página de Hallazgos IT (§5). Confirmada, sin página nueva.
3. **Sí se toca el prompt (Decisión 3).** `generate-report.ts` se modifica
   (instrucción usar `standard_ref`/no inventar normas, IT/mixta) y
   `INFORME_PROMPT_VERSION` sube de `2.1` a `2.2` (§8). R15/R16 firmes; R17 se
   mantiene.
