# Análisis de deuda técnica — auditapp
*Generado: 2026-06-23*

---

## Resumen ejecutivo

El proyecto tiene una base técnica sólida con buena cobertura de specs, pero acumula brechas entre documentación y código en las capas de schema de BD, integración con sistemas externos y capa cliente offline. Los tres hallazgos de alta prioridad son concretos y accionables: una columna de DB faltante que impide expiración de tokens, un campo de índice global ausente en schema y en scoring, y un endpoint de n8n que escribe en una tabla legada invisible para el CRM. La deuda técnica más relevante está concentrada en el manejo de IDB (IndexedDB abierta/cerrada por operación, condiciones de carrera en flush) y en queries de mercado con filtros duplicados en 9 lugares. Las incongruencias de specs son mayoritariamente documentación desactualizada, no errores de comportamiento.

---

## Hallazgos por prioridad

### 🔴 Alta prioridad

**[A-1] `token_expires_at` especificado pero nunca implementado**
La tabla `audit` no tiene la columna `token_expires_at timestamptz` que define SPEC-07b §3. `briefing-token.ts` valida el estado del briefing pero nunca compara contra fecha de expiración. El criterio de aceptación "token inválido o auditoría avanzada → pantalla amable" se cumple solo parcialmente.
- Archivos: `migrations/001_schema.sql`, `src/lib/server/auth/briefing-token.ts`
- Acción: agregar columna en migración nueva y validarla en `resolveBriefingByToken`. Default: 14 días.

**[A-2] `indice_global` especificado en spec y UI pero ausente en schema y en scoring**
SPEC-07a §3.3 y spec 07f §2 describen `audit_closure.indice_global int`. La tabla solo tiene `indice_it` e `indice_erp`. `score-audit.ts` retorna `{ indiceIt, indiceErp }` sin `indiceGlobal`. Para auditorías combo el índice combinado no se calcula ni persiste.
- Archivos: `migrations/001_schema.sql:147-148`, `src/lib/server/scoring/score-audit.ts`, `src/lib/server/scoring/persist.ts`
- Acción: definir si se persiste o se calcula en runtime. Si se persiste, agregar columna en migración y calcularla en `score-audit.ts`.

**[A-3] Endpoint batch de n8n escribe en `crm_lead` (tabla legada), invisible para el CRM cockpit**
Feature #13 implementó `/api/crm/leads/batch` sobre `crm_lead`. Feature #23 unificó el CRM en `empresa` y reconectó el importador #21, pero NO el batch. El cockpit `/crm` lee exclusivamente de `empresa` vía `listEmpresas()`. Los leads cargados por Firecrawl/n8n son invisibles en la UI.
- Archivos: `src/routes/api/crm/leads/batch/+server.ts`, `src/lib/server/db/crm-leads.ts:178-200`, `src/routes/(app)/crm/+page.server.ts`
- Acción: migrar `upsertLeadsBatch()` para escribir en `empresa` con `relacion='prospecto'` y registrar evento en `empresa_evento`.

**[A-4] `contract_version` en código es `'1.1'` pero spec dice `'1.0'`**
`src/lib/server/psys/schemas.ts:12` tiene `'1.1'`. El design.md de #16 especifica `'1.0'`. No hay changelog que documente el bump. Si `presupuestossys` valida versión exacta, todos los requests del lado app fallan con 422.
- Archivos: `src/lib/server/psys/schemas.ts:12`, `specs/16_presupuesto_psys/design.md:51,82,130`
- Acción: alinear versión y documentar el bump, o bajar a `'1.0'` si el receptor no fue actualizado.

**[A-5] `restoreDraft` no persiste el snapshot después de restaurar — pérdida de datos si el servidor está caído**
Spec #40 R2 dice que `scheduleSave` debe escribir el draft. `handleRestore()` llama `scheduleSave` por ítem (debounced), pero `persistDraftSnapshot()` nunca se invoca al restaurar. Si el técnico cierra el tab antes de que los debounced saves se disparen, pierde los valores restaurados.
- Archivos: `src/routes/(app)/auditorias/[id]/form/+page.svelte:151-159`, `src/lib/client/form/draft-recovery.ts`
- Acción: agregar `persistDraftSnapshot()` al final de `handleRestore()` después de asignar `itemLocalState`.

