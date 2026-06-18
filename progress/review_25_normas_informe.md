# Review — feature 25 (25_normas_informe)

**Veredicto:** APPROVED

Revisor independiente (no se confió en el reporte del implementer; toda la verificación
se reprodujo). Fecha: 2026-06-17.

## Verificación reproducida

- `pnpm run check` → **0 ERRORS**, 31 warnings (Svelte `state_referenced_locally`,
  preexistentes y ajenos a #25).
- `pnpm run build` → ✓ built (adapter-node), OK.
- `pnpm exec vitest run tests/informe-*.test.ts` → **15 files, 141 passed**.
- `pnpm exec vitest run tests/informe-render.test.ts tests/canonical-contract.test.ts`
  → **15 passed**; snapshots ERP y canónico sin escritura/obsoletos.
- Postgres (`db-db-1`) activo (lo requiere el global-setup de vitest).
- Check independiente del revisor (test efímero): render ERP puro NO contiene
  `data-canonical="norma"`, NO contiene `data-metodologia`, NO matchea `/ERP [BE]\d/`.

## Puntos críticos (los 5 pedidos)

1. **No regresión ERP** — CONFIRMADO. `render-erp.ts`, `render-mixto-parts.ts` y
   `render-mixto.ts` NO están en el diff (`git diff --name-only HEAD`). Los snapshots
   `informe-render.test.ts.snap` (ERP) y `canonical-contract.test.ts.snap` NO cambiaron
   (sin cambios en git, tests verdes sin reescritura). Aislamiento por
   `withNorma=false` por defecto en `renderHallazgosFilas`: los call sites ERP emiten
   HTML byte-idéntico. Test explícito de no-regresión ERP presente (T10 /
   `informe-normas.test.ts` describe "no-regresión ERP").
2. **Scoring intacto (R12)** — CONFIRMADO. Ningún archivo de scoring/cierre en el diff.
   Diff de snapshot IT: los `data-canonical="score"` (20/100/55) son idénticos antes y
   después (solo se insertó la celda Norma). Snapshot web sin tocar líneas de score.
   Test R12 verde.
3. **Norma solo en IT / mixta-IT (R3, R3b, R3c, R13)** — CONFIRMADO. `<th>Norma` y celda
   `data-canonical="norma"` aparecen en `renderInformeIt` y `renderHallazgosItPage`
   (mixta-IT); página ERP del mixto conserva header clásico (`Circuito 42%`) sin Norma;
   ERP puro sin columna. Sección IT sin `standard_ref` → `<td data-canonical="norma"></td>`
   (celda vacía, sin lanzar). Tests verdes.
4. **Prompt (R15, R16, R17)** — CONFIRMADO. `generate-report.ts` agrega instrucción
   "usá exclusivamente el standard_ref / Nunca inventes" en `SYSTEM_PROMPT_CLIENTE_IT` y
   `_MIXTA` (no en interna/ERP). `INFORME_PROMPT_VERSION` = `'2.2'`. Pipeline sin
   contexto extra sigue verde (`informe-pipeline.test.ts`, promptVersion 2.2). Tests de
   prompt y pipeline actualizados y verdes.
5. **Snapshots IT/web acotados** — CONFIRMADO. El diff de ambos snapshots contiene
   únicamente: `<th ...>Norma</th>`, celdas `<td data-canonical="norma">CIS …</td>`,
   reajuste de anchos (30/16/12/12/16/14) y el `.callout`/`.legend`
   `data-metodologia="it"`. Cero cambios colaterales (filtro de grep de cambios
   inesperados: vacío).

## Trazabilidad R ↔ test (verificada)

- R1: [x] informe-normas.test.ts > buildInformeRenderModel expone standardRef crudo / null
- R2: [x] informe-normas.test.ts > standardRef crudo del canónico (A1, A4)
- R3: [x] informe-normas.test.ts > tabla de hallazgos IT tiene columna Norma
- R3b: [x] informe-normas.test.ts > página IT del mixto tiene Norma / página ERP NO tiene
- R3c: [x] informe-normas.test.ts > ERP NO contiene columna Norma + snapshot ERP intacto
- R4: [x] informe-normas.test.ts > filas IT muestran norma / web ERP pura sin norma
- R5: [x] informe-normas.test.ts > cada fila IT muestra el standard_ref tal cual (CIS 4 · NIST: Protect)
- R6: [x] informe-normas.test.ts > ERP del mixto sin Norma / R14 sin nomenclatura cruda
- R7: [x] informe-normas.test.ts > bloque de metodología IT presente (PDF + web)
- R8: [x] informe-normas.test.ts > web: metodología IT presente
- R9: [x] informe-normas.test.ts > metodología declara marco IT (CIS v8 + NIST + HPE/Lenovo/Dell)
- R10: [x] informe-normas.test.ts > ERP NO contiene metodología + snapshot ERP intacto
- R11: [x] informe-normas.test.ts > metodología solo marco IT, sin "control interno ERP"
- R12: [x] informe-normas.test.ts > scores del render salen del canónico, intactos (IT/ERP/mixta) + snapshots score sin cambio
- R13: [x] informe-normas.test.ts > IT sin standard_ref → celda Norma vacía y no lanza
- R14: [x] informe-normas.test.ts > no expone `ERP B\d`/`ERP E\d` (IT/mixta/ERP/web) + verificación independiente del revisor
- R15: [x] informe-prompt.test.ts > instruye usar standard_ref y no inventar normas (IT/mixta)
- R16: [x] informe-prompt.test.ts > INFORME_PROMPT_VERSION === '2.2' (+ resolvePromptVersion)
- R17: [x] informe-pipeline.test.ts > pipeline sin contexto verde, promptVersion 2.2

## Tasks

- T1: [x]  T2: [x]  T3: [x]  T4: [x]  T5: [x]  T6: [x]  T7: [x]
- T8: [x]  T9: [x]  T10: [x]  T11: [x]  T12: [x]  T13: [x]

Todas las tasks `[x]` en `specs/25_normas_informe/tasks.md`.

## Checkpoints (C1–C6)

- C1: [x] arnés completo (AGENTS.md, init.sh, feature_list.json, progress/current.md, docs/*).
- C2: [~] "2 in_progress" (#12 parqueado + #25) PREEXISTENTE y aceptado por Martín — no
  cuenta como rechazo de #25 (decisión registrada). Resto coherente.
- C3: [x] sin ORM/queries raw nuevos, sin console.log de debug ni secretos en el diff de #25.
- C4: [x] tests cubren funciones públicas tocadas; vitest > 0 y verde (141/141 informe).
- C5: [x] sin artefactos sospechosos del feature; `progress/impl_25_normas_informe.md`
  documenta la sesión (los `scripts/limpieza-*.sql` sin trackear son ajenos a #25).
- C6: [x] feature sdd con `specs/25_normas_informe/{requirements,design,tasks}.md`;
  EARS estricto; tasks `[x]`; cada R cubierto por test.

## Cambios requeridos

Ninguno.

## Nota para el leader

- Estado de #25 y commit los gestiona el leader (este review no toca `feature_list.json`
  ni commitea, por instrucción).
- La condición `>1 in_progress` de `./init.sh` es preexistente (#12 parqueado) y no se
  considera rechazo de #25.
