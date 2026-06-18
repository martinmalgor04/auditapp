# Sesión actual

## Feature implementada: #27 27_hora_inicio_fin (implementer, 2026-06-17) — COMPLETO, a espera de reviewer

**Estado:** in_progress. T1..T12 marcadas `[x]` en `specs/27_hora_inicio_fin/tasks.md`.
Trazabilidad R1–R16 ↔ test en `progress/impl_27_hora_inicio_fin.md`.

**Qué se hizo:** migración SQL idempotente `018_hora_inicio_fin.sql` agrega `started_at`/`finished_at`
a `audit`. `stampStartedAt()` se llama fire-and-forget en el `load` del form (primer acceso al
relevamiento). `stampFinishedAt()` se llama en `completeRelevamiento()` antes de `setAuditStatus`.
Ambas funciones usan `WHERE ... IS NULL` (atómico, sin race condition). `updateAuditSchema` extendido
con `startedAt?`/`finishedAt?` + refinement `fin ≥ inicio`. `AuditDetail` expone las fechas; la ruta
de detalle las expone al Svelte y muestra el bloque "Visita" con `formatVisita()`. `InformeRenderModel`
tiene `visita?` opcional; `buildInformeRenderModel()` acepta `timestamps?` como segundo arg. Los tres
renders (IT, ERP, web) insertan el bloque de visita sin generar whitespace cuando está ausente
(preserva snapshots existentes).

**Verificación:** `pnpm run check` 0 errores; `pnpm test` 185 test files / 944 passed / 2 skipped.
`tests/hora-inicio-fin.test.ts` 21/21 verde. Snapshots ERP/IT/web sin cambio cuando visita=undefined.
NO commit/push.

---

## Feature implementada: #26 26_feedback_inventario (implementer, 2026-06-17) — COMPLETO, a espera de reviewer

**Estado:** in_progress. T1..T12 marcadas `[x]` en `specs/26_feedback_inventario/tasks.md`.
Trazabilidad R1–R15 ↔ test en `progress/impl_26_feedback_inventario.md`.

**Qué se hizo:** micro-feedback visual al guardar una fila de la grilla de inventario, derivado del
autosave existente (sin segunda fuente de verdad). Lógica pura extraída en `field-table-feedback.ts`
(testeable sin DOM). `field-table.svelte` recibe prop `saveState`, mantiene `lastSavedRowId` (OQ1:
última fila accionada), usa `$effect` con timer 1000ms para revertir "Guardado ✓"; flash CSS solo
sobre `background-color` (sin layout shift, R7); `prefers-reduced-motion` suprime animación (R13);
región `aria-live="polite"` sr-only por tabla (R12). `field-renderer.svelte` pasa-through la prop.
`+page.svelte` añade `savingItemId` que registra qué ítem está guardando y solo ese ítem-tabla
recibe el estado real; el resto recibe `idle`. Flujo de guardado existente intacto (R14, R15).

**Verificación:** `pnpm run check` 0 errores; `tests/form-table-feedback.test.ts` 19/19 verde;
suite no-regresión (`form-table-camera`, `form-autosave*`, `form-save-indicator`, `form-field-renderer`)
15/15 verde. NO commit/push.

---

## Feature implementada: #30 30_informe_pdf_restyle (implementer, 2026-06-17) — COMPLETO, a espera de reviewer

**Estado:** in_progress. T1..T20 marcadas `[x]` en `specs/30_informe_pdf_restyle/tasks.md`.
Trazabilidad R1–R22 ↔ test en `progress/impl_30_informe_pdf_restyle.md`.