**[A-6] Model ID `claude-opus-4-8` no existe en la API de Anthropic**
`INFORME_DEFAULT_MODEL = 'claude-opus-4-8'` en `src/lib/server/informe/claude.ts:6` referencia un ID inexistente. Los tests usan mock adapter y no detectan el error. En producción sin `INFORME_CLAUDE_MODEL` configurado el pipeline falla con 400.
- Archivos: `src/lib/server/informe/claude.ts:6`, fixtures en `tests/informe-render.test.ts:32`, `tests/informe-invariantes.test.ts:38`
- Acción: corregir a `claude-opus-4-5` (o el ID vigente) y configurar `INFORME_CLAUDE_MODEL` en `.env` de producción.

---

### 🟡 Media prioridad

**[M-1] `archiveAudit` recibe `adminId` pero lo descarta — sin validación de rol y dead code**
La action `archive` en `[id]/+page.server.ts:139` usa `requireStaff` (admin o técnico). La spec y la matriz de permisos de SPEC-07b indican que solo admin puede archivar. `archiveAudit()` recibe `adminId` pero lo descarta con `void adminId:666` sin validarlo ni loguearlo.
- Archivos: `src/routes/(app)/auditorias/[id]/+page.server.ts:139`, `src/lib/server/backoffice/audits.ts:649-666`
- Acción: cambiar la action a `requireAdmin` o agregar guard explícito. Eliminar el `void adminId` o usarlo para logging/`archived_by`.

**[M-2] Dashboard de técnico filtra por scope de tipos, no por asignación efectiva**
SPEC-07b: técnico ve solo sus auditorías asignadas (`audit.assigned_tech_id = user.id`). El dashboard filtra por `scopeTypes` (especialidad), no por asignación directa. Un técnico IT ve todas las auditorías IT activas, no solo las propias.
- Archivos: `src/lib/server/backoffice/dashboard.ts:120-127`, `src/lib/server/backoffice/audits.ts:483`
- Acción: filtrar por `assigned_tech_id = user.id` en el dashboard. Es un problema de autorización que la spec explicita.

**[M-3] `getCabItemsForTypes` deduplica ítems por `.label` (frágil)**
En `audits.ts:772`, auditorías mixtas deduplicación de ítems del CAB por texto libre `.label`. Si dos templates tienen un ítem con mismo label pero distinto `id`, el segundo se descarta silenciosamente.
- Archivo: `src/lib/server/backoffice/audits.ts:760-783`
- Acción: deduplicar por un campo estable (`item_key` de `bundle/item-key.ts`). El concepto ya existe.

**[M-4] IDB se abre y cierra por cada operación en `retry-queue.ts` y `draft-store.ts`**
Con autosave debounced a 600ms, en una sección larga hay múltiples aperturas concurrentes de la misma IDB. `retry-queue.ts` tiene 6 llamadas a `openDb`; `draft-store.ts` tiene 3.
- Archivos: `src/lib/client/form/retry-queue.ts`, `src/lib/client/form/draft-store.ts`
- Acción: mantener una instancia IDB abierta como singleton lazy-init para la vida del form.

**[M-5] Condición de carrera en `$effect` de montaje del form — `flushQueue` y `listQueued` concurrentes**
El mismo `$effect` lanza `flushQueue` (línea 176) y un `listQueued` standalone (línea 184) casi simultáneamente. El segundo puede leer la cola antes de que el primero termine de limpiarla.
- Archivo: `src/routes/(app)/auditorias/[id]/form/+page.svelte:176-188`
- Acción: combinar en un único `flushQueue` al montar; eliminar el `listQueued` standalone del `$effect`.

**[M-6] `psysPayload.cliente` siempre envía `email`, `telefono`, `direccion`, `provincia` como `null`**
`payload.ts:43-46` hardcodea los cuatro campos de contacto a `null`. La información existe en `empresa` desde feature #23. `presupuestossys` no puede pre-cargar el contacto aunque los datos estén disponibles.
- Archivos: `src/lib/server/psys/payload.ts:38-47`, `src/lib/server/canonical/schema.ts:16-21`
- Acción: extender `buildPsysPayload` para recibir y poblar los campos de contacto de empresa.

