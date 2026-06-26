# Review — feature 46_paridad_informe_gold

**Veredicto:** CHANGES_REQUESTED

> El código y los tests están completos y correctos. El rechazo es por higiene SDD:
> tasks.md sin marcar y falta el archivo de trazabilidad R↔test mandado por T25.
> No hay bloqueantes de código.

## Trazabilidad R↔test (todos verdes)

- R1: [x] tabla equip-table de seguridad presente (#46 R1–R4) + snapshot `seguridad-presente`
- R2: [x] omite tabla sin sección de seguridad + snapshot `seguridad-ausente`
- R3: [x] datos solo del canónico/`deriveSeguridad`; test "no expone material interno (R3, R18)"
- R4: [x] escape de celdas con escapeHtml (test `<script>`/`&`)
- R5: [x] pasos numerados steps/step/sn
- R6: [x] excl-grid con dos excl-box necesitamos/no_incluye
- R7: [x] omite pasos cuando proximos_pasos vacío
- R8: [x] no renderiza twocol (markup eliminado; CSS muerto en STYLE, nit menor)
- R9: [x] timeline vertical tl/tl-item con > umbral
- R10: [x] horizontal tl-h conservado con <= umbral
- R11: [x] escape semana/titulo/descripcion
- R12: [x] @page A4 portrait + saltos de página
- R13: [x] gauge final estático (--gauge-final + gauge-num-print)
- R14: [x] barras/contadores en valor final estático (printBarWidths, data-count con número real)
- R15: [x] tema claro print, hero azul, acentos --sys-*
- R16: [x] break-inside avoid en card/score-row/risk/fix/tabla/step/tl-item/excl-box
- R17: [x] tokens --sys-* en todo el contenido nuevo
- R18: [x] schema strict() + test sin upsell/recomendaciones
- R19: [x] 36 tests de informe-web-render verdes; snapshots intencionales

## Tasks (BLOQUEANTE)

- T1–T25: [ ] — las 25 tasks siguen sin marcar `[x]` en `specs/46_paridad_informe_gold/tasks.md`.

## Checkpoints

- C1: [x] arnés completo; init.sh corre (ver nota C4)
- C2: [x] estado coherente
- C3: [x] sin ORM, sin console.log de debug, sin secretos
- C4: [~] init.sh termina ROJO por 1 test, pero `tests/canonical-contract.test.ts > canonical JSON matches snapshot`
  falla IDÉNTICO en master (1305 ok) → pollution/orden de la suite completa, ajeno a #46.
  Aislados pasan: canonical-contract (2/2), encuesta-schema (10/10), informe-web-render (36/36).
- C5: [x] sin archivos basura
- C6: [~] specs/ completo y EARS ok; PERO C6 exige "todas las tasks [x]" → falla por tasks sin marcar.

## Cambios requeridos

1. Marcar T1–T25 como `[x]` en `specs/46_paridad_informe_gold/tasks.md` (el trabajo está hecho;
   los checkboxes no se actualizaron).
2. Crear `progress/impl_46_paridad_informe_gold.md` con la trazabilidad R↔test (mandado explícitamente
   por T25). Hoy no existe.
3. (Nit, no bloqueante) Eliminar el CSS muerto `.twocol` del STYLE en `web-render.ts`, ya que el
   markup fue removido por R8.

## Nota sobre la suite

El leader reportó que la única falla era `tests/encuesta-schema.test.ts` (R6 #47). Eso es incorrecto:
la falla real es `tests/canonical-contract.test.ts > canonical JSON matches snapshot`. Igual la
conclusión se sostiene: reproduce idéntica en master, es flake de orden de la suite completa y NO es
atribuible a #46. No cuenta en contra del código de esta feature.