**Qué se hizo:** restyle del PDF A4 al lenguaje visual del web-v2 **sin unificar**
(OQ1): se reemplazó la hoja `STYLE` de `render-shared.ts` (portada oscura con
gauge, score-rows con barra estática, riesgos en `.risk` cards, día a día en
`.fix` cards, plan en `.tl-h`/`.tl-step`, footer branded, `@page A4 portrait 14mm
16mm`, `break-inside:avoid`) y se ajustó el **markup mínimo** de
`render-erp/it/mixto/mixto-parts` (hallazgos `<table>` → `.score-row`, día a día
`.circuito` → `.fix`, timeline `.tl-item` → `.tl-step`, gauge en portada),
conservando la estructura `.informe-a4 .page` y el despacho por tipo (R7b).
**Norma condicional** (OQ3, reemplaza #25): `hayNorma(sec)` = `domain it` +
`standardRef` que empieza con `CIS`; la norma va inline en `.detail` solo si
existe; sin norma → nada (sin columna, sin celda, sin "Control interno");
metodología IT solo si ≥1 sección con norma. Consistente PDF + web. **Editor
inline preservado** (OQ2): `field()`/`data-field`/`contenteditable` en el draft;
score/gauge/norma con `data-canonical` y nunca editables. **Logos 100% CDN**:
plantillas A4 sin base64 (`__LOGO_*__` → URLs R2); render ya usaba
`LOGO_VERT_URL`/`LOGO_COLOR_URL`. **Scoring intacto** (`git diff scoring/` vacío).

**Verificación:** `pnpm run check` 0 errores; `pnpm run build` OK; suite informe
95/95 verde; scoring 10/10; `canonical-contract.snap` sin cambios. Snapshots PDF
ERP/IT/mixta regenerados a propósito (misma estructura de páginas, scores
intactos); web cambia SOLO por norma (+4/−3 líneas, revisado, R13).
`./init.sh` `[FAIL]` por condiciones **PREEXISTENTES** (§3 ">1 in_progress": #12
parqueado + #30; §4 flakiness DB-compartida → 2 fallos en `audits-create.test.ts`
de #23, que pasa 4/4 en aislamiento). Ningún archivo de #30 toca esos módulos.

**NO** toqué el estado de #30 en `feature_list.json` (lo mueve el leader tras el
reviewer). **NO** commit/push.

---

## Spec ajustado tras puerta humana: #30 30_informe_pdf_restyle (spec_author, 2026-06-17)

**Estado:** sigue en `spec_ready` (NO se movió a in_progress; la aprobación NO se
reabre). Se incorporaron al spec las decisiones de la puerta humana resolviendo
las 3 open questions. Archivos editados:
`specs/30_informe_pdf_restyle/{requirements,design,tasks}.md`.

**Resolución de las open questions (sección nueva "Decisiones de la puerta humana
(2026-06-17)" en requirements.md):**
- **OQ1 → NO unificar.** Se descarta el `renderInformeBody`/`render-shared-web.ts`
  unificado. El PDF A4 conserva su estructura paginada (`.informe-a4 .page`,
  despacho `render-erp/it/mixto/mixto-parts` intactos en estructura); SOLO se
  cambian los estilos (hoja `STYLE` de `render-shared.ts`, centro del cambio) +
  markup mínimo para adoptar el lenguaje visual web-v2 según el contrato
  `ref_informe_a4_v2_plastipress.html`. `web-render.ts` NO se toca salvo norma
  condicional. Snapshots PDF ERP/IT cambian a propósito (CSS/markup) pero la
  estructura de páginas se preserva → menor churn. Nuevos R: R7b. Web snapshot
  cambia SOLO por norma (sin "próximos pasos", §4 corregido).
- **OQ2 → mantener editor inline.** `editMode` + `field()`/`data-field`/
  `contenteditable` se preservan tal cual (R30 de #14). Canónicos (score, gauge,
  norma) nunca editables. Nuevos R: R20b, R20c.
- **OQ3 → construir sobre el árbol actual** (incluye #25, en `done` sin commitear).
  #30 reemplaza la regla de norma de #25: norma solo si existe norma real (R8); si
  no hay → NADA (sin etiqueta, sin celda visible). Se quitó del spec cualquier
  resto de 'Control interno'. El implementer documenta el neto sobre `main`.

**Cambios en los archivos:** requirements.md — sección "Open questions" →
"Decisiones de la puerta humana (2026-06-17)"; R1–R7 reescritos a "restyle en
sitio", +R7b/R20b/R20c, tabla R↔verificación actualizada. design.md — §2/§3
reescritos (NO unificar; render-shared.ts como centro; renders se restilan no se
eliminan), §4/§5/§6/§7/§8/§10/§11 actualizados (alternativa descartada ahora = la
unificación). tasks.md — eliminada la tarea de unificación y la de eliminar
renders; tareas de restyle por pieza visual, norma condicional PDF+web, logos
CDN, invariante quick_wins/upsell, preservar editMode.

NO se escribió código de app ni tests. #30 queda en `spec_ready` para implementer.

---

## Spec drafted: #30 30_informe_pdf_restyle (spec_author, 2026-06-17)

**Estado:** `spec_ready` — esperando puerta humana. NO código.
`specs/30_informe_pdf_restyle/{requirements,design,tasks}.md` creados (EARS,
R1–R22). #30 → `spec_ready` en `feature_list.json`.

**Alcance:** rediseñar el **PDF A4** del informe (`renderInformeHtml`) para que
use el lenguaje visual del **web-v2 ya aprobado** (#15, `web-render.ts`, que NO
se rediseña). Logos 100% CDN R2 y **norma por sección condicional** (ajusta #25),
consistente PDF↔web. Scoring intacto.

**Decisiones de la puerta (2026-06-17, ya tomadas, en el spec):** dos formatos
separados (web-v2 intacto, PDF restilado); contrato visual
`ref_informe_a4_v2_plastipress.html` bloque `@media print` (el `.ps-*` de
propuestas queda fuera); logos por variante de fondo
(`sys_vertical_w.png` oscuro / `sys_horizontal_b.png` claro); norma solo si
existe norma real (`domain it` + `standardRef` que empieza con `CIS`), si no →
NADA (sin celda vacía, sin "Control interno"); 6 secciones; propuesta fuera del
informe; scoring sin cambios.

**Decisiones de diseño clave:**
- **Unificar el PDF sobre el mismo HTML que web-v2** (un `renderInformeBody` +
  dos hojas de estilo: `WEB_STYLE` animado vs. `PRINT_STYLE` A4 del contrato).
  Reescribe `render-erp/it/mixto*` (se eliminan) y regenera a propósito los
  snapshots PDF ERP/IT. El snapshot **web** solo cambia por la norma condicional
  (+ próximos pasos si se aprueba unificar las 6 en ambos medios).
- **Norma inline en `.detail` del score-row** (no columna/celda): aparece solo
  si `hayNorma`; evita columna vacía → cumple R10/R11 por construcción.
- **Barras print con `style="width:N%"` estático** (sin depender de JS al
  imprimir); gauge print con `stroke-dashoffset` final directo.
- **Logos ya están por CDN en el código** (constantes en `render-shared.ts`); el
  cambio de plantillas A4 es quitar el base64 `__LOGO_*__` de los `.html` de doc.

**Hallazgo de secuenciación (importante):** el código de **#25 ya está en el
working tree, sin commitear y fuera de `done`** en `feature_list` (columna Norma
siempre en tabla IT con celda vacía, metodología IT, prompt v2.2,
`tests/informe-normas.test.ts`). #30 **reemplaza** ese comportamiento de norma.
Registrado como OQ3.

**Open questions reales (en requirements.md):**
1. OQ1 — ¿unificar DOM PDF↔web (default propuesto) o mantener `.informe-a4 .page`
   y solo restilar dentro?
2. OQ2 — ¿mantener el editor inline (`editMode`/`contenteditable`) sobre el HTML
   unificado? (default: sí).
3. OQ3 — ¿#30 se implementa sobre el árbol con #25 ya presente (default) o se
   exige cerrar #25 antes?

**Nota/futuro:** puente informe↔presupuesto (#16) anotado como trabajo posterior,
fuera de alcance de #30.

NO avancé a implementación (puerta humana). NO commit/push.

---

## Spec drafted: #25 25_normas_informe (spec_author, 2026-06-17)

**Estado:** `spec_ready` — esperando puerta humana. NO código.
`specs/25_normas_informe/{requirements,design,tasks}.md` creados (EARS, R1–R17).

**Alcance:** exponer en el informe (1) la norma por sección en la tabla de
hallazgos y (2) un bloque de metodología (CIS v8 + NIST CSF para IT, ciclos de
fabricante para EOL, control interno para ERP). El dato `section.standard_ref` ya
viaja al canónico (#09, `build.ts:252`, `schema.ts:42`) y llega intacto a
`buildInformeRenderModel` vía `stripInternalFindings`; el corte está solo en
`server/informe/model.ts` → `render-shared.ts` (`InformeRenderModel.secciones` no
incluye `standard_ref`) → renders.

**Decisiones clave del spec:**
- ERP usa nomenclatura interna (`ERP B1`, `ERP E3`) → NO se publica cruda;
  helper puro `normaLabel()` la mapea a etiqueta `Control interno`. IT (`CIS N ·
  NIST: fase`) se muestra tal cual. CAB/null → `Control interno` (R6, R13, R14).
- Bloque de metodología como franja `.callout` DENTRO de la página de Hallazgos,
  NO página nueva (la paginación A4 es fija con `footer('NN')` hardcodeado →
  página nueva renumeraría todo y rompería snapshots masivamente). Justificado en
  design §5.
- Tres renders impactados, no dos: PDF (`render-erp/it/mixto` + `mixto-parts`)
  **y** la web pública #15 (`web-render.ts`), que también consume
  `model.secciones`. Snapshots afectados: `informe-render`, `informe-render-it`,
  `informe-web-render`; `canonical-contract.snap` NO debe cambiar.
- Snapshots se actualizan conscientemente (T12) recién tras tests de aserción
  explícita (T10/T11) que blindan no-regresión de scoring (R12).
- Prompt `generate-report.ts`: por defecto NO se toca (la norma es metadato de
  render, no texto IA). R15–R17 quedan como guardas condicionales; si la puerta
  pide tocarlo → subir `INFORME_PROMPT_VERSION` 2.1→2.2.

**Open questions para la puerta (en requirements.md):**
1. Etiqueta ERP: `Control interno` vs `Buenas prácticas de control interno`.
2. Ubicación del bloque (franja en Hallazgos, propuesta) vs portada.
3. ¿Tocar el prompt? (propuesta: no).

NO avancé a implementación (puerta humana). NO commit/push.

**Ajuste post-puerta humana (2026-06-17):** el humano pasó la puerta y resolvió
las 3 open questions. Spec actualizado SIN reabrir aprobación (sigue `spec_ready`;
el leader lo mueve a `in_progress` cuando corresponda). Sección "Decisiones de la
puerta humana (2026-06-17)" agregada en requirements.md y design.md (§11).
1. **ERP sin columna Norma.** La columna "Norma" y el bloque de metodología son
   **solo IT** (`it` + secciones/páginas IT de `mixta`). El informe **ERP puro
   queda idéntico** (sin columna Norma, sin metodología, snapshot
   `informe-render.test.ts.snap` sin cambios). En `mixta` las páginas ERP no
   llevan Norma y el bloque declara **solo marco IT** (sin "control interno ERP").
   Se **elimina** el helper `normaLabel` y la etiqueta `Control interno`: la norma
   IT se muestra con `standardRef` tal cual (vacío si falta, R13). `render-erp.ts`
   ya no se toca; `render-mixto-parts.ts` solo toca la parte IT. Reescritos R3 (→
   R3/R3b/R3c), R4, R6, R7, R10, R11, R13, R14 y la §"Decisión de presentación".
2. **Ubicación del bloque:** franja `.callout` en la página de Hallazgos IT
   (confirmado, sin página nueva).
3. **Sí se toca el prompt.** `generate-report.ts`: instrucción de usar
   `standard_ref`/no inventar normas (IT/mixta) + `INFORME_PROMPT_VERSION` 2.1→2.2.
   R15/R16 pasan de condicionales a **firmes**; R17 se mantiene.
Tasks reescritas: T8 firme (prompt+versión), T4/T5 norma solo IT/mixta-IT, T6
verifica ERP sin cambios, **T10 test explícito de que el informe ERP NO cambió su
snapshot** (R3c/R10), T12 confirma `informe-render.snap` ERP intacto. NO escribí
código de app ni tests. #25 sigue `spec_ready`. NO commit/push.

---

## Feature en curso: #24 24_reunion_extraccion_precisa (implementer, 2026-06-16)

**Estado:** in_progress — implementación arrancada. Spec aprobado (puerta humana 2026-06-16).
Plan de tasks T1..T21 (+ T12a–e). Análisis migra OpenAI→Claude (Anthropic Messages API, fetch crudo,
tool use forzado `propose_values`); STT (Whisper) intacto; guards Tier 1 (grounding/umbral/dedup) +
verificador Tier 2 opcional; columna nullable `verification_status` (migración 016) + badge en UI.

> Entorno: Docker daemon arrancado en esta sesión para levantar Postgres y correr `pnpm test`/`init.sh`.
> Nota de arnés: feature_list tiene 3 in_progress (#12, #23, #24) → init.sh §3 reporta FAIL por
> ">1 in_progress". Condición conocida/aceptada por Martín; no bloquea el trabajo de #24. Verifico
> #24 con la suite de tests (sección 4 de init.sh) + check/build.

### Progreso #24 — COMPLETO (a espera de reviewer)
- [x] T1..T21 (+T12a–e) — todas marcadas en tasks.md. Trazabilidad R↔test en
  `progress/impl_24_reunion_extraccion_precisa.md`.
- Verificación real: `pnpm run check` 0 errors; `pnpm run build` ✓; suite reunion+migración 103/103
  verde; `pnpm test` 770 passed / 17 failed (los 17 son de #23, no importan módulos de #24).
- `./init.sh` EXIT 1 por condiciones PREEXISTENTES ajenas a #24: §3 ">1 in_progress" (#12/#23/#24,
  aceptado) y §4 los 17 tests de #23 (Fase 1 bloqueada). Detalle en impl_24.
- NO toqué estado en feature_list.json. NO commit/push.

---

## Spec drafted: #24 24_reunion_extraccion_precisa (spec_author, 2026-06-16)

**Estado:** `spec_ready` — esperando puerta humana. NO código aún.
`specs/24_reunion_extraccion_precisa/{requirements,design,tasks}.md` creados (EARS, R1–R18).
Alcance: STT Whisper intacto; análisis migra a Claude (Anthropic Messages API, tool use forzado
`propose_values`, `REUNION_ANALYSIS_MODEL` default `claude-sonnet-4-6`); guards Tier 1
(grounding/dedup/umbral) + verificador Tier 2 opcional (`REUNION_VERIFIER_ENABLED`,
default `claude-haiku-4-5`); fixture de regresión con la transcripción de prueba. NO toca el modelo
de datos `reunion_proposal` ni la UI de revisión de #12.

**Ajuste post-puerta humana (2026-06-16):** el humano pasó la puerta y tomó 4 decisiones sobre las
open questions. Spec actualizado (sigue en `spec_ready`, NO se reabre aprobación):
1. Modo webhook/n8n → cerrado fuera de alcance (feature aparte si va a prod).
2. Defaults de modelo confirmados (`claude-sonnet-4-6` extracción, `claude-haiku-4-5` verificador).
3. `REUNION_CONFIDENCE_MIN` default `0.5` confirmado.
4. ERROR del verificador en una propuesta puntual → **conservar + marcar `unverified`** (antes:
   descartar). El caso `supported=false` sigue siendo descarte.
Implica requisito nuevo **R19**: columna nullable idempotente `verification_status` en
`reunion_proposal` (`migrations/016_reunion_verification_status.sql`), persistencia en
`insertReunionProposals`, badge "No verificada — revisar" en `proposal-review.svelte`. R12 y R15
ajustados (R15 aclara que el único cambio en la tabla es esa columna aditiva). Tasks nuevas T12a–T12e
y T11/T12/T15 actualizadas. Las 4 open questions de `design.md` pasaron a §Decisiones de la puerta
humana (ninguna queda abierta).

## Feature CERRADA: #23 23_crm_empresa_unificada → `done` (2026-06-16)

**Estado:** ✅ **DONE.** Las 6 fases implementadas, verificadas y APROBADAS por reviewer.
Leader marcó #23 → `done` en `feature_list.json` tras el APROBADO de Fase 6 + cierre de feature
(`progress/review_23_crm_empresa_unificada_fase6.md`). Trazabilidad R1–R32 completa, acceptance
(11 criterios) cumplido, suite **870 passed / 2 skipped / 0 failed** en aislamiento, check 0 err,
build OK. **SIN commit/push** (decisión de Martín). El working tree tiene todos los cambios de #23
sin commitear.

> Nota de arnés: tras cerrar #23 queda **solo #12 `reunion_asistente` en `in_progress`** (parqueado
> a propósito por Martín). `init.sh §3` ya NO falla por ">1 in_progress".

> Follow-ups abiertos (PRE-EXISTENTES, ajenos a #23, no bloquean): (1) flakiness de entorno por DB
> compartida + tests en paralelo / OOM si corren suite + init.sh juntos; (2) selector brittle del nav
> en `e2e/mercado.spec.ts`; (3) `isRedirect` en `failFromError`; (4) badge de ficha no recomputa en
> el acto tras evento; (5) limpieza física futura de tablas/vista legacy (ver `cleanup-manual.md`).

### Plan de fases (specs/23_crm_empresa_unificada/tasks.md)
- **Fase 1** — `empresa` + migración 015 con compat `client` (T1–T5). Gate: init.sh verde.
- **Fase 2** — Importador #21 reconectado a `empresa` + selector relacion (T6–T8b).
- **Fase 3** — Form nueva auditoría + mercado → `empresa` (T9–T13).
- **Fase 4** — Cockpit `/crm` listado/ficha/edición (T14–T19).
- **Fase 5** — Estado híbrido, eventos/timeline, crear auditoría desde ficha, export (T20–T25).
- **Fase 6** — Deprecación documentada SIN drop (T26–T28).

### Progreso
- [x] Fase 1 — **VALIDADA Y VERDE.** Migración 015 aplicada: fold 1933 client + 52 crm_lead − 2
  dedup = **1983 empresa**, **0 audits huérfanas**, FK intacta, idempotente. Suite **787 passed / 0
  failed**, `check` 0 errores, `build` OK. 2 regresiones reales del rename arregladas
  (`dashboard.ts`, `clients-import.ts`: la vista no cubre `xmax`/`ON CONFLICT`/`GROUP BY`). Wart:
  el seed dev deja todo `prospecto` (inserta por la vista sin `relacion`) → se corrige en Fase 2.
  Detalle/counts en `progress/impl_23_crm_empresa_unificada.md`.
- [x] Fase 2 — **IMPLEMENTADA Y APROBADA (reviewer, 2026-06-16).** Verificación independiente
  reproducida; APROBADO en `progress/review_23_crm_empresa_unificada.md`. Hallazgo menor no
  bloqueante: blindar "el UPDATE no pisa relacion" con relacion-existente ≠ selector (Fase 3+).
  Importador #21 reconectado
  a `empresa` con selector explícito de `relacion` (cliente|prospecto), no inferido por origen.
  T6 (`applyClientImport(plan, relacion)`), T7 (`empresaImportSchema` Zod en el endpoint, 400 si
  falta/inválida, guard intacto), T7b (`<select crm-import-relacion>` en el panel de CRM), T8
  (upsert escribe `empresa` + relacion del selector, 7/7), T8b (e2e selector 3/3 + fix CUIT en
  `import-clientes.spec`). `check` 0 err, `build` OK, suite import+empresa 48/48, e2e import 5/5.
  Wart de Fase 1 (seed todo `prospecto`) resuelto vía selector. Detalle/trazabilidad en
  `progress/impl_23_crm_empresa_unificada.md`. NO toqué feature_list.json. NO commit/push.
- [x] Fase 3 — **IMPLEMENTADA Y VERDE (implementer, 2026-06-16, a espera de reviewer).** Reconectar
  caminos calientes (form nueva auditoría + dashboard mercado) de la **vista** `client` a la tabla
  base `empresa`. `check` 0 err, `build` OK, suite **797 passed / 2 skipped / 0 failed**, e2e
  `auditorias-new` 1/1. Default `relacion='prospecto'` en empresa nueva del form clásico. e2e
  `mercado.spec` "admin ve dashboard" rojo por selector brittle PRE-EXISTENTE (nav duplicado),
  ajeno a Fase 3 (dashboard renderiza, queries empresa OK). Detalle/trazabilidad en
  `progress/impl_23_crm_empresa_unificada.md`. NO toqué feature_list.json. NO commit/push. Plan T9–T13:
  - T9 `backoffice/audits.ts`: `FROM/INSERT INTO empresa`; `createAudit` setea `relacion` en empresa
    nueva = **`prospecto`** (default conservador: crear una auditoría no implica que la empresa ya sea
    cliente; el estado de cliente se decide manual en la ficha. Coherente con el default del selector
    de import y no-destructivo: nunca eleva a `cliente` por error).
  - T10 `mercado/queries.ts`: 10 `JOIN client c` → `JOIN empresa c`.
  - T11 verificar `auditorias/new/{+page.server.ts,+page.svelte}` y `cab-client-map.ts` (sin cambio:
    solo llaman a `audits.ts`; `ClientCabFields` no cambia de forma).
  - T12 `tests/audits-create.test.ts` + `e2e/auditorias-new.spec.ts` (nuevos).
  - T13 `tests/mercado-queries.test.ts` (nuevo).
- [x] Fase 4 — **IMPLEMENTADA Y VERDE (implementer, 2026-06-16, a espera de reviewer).** Cockpit
  `/crm`: listado con filtros (relacion/estado/búsqueda) + **paginación server-side** (50/pág,
  prev/next por URL) para ~2000 empresas, badges, y ficha ver/editar datos maestros + `relacion`.
  Panel de import de Fase 2 **integrado** en el cockpit (testids intactos, e2e import 3/3). Estado
  efectivo **derivado en SQL en UNA query agregada** (sin N+1, ventana 18 meses), honra
  `estado_override`; el módulo `empresa-estado.ts` + timeline + override es Fase 5. `check` 0 err,
  `build` OK, suite **823 passed / 2 skipped / 0 failed**, T18 26/26, e2e cockpit 6/6. Bug real
  hallado y corregido: postgres.js rechaza `undefined` en `sql(obj,...)` (filtro `!== undefined`).
  Eliminado `e2e/crm.spec.ts` (UI del cockpit de leads viejo, ya inexistente; reemplazo funcional
  `e2e/crm-cockpit.spec.ts`; API de leads sigue cubierta por `tests/api/crm-leads.test.ts`).
  Detalle/trazabilidad en `progress/impl_23_crm_empresa_unificada.md`. NO toqué feature_list.json.
  NO commit/push. T14–T19 + Gate Fase 4 marcados `[x]`.
- [x] Fase 5 — **IMPLEMENTADA Y VERDE (implementer, 2026-06-16, a espera de reviewer).** Estado
  híbrido (módulo TS + **paridad SQL↔TS** verificada por test), eventos/timeline, crear auditoría
  desde la ficha, export CSV. Retomó el intento previo que cayó por un 500: casi todo el código ya
  estaba (módulo, funciones, schemas, CSV, endpoints, ficha); faltaba cerrar tests (T25), la
  reconciliación SQL↔TS, verificación/marcado, y arreglar el bug del 500. **Causa raíz del 500**: el
  test de paridad insertaba en `audit_report` columnas inexistentes (`content`/`created_by`) →
  corregido a `canonical_json`/`schema_version`/`requested_by` + `approved_by/approved_at`. **Recon
  SQL↔TS**: `ACTIVITY_WINDOW_MONTHS=18` constante única en `empresa-estado.ts` importada por
  `empresa.ts` (no hardcodeada dos veces); test de paridad compara `getEmpresaById` (CASE SQL) vs
  `deriveEmpresaEstado(getEstadoInputs)` para los 7 estados + override; política "regla de estado va
  en TS y en CASE SQL juntos" documentada en el encabezado del módulo. `check` 0 err, `build` OK,
  suite Fase 5 47/47 (estado 23 + eventos 17 + export 7), e2e `crm-ficha` 4/4, `pnpm test`
  **870 passed / 2 skipped / 0 failed** (180 files) en corrida limpia. Tests creados:
  `tests/api/empresa-eventos.test.ts`, `tests/api/empresas-export.test.ts`, `e2e/crm-ficha.spec.ts`;
  modificado `tests/empresa-estado.test.ts` (fix del bug). Flakiness pre-existente
  (`canonical-contract`, ocasional `audits-create`) ajena a Fase 5; pasa en aislamiento. `init.sh`
  `[FAIL]` por ">1 in_progress" + esa flakiness. Detalle/trazabilidad R↔test en
  `progress/impl_23_crm_empresa_unificada.md`. NO toqué feature_list.json. NO commit/push.
  T20–T25 + Gate Fase 5 marcados `[x]`. Plan original T20–T25:
  - T20 `src/lib/server/crm/empresa-estado.ts` (`deriveEmpresaEstado`, `effectiveEstado`,
    `withinActivityWindow`) + constante única `ACTIVITY_WINDOW_MONTHS=18` importada por TS y por
    `empresa.ts` (SQL). Query agregada de inputs en `empresa.ts` (sin N+1).
  - T21 `addEvento`/`listEventos`/`setEstadoOverride` en `empresa.ts` + `empresaEventoSchema`;
    override genera evento `cambio_estado`.
  - T22 Ficha: estado efectivo + origen + timeline; UI evento/nota + set/clear override.
  - T23 Crear auditoría desde la ficha (CAB precargado vía `getEmpresaCabFields`, FK a empresa).
  - T24 `GET /api/crm/empresas/export` (CSV del listado filtrado).
  - T25 Tests: `empresa-estado` (7 estados + reglas + override + **paridad SQL↔TS**),
    `api/empresa-eventos`, `api/empresas-export`, `e2e/crm-ficha`.
  - Migración eventos: `empresa_evento` YA existe (Fase 1, migr. 015). No hace falta migración nueva.
- [x] Fase 6 — **IMPLEMENTADA Y VERDE (implementer, 2026-06-16, a espera de reviewer final).**
  Deprecación documentada **SIN drop** (decisión humana 8). T26–T28 + Gate Fase 6 marcados `[x]`.
  - T26: `migrations/017_empresa_deprecacion.sql` (la 016 es de #24 → se usó 017). Tres `COMMENT ON`
    marcando `crm_lead`, `crm_lead_event` y la vista `client` como "DEPRECADO #23, conservar para
    rollback, no escribir". **CERO `DROP`, CERO `REVOKE`** (evaluado: el rol `auditapp` es DUEÑO →
    REVOKE no afecta al owner = no-op engañoso; la vista `client` aún recibe escrituras legacy → solo
    COMMENT, justificado en el .sql). Idempotente (body 2× = no-op; runner la registra/saltea).
    Aplicada con `pnpm db:migrate`. Cubre R30 (cierre sin drop).
  - T27: `specs/23_crm_empresa_unificada/cleanup-manual.md` — limpieza manual futura (orden por FK:
    `crm_lead_event`→`crm_lead`→vista `client`; precondición = ningún lector legacy + backup;
    código a borrar). NO se borró `crm-leads.ts` ni `state-machine.ts` (referencia).
  - T28: `pnpm test` **870 passed / 2 skipped / 0 failed** (180 files, corrida dedicada); e2e
    cockpit+ficha+import 13/13 + auditorias-new 1/1 chromium; `check` 0 err, `build` OK. Mapa R↔test
    **R13–R32 cerrado** en `progress/impl_23_crm_empresa_unificada.md` (trazabilidad #23 completa).
  - **Incidente de entorno (no regresión):** correr 2 `pnpm test` full concurrentes (mío + init.sh)
    OOM-mató `db-db-1` (exit 137) → `ECONNREFUSED` en cascada; tras reiniciar Postgres y correr la
    suite aislada → 870/2/0. `./init.sh` `[FAIL]` solo por ">1 in_progress" (#12/#23/#24) + esa
    flakiness DB-compartida (truncate race). NO toqué `feature_list.json`. NO commit/push.

### #23 — LAS 6 FASES COMPLETAS (a espera de reviewer final de Fase 6)

Fases 1–5 ya aprobadas/verdes; Fase 6 implementada y verde. Cierre de la feature: registro único
`empresa` (fold `client`+`crm_lead`, FK de `audit` preservadas), importador #21 reconectado con
selector de relacion, form de auditoría + mercado sobre `empresa`, cockpit `/crm` (listado/ficha/
edición/export), estado híbrido + timeline + override, y deprecación documentada de los objetos
legacy **sin drop** (red de rollback). Trazabilidad R1–R32 completa. Falta solo el **reviewer final
de Fase 6** para mover #23 a `done`.