**[M-7] `findClientByNaturalKey` e `INSERT INTO client` referencian una vista, no la tabla real**
Post-migración #15, `client` es una vista de `empresa`. Los SELECTs funcionan; el INSERT también porque la vista es auto-actualizable hoy, pero si la vista deja de serlo (columna calculada, etc.) el INSERT falla silenciosamente.
- Archivos: `src/lib/server/db/audit-bundle.ts:279,286`, `src/lib/server/bundle/import.ts:172`
- Acción: referenciar `empresa` directamente.

**[M-8] `buildMercadoDashboard` hace 9 queries con el mismo filtro base duplicado**
Las 7 queries de métricas en `aggregate.ts:89-100` repiten el mismo `WHERE` sobre `audit JOIN empresa`. En producción con 200+ auditorías son 7 full-table scans por request.
- Archivos: `src/lib/server/mercado/aggregate.ts:89-100`, `src/lib/server/mercado/queries.ts`
- Acción: consolidar en una CTE base y calcular todas las métricas en un solo pass, o vista materializada refrescada al cerrar auditoría.

**[M-9] `fetchModulosTango` usa subconsulta correlacionada en `JOIN ON` con array UUID**
`queries.ts:129-131` usa `IN (SELECT ... WHERE s.template_id = ANY(b.template_ids))` dentro de `JOIN ON`. Con volumen puede degradar a nested-loop sin índice sobre el array.
- Archivo: `src/lib/server/mercado/queries.ts:126-141`
- Acción: reescribir con `unnest` explícito. Agregar índice GIN sobre `audit.template_ids`.

**[M-10] Feature #12 marcada `spec_ready` (pausa) pero implementada completamente dentro de #24**
`feature_list.json` muestra #12 como `spec_ready`. La implementación completa existe bajo `/src/lib/server/reunion/` y `/tests/reunion-*.test.ts`, entregada dentro de #24 (`done`).
- Acción: marcar #12 como `done` con nota. El estado actual puede generar una reimplementación accidental.

**[M-11] Score de sección es autocálculo desde feature #07, pero spec 07e §5 aún describe score manual como "v1"**
La spec dice "v1: score manual; autocálculo es v2." El código implementa autocálculo desde el primer día. La spec 07f contradice a la 07e.
- Archivos: `specs/07e`, `specs/07f`, `src/routes/api/audits/[auditId]/responses/+server.ts`
- Acción: actualizar spec 07e §5.

**[M-12] `percent` está en la tabla de render de spec 07e pero no existe en DB ni en componentes**
La DB solo acepta 12 `field_type`; `percent` no está. No hay `percent-field.svelte`. Si ninguna plantilla lo usa es inocuo, pero la spec induce confusión.
- Acción: eliminar `percent` de la spec o implementar como alias de `number` con sufijo `%`.

---

### 🟢 Baja prioridad / Refactoring

**[B-1] Rate limit de login es in-memory, se resetea al reiniciar el proceso**
`rate-limit.ts` usa un `Map` en memoria. Con múltiples workers o reinicios el límite no persiste.
- Archivo: `src/lib/server/auth/rate-limit.ts`
- Acción: documentar la limitación o migrar a Redis/Postgres. Mínimo: comentario de advertencia.

**[B-2] `resolveSession` es dead code — nunca se llama**
`session.ts:56-58` exporta `resolveSession()` que no tiene consumidores. `hooks.server.ts` usa el patrón optimizado directamente.
- Acción: eliminar o marcar `@internal`.

**[B-3] `--sys-font-logo: 'Keep Calm'` declarado en CSS pero nunca cargado**
`brand.css:3` declara la variable pero la fuente no tiene `@font-face`. El browser cae a `serif` silenciosamente.
- Acción: eliminar la variable CSS o moverla a un comentario de documentación.

**[B-4] Fallback de índices muerto en `buildCanonicalAuditJson:278-281`**
Código que solo dispararía si `audit.types` tuviera valores no reconocidos, imposible con los constraints actuales.
- Acción: eliminar las líneas 278-281.

