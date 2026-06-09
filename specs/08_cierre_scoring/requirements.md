# Requirements — #8 08_cierre_scoring

> Motor de scoring determinístico (3 niveles), pantalla de cierre, preview del informe y confirmación/reapertura.
> Depende de: `02_modelo_datos` (#2), `03_auth_roles` (#3), `04_backoffice` (#4), `07_form_tecnico` (#7).
> Fuera de alcance: endpoint JSON canónico versionado (`09_contrato_datos` #9), informe final branded/PDF/Loom (SPEC-08), scoring de inventario con IA generativa (v2).

## R1 — Puntaje por ítem según rúbrica y field_type

El sistema DEBE calcular el puntaje 0–100 de cada ítem con `scores=true` y `na=false` aplicando reglas determinísticas por `field_type`: `bool` (true→100, false→0), `tri` (`si`→100, `parcial`→50, `no`→0), `select`/`multiselect` vía `options.score_map`, `number`/`percent`/`money` vía `options.thresholds`, e ítems `text`/`list`/`file_ref`/`date`/`datetime` con `scores=false` no aportan puntos salvo penalización por `required=true` sin respuesta (puntaje 0).

**Verificación:** `tests/scoring/item-score.test.ts > maps each field_type and rubric to 0|50|100`.

## R2 — Score de sección ponderado por ítems

El sistema DEBE calcular `score_sección` como `Σ(puntos_ítem × item_weight) / Σ(item_weight)` considerando solo ítems que puntúan (`scores=true`) y con `na=false`; el resultado DEBE redondearse a entero 0–100.

**Verificación:** `tests/scoring/section-score.test.ts > weighted average excludes na and non-scoring items`.

## R3 — Factores de peso de sección automáticos

El sistema DEBE aplicar factores fijos al `section.weight` sin intervención humana: `bajo=1`, `medio=2`, `alto=3`, `muy_alto=5`.

**Verificación:** `tests/scoring/template-index.test.ts > applies weight factors bajo1 medio2 alto3 muy_alto5`.

## R4 — Índice por plantilla excluyendo CAB y secciones N/A

El sistema DEBE calcular el índice de cada plantilla congelada en `audit.template_ids` como `Σ(score_sección × factor_peso) / Σ(factores)` sobre secciones con `has_score=true`, excluyendo la sección `CAB` y secciones cuyos ítems obligatorios de scoring están todos marcados `na=true`.

**Verificación:** `tests/scoring/template-index.test.ts > excludes CAB and all-na sections from denominator`.

## R5 — Índices IT y ERP independientes

El sistema DEBE persistir en `audit_closure` los campos `indice_it` e `indice_erp` como enteros 0–100 o `null` cuando el tipo no aplica; NO DEBE calcular ni persistir un índice global combinado.

**Verificación:** `tests/scoring/template-index.test.ts > combo audit stores separate it and erp indices without global`.

## R6 — Scoring EOL de inventario hardware

CUANDO un ítem `field_type=table` de inventario puntúa, el sistema DEBE asignar por fila: soporte vigente del fabricante→100, soporte extendido→50, fuera de soporte (EOL)→0; SI no hay dato de fabricante, ENTONCES el sistema DEBE usar fallback por antigüedad: PC/notebook (<3a→100, 3–5a→50, >5a→0), servidor/switch/firewall/red (<4a→100, 4–6a→50, >6a→0); el puntaje del ítem DEBE ser el promedio entero de las filas que puntúan.

**Verificación:** `tests/scoring/inventory-eol.test.ts > eol status and age fallback produce deterministic row scores`.

## R7 — Persistencia calculada en audit_section_score

CUANDO se recalcula el scoring de una auditoría, el sistema DEBE upsert en `audit_section_score` el `score` calculado y un `score_breakdown` jsonb con aporte por `item_id` (puntos, peso, regla aplicada); el técnico NO DEBE poder editar el campo `score` manualmente.

**Verificación:** `tests/scoring/persist-section-score.test.ts > upserts calculated score and breakdown; manual score rejected`.

## R8 — Determinismo reproducible

El sistema DEBE producir idénticos `score`, `score_breakdown`, `indice_it` e `indice_erp` ante el mismo conjunto de respuestas, plantillas congeladas y timestamps de referencia fijos en tests.

**Verificación:** `tests/scoring/determinism.test.ts > same fixture run twice yields identical outputs`.

## R9 — Semáforo de índices

El sistema DEBE clasificar cada índice 0–100 con semáforo: 🟢 70–100, 🟠 40–69, 🔴 0–39.

**Verificación:** `tests/scoring/semaphore.test.ts > maps index ranges to green amber red`.

## R10 — Transición a en_cierre dispara recálculo

CUANDO una auditoría pasa de `en_relevamiento` a `en_cierre`, el sistema DEBE recalcular y persistir todos los `audit_section_score` e índices en `audit_closure` antes de mostrar la pantalla de cierre.

**Verificación:** `tests/api/closure-transition.test.ts > entering en_cierre persists section scores and indices`.

## R11 — Acceso a pantalla de cierre

MIENTRAS `audit.status = 'en_cierre'`, el sistema DEBE permitir acceso a `/auditorias/[id]/cierre` a usuarios con rol `admin` o `tecnico` asignado a la auditoría.

**Verificación:** `tests/api/closure-routes.test.ts > assigned tech and admin can load closure; others 403`.

## R12 — Visualización de índices y scores por sección

CUANDO el usuario accede a la pantalla de cierre, el sistema DEBE mostrar `indice_it`, `indice_erp` (si aplican) con semáforo y la lista de secciones con score calculado y observaciones editables.

**Verificación:** `tests/api/closure-page.test.ts > closure load includes indices and section scores`.

## R13 — Top 5 riesgos

CUANDO el usuario guarda el formulario de cierre, el sistema DEBE persistir hasta 5 entradas en `audit_closure.top_risks` como objetos `{ text: string, severity: 'baja' | 'media' | 'alta' | 'critica' }` validados por Zod.

**Verificación:** `tests/api/closure-save.test.ts > saves up to five risks with severity enum`.

## R14 — Quick wins

CUANDO el usuario guarda el formulario de cierre, el sistema DEBE persistir `audit_closure.quick_wins` como lista de strings (máximo 10 entradas no vacías).

**Verificación:** `tests/api/closure-save.test.ts > saves quick wins array`.

## R15 — Hallazgos de upsell internos

CUANDO un usuario `admin` o `tecnico` guarda el formulario de cierre, el sistema DEBE persistir `audit_closure.upsell_findings` como lista de strings; estos datos NO DEBEN exponerse en rutas públicas ni en el briefing del cliente.

**Verificación:** `tests/api/closure-save.test.ts > upsell persisted; tests/briefing-load.test.ts > upsell absent from public briefing`.

## R16 — Próximo paso acordado

CUANDO el usuario guarda el formulario de cierre, el sistema DEBE persistir `audit_closure.next_step` como texto libre (máximo 2000 caracteres).

**Verificación:** `tests/api/closure-save.test.ts > saves next_step with max length`.

## R17 — Preview del informe en la app

CUANDO el usuario solicita preview en la pantalla de cierre, el sistema DEBE renderizar una vista legible (HTML en la app) con cabecera del cliente, índices con semáforo, scores por sección, top riesgos, quick wins y próximo paso, sin incluir hallazgos de upsell.

**Verificación:** `tests/api/closure-preview.test.ts > preview includes client indices risks wins next_step; excludes upsell`.

## R18 — Advertencia blanda en campos vacíos

CUANDO el usuario confirma el cierre con `top_risks`, `quick_wins` o `next_step` vacíos, el sistema DEBE mostrar advertencia de confirmación pero NO DEBE bloquear el cierre.

**Verificación:** `tests/api/closure-confirm.test.ts > confirm with empty fields shows warning and succeeds`.

## R19 — Confirmar cierre

CUANDO un `admin` o técnico asignado confirma el cierre desde `en_cierre`, el sistema DEBE setear `audit.status = 'cerrada'`, `audit_closure.closed_at` con timestamp UTC y `audit_closure.closed_by` con el usuario de sesión.

**Verificación:** `tests/api/closure-confirm.test.ts > confirm sets cerrada closed_at closed_by`.

## R20 — Invalidación de token al cerrar

CUANDO una auditoría pasa a `cerrada`, el sistema DEBE invalidar el briefing seteando `audit.public_token = NULL`.

**Verificación:** `tests/api/closure-confirm.test.ts > closed audit has null public_token; briefing route shows friendly error`.

## R21 — Reapertura solo admin

CUANDO un usuario con rol `admin` reabre una auditoría `cerrada`, el sistema DEBE transicionar a `en_cierre`, limpiar `closed_at` y `closed_by`, y NO DEBE regenerar `public_token` automáticamente.

**Verificación:** `tests/api/closure-reopen.test.ts > admin reopen to en_cierre clears closed fields; tecnico gets 403`.

## R22 — Bloqueo de edición en cerrada

SI `audit.status = 'cerrada'`, ENTONCES el sistema NO DEBE permitir editar respuestas de relevamiento ni el formulario de cierre salvo la acción admin de reabrir.

**Verificación:** `tests/api/closure-routes.test.ts > closed audit closure page read-only except admin reopen`.

## R23 — Score en vivo para form técnico (solo lectura)

El sistema DEBE exponer una función de dominio reutilizable que devuelva scores por sección e índices parciales para una auditoría en `en_relevamiento` o posterior, sin persistir hasta la transición a `en_cierre` (salvo recálculo explícito en cierre).

**Verificación:** `tests/scoring/live-score.test.ts > computeLiveScores matches full engine on same input`.
