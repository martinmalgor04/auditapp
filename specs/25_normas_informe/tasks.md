# Tasks — 25_normas_informe

> Orden de implementación. Cada task referencia los `R<n>` que cubre.
> No se toca scoring, schema canónico, migraciones ni seeds.
> Recordatorio: snapshots se actualizan **conscientemente** (T12), nunca en silencio.
> Actualizado tras la puerta humana (2026-06-17): Norma/metodología **solo IT**;
> ERP intacto; el prompt **sí** se toca (ver §Decisiones en requirements/design).

## Modelo de render

- [x] **T1** — En `src/lib/informe/render-shared.ts`, agregar
  `standardRef: string | null` al tipo de `InformeRenderModel.secciones[]`.
  Cubre: R1.

- [x] **T2** — En `src/lib/server/informe/model.ts`, mapear
  `standardRef: s.standard_ref` dentro del `.map` de `secciones` en
  `buildInformeRenderModel`. Cubre: R1, R2.

- [x] **T3** — En `render-shared.ts`, agregar
  `renderMetodologiaBlock(tipo: 'it' | 'mixta')` que devuelve un `.callout` con
  el marco **IT** (CIS Controls v8 + NIST CSF + ciclos de vida de fabricante), sin
  jerga prohibida y sin CSS nuevo. NO existe variante `erp` ni texto de control
  interno ERP. Cubre: R7, R9, R11.
  > El helper `normaLabel` se **elimina** del alcance (Decisión 1): la norma IT se
  > muestra con `trim()` inline del `standardRef` (vacío si null/empty).

## Norma por sección en hallazgos IT (PDF)

- [x] **T4** — En `render-it.ts`: agregar `<th>Norma` al header de la tabla de
  hallazgos IT, reajustar anchos (design §4), agregar la celda `<td>` Norma
  (lectura, no editable) con el `standardRef` IT (`'CIS N · NIST: fase'` o vacío
  si falta), e insertar `renderMetodologiaBlock('it')` debajo de "Lectura
  transversal" en la página de hallazgos. Aplicar en `renderInformeIt` **y** en
  `renderHallazgosItPage` (reutilizada por mixto). Cubre: R3, R5, R7, R9, R13, R14.

- [x] **T5** — En `render-mixto-parts.ts` / `render-mixto.ts`: confirmar que la
  parte IT del mixto usa el render IT con columna Norma (T4) y que la parte ERP
  (`renderHallazgosErpPage`) queda **sin columna Norma**; el bloque de metodología
  del mixto declara **solo marco IT** (`renderMetodologiaBlock('mixta')`). Cubre:
  R3, R3b, R6, R7, R11.

- [x] **T6** — `render-erp.ts`: **sin cambios** (verificación). Confirmar que el
  informe ERP puro no agrega columna Norma ni metodología y queda idéntico.
  Cubre: R3c, R6, R10 (no-regresión ERP).

## Norma + metodología (web pública #15)

- [x] **T7** — En `web-render.ts` `renderHallazgos`: mostrar la norma por fila
  **solo en filas IT** (vía `standardRef` IT) e insertar el bloque de metodología
  IT **solo cuando hay contexto IT** (`it`/`mixta`). Filas/auditorías ERP sin
  norma ni metodología. Cubre: R4, R8, R9, R11.

## Prompt de IA (firme)

- [x] **T8** — En `src/lib/server/informe/prompts/generate-report.ts`: agregar la
  instrucción para contexto IT/mixta de usar el `standard_ref` del canónico al
  nombrar normas y **nunca inventar** una norma, y subir `INFORME_PROMPT_VERSION`
  de `'2.1'` a `'2.2'`. Actualizar `tests/informe-prompt.test.ts` (verifica la
  instrucción y `INFORME_PROMPT_VERSION === '2.2'`) y confirmar que el pipeline
  sin contexto sigue verde (`tests/informe-pipeline.test.ts`). Cubre: R15, R16, R17.

## Tests (antes de actualizar snapshots)

- [x] **T9** — Crear `tests/informe-normas.test.ts` con aserciones explícitas
  (no-snapshot): `buildInformeRenderModel` expone `standardRef`; HTML IT y web
  contienen `<th>`/celda Norma con el valor esperado por fila IT (`CIS 4 · NIST:
  Protect` para A4); render IT con canónico **sin** `standard_ref` no lanza y
  rinde celda Norma vacía; bloque de metodología IT presente en `it`/`mixta`;
  ninguna salida contiene `ERP B`/`ERP E` crudo. Cubre: R1, R3, R5, R7, R9, R11,
  R13, R14.

- [x] **T10** — En el mismo archivo, aserción de **no-regresión ERP** (Decisión 1):
  el HTML del informe ERP puro NO contiene `<th>Norma` ni el `.callout` de
  metodología, y sus scores/semáforos son idénticos al fixture. Cubre: R3c, R6,
  R10.

- [x] **T11** — Aserción de no-regresión de scoring: los valores
  `data-canonical="score"` y semáforos del render (IT, ERP y mixto) no cambian
  respecto del fixture (comparación de los scores del canónico, no del snapshot).
  Cubre: R12.

## Snapshots (actualización consciente)

- [x] **T12** — Con T9/T10/T11 verdes, regenerar **solo** los snapshots IT y web
  (`informe-render-it`, `informe-web-render`) con `pnpm exec vitest -u <archivos>`.
  Revisar el diff: debe contener únicamente columna Norma IT + bloque metodología
  IT. Confirmar que **`informe-render.test.ts.snap` (ERP) NO cambia** (Decisión 1,
  R3c/R10) y que `canonical-contract.test.ts.snap` **no** cambia. Cubre: R3c, R10,
  R12.

## Cierre

- [x] **T13** — `pnpm run check` 0 errores, `pnpm run build` OK, suite de
  informe verde (`informe-*` + snapshots). Registrar mapa R↔test en
  `progress/impl_25_normas_informe.md`. Cubre: trazabilidad (regla dura).