**[B-5] Gate pre-push existe como script pero no está instalado en `.git/hooks/`**
`scripts/pre-push.sh` existe y está documentado como obligatorio, pero sin el hook instalado es solo una convención manual.
- Acción: agregar instalación en `scripts/setup-dev.sh` o en CLAUDE.md.

**[B-6] `loadDraft` en `draft-store.ts` no captura errores IDB**
`saveDraft` y `deleteDraft` tienen try/catch; `loadDraft` no. Si IDB está corrupta al montar el form, el error burbujea sin manejar.
- Archivo: `src/lib/client/form/draft-store.ts:41`
- Acción: envolver en try/catch y retornar `null` en caso de falla.

**[B-7] `spec #13 R1` dice `email NOT NULL` pero migración 010 lo hizo nullable**
Discrepancia de documentación, no de código.
- Acción: actualizar requirements.md de #13.

**[B-8] `PatchFn` acepta `boolean | PatchOutcome` por compatibilidad legada inexistente**
No hay callers que pasen boolean. La rama `result === true` en `flushEntries:93` es dead code.
- Archivo: `src/lib/client/form/retry-queue.ts:4,93`
- Acción: simplificar a `Promise<PatchOutcome>`.

**[B-9] `resolvePendingDraftOnMount` y `shouldRenderDraftBanner` son identidad pura**
`return draft ?? null` y `return pending !== null` no añaden lógica. Son abstracciones vacías.
- Archivo: `src/lib/client/form/draft-recovery.ts:51-57`
- Acción: eliminar e inlinear las expresiones en los call sites.

**[B-10] `deleteDraft` inline duplicado tres veces en `+page.svelte`**
El patrón `if (queued.length === 0) void deleteDraft(...)` aparece en líneas 173, 180 y 199. Existe `maybeDeleteDraftWhenSynced` pero no se usa en esos paths.
- Acción: extraer `checkAndCleanDraftIfSynced(auditId)` y usarla en los tres puntos.

**[B-11] `form/+page.svelte:461` tiene `text-slate-600` que violó la pasada de feature #35**
`cierre/+page.svelte` tiene 15+ ocurrencias de `slate-*` fuera del alcance declarado de #35.
- Acción: limpiar `text-slate-600` → `text-sys-medio` en `form/+page.svelte`. Hacer pasada complementaria en `cierre/`.

**[B-12] Loading bar usa `h-1` (4px) pero acceptance criteria de #37 dice `h-0.5` (2px)**
- Archivo: `src/lib/components/brand/NavigationLoadingBar.svelte:6`
- Acción: cambiar `h-1` a `h-0.5`.

**[B-13] `openFormDb`/`openDb` duplicados en `retry-queue.ts` y `draft-store.ts`**
Nivel de indirección innecesario; si se agrega un tercer store hay que recordar editar `upgradeFormDb` en `retry-queue`.
- Acción: mover `upgradeFormDb` a un módulo compartido `idb-form.ts`.

**[B-14] `leadBundleAuditType` en `bundle/import.ts` declarada pero posiblemente sin uso**
- Archivo: `src/lib/server/bundle/import.ts:30-34`
- Acción: verificar call sites y eliminar si no se usa.

---

## Incongruencias entre specs

