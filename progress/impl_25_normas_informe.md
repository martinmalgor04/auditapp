# Impl — 25_normas_informe (implementer, 2026-06-17)

**Estado:** in_progress (puerta humana pasada 2026-06-17). Spec aprobado.
Alcance: exponer `section.standard_ref` en el informe SOLO en contexto IT (auditorías
`it` y páginas/secciones IT de `mixta`). ERP puro idéntico al actual. Se toca el prompt
(`generate-report.ts`) y se sube `INFORME_PROMPT_VERSION` 2.1→2.2. NO se toca scoring.

> Nota de entorno/arnés: #12 `reunion_asistente` está parqueado a propósito en
> `in_progress`; con #25 hay 2 in_progress → `./init.sh §3` reporta ">1 in_progress"
> (PREEXISTENTE/aceptado). Verifico #25 con suite de tests + check + build, no por exit
> de init.sh. NO commit/push (decisión de Martín). NO toco estado de #25 ni #12.

## Plan de tasks (specs/25_normas_informe/tasks.md) — TODAS COMPLETAS
- [x] T1 — `render-shared.ts`: `standardRef: string|null` en `secciones[]` (R1)
- [x] T2 — `model.ts`: mapear `standardRef: s.standard_ref ?? null` (R1, R2)
- [x] T3 — `render-shared.ts`: `renderMetodologiaBlock('it'|'mixta')` + param `withNorma`
      en `renderHallazgosFilas` (default false → ERP intacto) (R7, R9, R11)
- [x] T4 — `render-it.ts`: `<th>Norma` (anchos 30/16/12/12/16/14) + celda
      `<td data-canonical="norma">` + `renderMetodologiaBlock` en `renderInformeIt`
      y `renderHallazgosItPage` (R3, R5, R7, R9, R13, R14)
- [x] T5 — `render-mixto*`: la parte IT usa `renderHallazgosItPage` (Norma + metodología
      'mixta'); ERP `renderHallazgosErpPage` sin Norma (withNorma=false) (R3, R3b, R6, R7, R11)
- [x] T6 — `render-erp.ts`: SIN cambios (call site usa default withNorma=false) (R3c, R6, R10)
- [x] T7 — `web-render.ts`: norma en filas IT (detail) + legend metodología solo it/mixta (R4, R8, R9, R11)
- [x] T8 — `generate-report.ts`: instrucción standard_ref en IT+mixta, versión 2.1→2.2;
      tests prompt+pipeline actualizados a 2.2 (R15, R16, R17)
- [x] T9 — `tests/informe-normas.test.ts` aserciones explícitas (R1,R3,R5,R7,R9,R11,R13,R14)
- [x] T10 — no-regresión ERP en el mismo test (R3c, R6, R10)
- [x] T11 — no-regresión scoring (R12)
- [x] T12 — snapshots IT + web regenerados conscientemente; ERP y canonical-contract NO cambian (R3c, R10, R12)
- [x] T13 — check 0 errores + build OK + suite informe 141/141 verde + mapa R↔test

## Verificación real (2026-06-17)
- `pnpm run check`: 1083 files, **0 ERRORS**, 31 warnings (pre-existentes Svelte state, ajenos).
- `pnpm run build`: ✓ built (adapter-node).
- `pnpm exec vitest run tests/informe-*.test.ts`: **15 files, 141 passed**.
- Snapshots: `informe-render-it` + `informe-web-render` actualizados (solo columna Norma IT
  + celda `data-canonical="norma"` + `.callout`/legend metodología IT). `informe-render.test.ts.snap`
  (ERP puro) y `canonical-contract.test.ts.snap` **NO cambiaron** (verificado por diff y por test verde).
- Entorno: Postgres (`db-db-1`) levantado con `pnpm db:up` (lo necesita el global-setup de vitest).

## Trazabilidad R↔test
- R1 → `informe-normas.test.ts > buildInformeRenderModel expone standardRef crudo` + `> standardRef null`
- R2 → `informe-normas.test.ts > buildInformeRenderModel expone standardRef crudo del canónico (R1, R2)`
- R3 → `informe-normas.test.ts > tabla de hallazgos IT tiene columna Norma`
- R3b → `informe-normas.test.ts > página IT del mixto tiene columna Norma` + `> página ERP del mixto NO tiene columna Norma`
- R3c → `informe-normas.test.ts > NO contiene columna Norma (R3c, R6)` + snapshot ERP intacto (`informe-render.test.ts`)
- R4 → `informe-normas.test.ts > filas IT muestran norma` + `> web ERP pura: sin norma ni metodología`
- R5 → `informe-normas.test.ts > cada fila IT muestra el standard_ref tal cual` (CIS 4 · NIST: Protect para A4)
- R6 → `informe-normas.test.ts > página ERP del mixto NO tiene columna Norma` + `> NO contiene columna Norma`
- R7 → `informe-normas.test.ts > bloque de metodología IT presente` (PDF IT y mixta)
- R8 → `informe-normas.test.ts > filas IT muestran norma; metodología IT presente` (web)
- R9 → `informe-normas.test.ts > bloque de metodología IT presente (R7, R9)`
- R10 → `informe-normas.test.ts > NO contiene bloque de metodología (R10)` + snapshot ERP intacto
- R11 → `informe-normas.test.ts > bloque de metodología declara solo marco IT, sin control interno ERP`
- R12 → `informe-normas.test.ts > los scores del render salen del canónico, intactos (IT, ERP, mixta)`
       + `informe-render.test.ts` y `canonical-contract.test.ts` snapshots sin cambio
- R13 → `informe-normas.test.ts > standardRef null cuando el canónico no lo trae`
       + `> IT sin standard_ref → celda Norma vacía y no lanza`
- R14 → `informe-normas.test.ts > no expone nomenclatura interna ERP cruda` (IT, mixta, ERP, web)
- R15 → `informe-prompt.test.ts > instruye usar standard_ref del canónico y no inventar normas en IT/mixta`
- R16 → `informe-prompt.test.ts > exporta versión 2.2` + `resolvePromptVersion` devuelve 2.2(+...)
- R17 → `informe-pipeline.test.ts` (pipeline sin contexto sigue verde; promptVersion 2.2)

## Notas de implementación
- La columna Norma se aisló con un parámetro `withNorma=false` por defecto en
  `renderHallazgosFilas` (render-shared.ts). Los call sites ERP (`render-erp.ts`,
  `render-mixto-parts.ts:renderHallazgosErpPage`) no se tocan y emiten el mismo HTML →
  snapshot ERP byte-idéntico. Solo las funciones IT (`renderInformeIt`,
  `renderHallazgosItPage`) pasan `withNorma=true` y añaden `<th>Norma`.
- `renderMetodologiaBlock(tipo)` ignora `tipo` a propósito: el texto IT es idéntico para
  `it` y `mixta` (Decisión 1: solo marco IT, sin control interno ERP). El parámetro se
  conserva por firma del design §3.3 y para expresar intención en el call site.
- NO se modificó scoring, schema canónico, build.ts, migraciones ni seeds.
- NO commit/push. NO toqué estado de #25 ni #12 en feature_list.json.

## Estado final
#25 implementada y verde, a espera de reviewer. Resumen de salida: `done -> progress/impl_25_normas_informe.md`