| ID | Specs en tensión | Descripción | Resolución sugerida |
|---|---|---|---|
| IS-1 | SPEC-07b §permisos vs feature #39 | SPEC-07b dice "técnico no puede reabrir"; #39 (done) habilitó reapertura por técnico asignado | Actualizar SPEC-07b para reflejar la decisión de #39 |
| IS-2 | Spec 07e §5 vs spec 07f §2 | 07e describe score manual como "v1" y autocálculo como "v2"; 07f y el código implementan autocálculo desde el inicio | Actualizar 07e §5 |
| IS-3 | Spec 07e §4 vs feature #40 | 07e llama "v2" al offline-first; #40 (in_progress) lo implementa ahora | Anotar referencia cruzada en 07e §4 |
| IS-4 | Spec #14 R8 | Mezcla estado actual (JSON por prompt) con historia de structured output descartado; los commits de arquitectura están en requirements | Limpiar R8 para describir solo el estado actual; historia va a comentario en `claude.ts` |
| IS-5 | Spec #16 design.md vs `schemas.ts` | design.md dice `contract_version: '1.0'`; código tiene `'1.1'` sin changelog | Documentar bump o alinear versión |
| IS-6 | Spec #40 R2 vs R13 | R2: "scheduleSave DEBE escribir el draft". R13: "al restaurar NO se dispara PATCH inmediato". `restoreDraft` llama `scheduleSave` que para tipos inmediatos dispara PATCH al instante | Usar delay mínimo en `scheduleRestoreSave` al restaurar |
| IS-7 | Feature #12 `feature_list.json` | Marcada `spec_ready` pero el código está completamente implementado dentro de #24 | Marcar #12 como `done` |

---

## Specs vs código — gaps

| Gap | Spec | Código | Impacto |
|---|---|---|---|
| `token_expires_at` | SPEC-07b §3: columna `timestamptz` + validación en token | Columna ausente en DB; validación ausente en `briefing-token.ts` | ALTA — expiración de links no funciona |
| `indice_global` | SPEC-07a §3.3 y 07f §2: `audit_closure.indice_global int` | Columna ausente en DB; no calculado en `score-audit.ts` | ALTA — índice global no se persiste ni calcula |
| Flujo upload R2 | Spec 07g §3/§8: PUT directo del browser a R2 | Flujo real: presign-for-key → server-put → confirm (binario pasa por SvelteKit) | MEDIA — arquitectura y escala diferentes a lo documentado |
| Key R2 sin `item_id` | Spec §4: `audits/{audit_id}/{section_code}/{item_id}/{uuid}.{ext}` | `r2-keys.ts`: `audits/${auditId}/${section}/${uuid}` (sin `item_id`) | MEDIA — limpieza por ítem no es posible solo con el path |
| `percent` field_type | Spec 07e §3: 13 tipos incluyendo `percent` | DB: 12 tipos, sin `percent`; sin componente | BAJA — tipo documentado pero inexistente |
| Contacto cliente en payload psys | Spec #16: payload incluye email/teléfono/dirección de cliente | `payload.ts:43-46` los hardcodea a `null` | MEDIA — presupuestossys no puede pre-cargar contacto |
| `restoreDraft` + `persistDraftSnapshot` | Spec #40 R2: scheduleSave debe persistir draft | `handleRestore` no llama `persistDraftSnapshot` | ALTA — pérdida de datos si tab se cierra antes del debounce |

---

## Recomendaciones de refactoring

Ordenadas por impacto:

**1. Consolidar queries de mercado con CTE base compartida**
9 queries en `mercado/queries.ts` repiten el mismo filtro de 4 condiciones. Cualquier cambio de negocio (excluir archivadas, filtrar por técnico) requiere tocar 9 lugares. Extraer una CTE parametrizada reduce el riesgo de inconsistencia y mejora la performance al hacer un solo scan del universo filtrado. Impacto: correctitud + performance + mantenibilidad.

**2. Singleton de IDB para la vida del form**
`retry-queue.ts` (6 aperturas) y `draft-store.ts` (3 aperturas) abren y cierran IDB por operación. Con autosave a 600ms en secciones largas hay múltiples aperturas concurrentes. Un módulo `idb-form.ts` con lazy-init singleton elimina la latencia acumulada, el riesgo de carrera y la duplicación del upgrade handler. Impacto: confiabilidad + performance.

**3. Migrar referencias a `client` (vista) por `empresa` (tabla real)**
`audit-bundle.ts` y `bundle/import.ts` insertan y consultan contra la vista `client`. Mientras sea una vista simple funciona, pero es un contrato frágil. Referenciar `empresa` directamente elimina la dependencia de la compatibilidad de la vista. Impacto: robustez ante cambios de schema.

**4. Extraer `extractJson` a módulo `src/lib/server/llm/extract-json.ts`**
Actualmente vive dentro del módulo específico de informe. El pipeline de reunión y cualquier otro adapter LLM futuro necesitarían duplicarla o crear acoplamiento cruzado. Moverla a un módulo compartido con tests propios es un cambio pequeño con alto valor a largo plazo. Impacto: reusabilidad + evitar duplicación futura.

**5. Limpiar abstracciones vacías en `draft-recovery.ts`**
`resolvePendingDraftOnMount` (`return draft ?? null`) y `shouldRenderDraftBanner` (`return pending !== null`) son identidad pura. Junto con consolidar las tres instancias inline de `deleteDraft` en `+page.svelte` en una función `checkAndCleanDraftIfSynced`, se reduce el ruido cognitivo en el módulo más crítico para la experiencia offline. Impacto: legibilidad + menos superficie de bug.

---

## Plan de acción sugerido

### Ola 1 — Inmediato (esta semana)

Estos ítems tienen impacto en producción o generan datos incorrectos silenciosamente:

1. **[A-6]** Corregir model ID de Claude (`claude-opus-4-8` → `claude-opus-4-5`) y configurar `INFORME_CLAUDE_MODEL` en `.env` de producción. Riesgo de fallo inmediato en producción.
2. **[A-3]** Migrar `upsertLeadsBatch()` para escribir en `empresa`. Los leads de n8n son invisibles ahora mismo.
3. **[A-4]** Alinear `contract_version` (`'1.0'` vs `'1.1'`) y documentar el cambio. Puede estar bloqueando requests a `presupuestossys`.
4. **[A-5]** Agregar `persistDraftSnapshot()` al final de `handleRestore()`. Pérdida de datos silenciosa en offline.
5. **[B-12]** Cambiar `h-1` a `h-0.5` en `NavigationLoadingBar.svelte`. Es un criterio de aceptación incumplido documentado.

### Ola 2 — Próxima semana

Brechas de schema/spec y problemas de autorización:

6. **[A-1]** Agregar columna `token_expires_at` en migración y validarla en `resolveBriefingByToken`.
7. **[A-2]** Resolver `indice_global`: definir si se persiste, agregar columna y calcularlo en scoring.
8. **[M-1]** Cambiar action `archive` a `requireAdmin`; eliminar `void adminId` o usarlo para `archived_by`.
9. **[M-5]** Eliminar la condición de carrera en el `$effect` de montaje del form (unificar flush).
10. **[M-4]** Implementar singleton de IDB (`idb-form.ts`) para eliminar aperturas concurrentes.
11. **[M-10]** Marcar feature #12 como `done` en `feature_list.json`.
12. **[IS-6]** Corregir `restoreDraft` para no disparar PATCH inmediato en tipos `IMMEDIATE_FIELD_TYPES`.

### Ola 3 — Backlog

Deuda documentaria, refactoring y hallazgos de bajo riesgo:

13. **[M-2]** Corregir filtro de dashboard de técnico por `assigned_tech_id`.
14. **[M-3]** Cambiar dedup de `getCabItemsForTypes` de `.label` a `item_key`.
15. **[M-6]** Poblar campos de contacto en `psysPayload`.
16. **[M-7]** Referenciar `empresa` directamente en lugar de la vista `client`.
17. **[M-8 + M-9]** Refactorizar queries de mercado (CTE base + reescribir `fetchModulosTango` con `unnest`).
18. **[Refactoring #4]** Mover `extractJson` a `src/lib/server/llm/extract-json.ts`.
19. **[Refactoring #5]** Eliminar `resolvePendingDraftOnMount`, `shouldRenderDraftBanner`, y consolidar `deleteDraft` inline.
20. **[IS-1 a IS-7]** Pasada de actualización de specs (SPEC-07b, 07e §4 y §5, spec #13 R1, spec #14 R8, design.md de #16, feature #40 design.md).
21. **[B-2, B-3, B-4, B-8, B-14]** Eliminar dead code (`resolveSession`, `--sys-font-logo`, fallback de índices, rama boolean en `PatchFn`, `leadBundleAuditType`).
22. **[B-5]** Instalar hook pre-push en `setup-dev.sh` o documentar en CLAUDE.md.
23. **[B-11]** Limpiar `slate-*` remanentes en `form/+page.svelte` y `cierre/`.
