# Tasks — #14 14_informe_ia

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en
`progress/impl_14_informe_ia.md`.

> Prerrequisito: features #3, #8, #9, #11 en `done`. Dependencia nueva: `@anthropic-ai/sdk`.

## Schema y DB

- [x] T1 — Crear migración `migrations/004_informe_ia.sql`: tabla `audit_report` con UNIQUE `(audit_id, version)`, CHECK de `status`, CHECKs de coherencia `aprobado`/`error`, índices `(audit_id)` y parcial `(status, updated_at)`; tabla `audit_report_edit` (historial append-only) con UNIQUE `(report_id, seq)` e índice `(report_id)`. Cubre: **R4, R7, R31**.
- [x] T2 — Implementar `src/lib/server/db/informe-reports.ts`: insert con `version = COALESCE(MAX)+1` atómico y snapshot canónico, get por audit+version, list por audit, `updateReportStatus` con `WHERE status = from`, saveDrafts, saveClientDraftEdit (`edited_by/edited_at`), saveLoomUrl, approve (`approved_by/approved_at`), `expireStaleGenerating`, `appendEditEntry` (`seq = COALESCE(MAX)+1` atómico, solo INSERT) y `listEditHistory`. Cubre: **R4, R20, R21, R22, R23, R31**.

## Dominio informe

- [x] T3 — Implementar `src/lib/server/informe/state.ts` (`InformeStatus`, `assertInformeTransition`, `InformeInvalidTransitionError`) y `errors.ts` (errores tipados del design). Cubre: **R7, R24**.
- [x] T4 — Implementar `src/lib/server/informe/schemas.ts`: `reportClientDraftSchema` strict alineado al template A4 (`docs/plantillas/informe/template_informe_pdf_a4_v1.html`) — `resumen` (diagnóstico ≤90, lead, circuitos_con_controles N/T nullable → placeholder «a editar» en render, interpretación, recomendación_central, fortalezas nullable), `indices` con semáforo, `hallazgos` (circuitos con `seccion_code` + Doc./Controles/Madurez, lectura_transversal 3–4), `riesgos` (intro + 3–5 items con título/descripción/evidencia/severidad), `plan` (título, descripción, etapas 2–6 semana/título/descripción, necesitamos_cliente, no_incluye), `dia_a_dia` (intro, circuitos 2–4 con 3 funcionalidades c/u, callout_transversal nullable), `proximos_pasos` 3–5 — más `reportInternalDraftSchema` strict (línea, rango_estimado, urgencia, probabilidad_cierre, candidato_financiacion, candidato_abono), `loomUrlSchema`, `patchReportSchema` (con `origin: 'inline' | 'form'`). Cubre: **R10, R11, R16, R25, R31**.
- [x] T5 — Implementar `src/lib/server/informe/prompts/generate-report.ts`: `INFORME_PROMPT_VERSION` + `buildInformePrompt(canonical)` con regla líneas/rangos sin producto cerrado, bloque de jerga prohibida (los seis términos exactos), reglas del template (dimensiones Doc./Controles/Madurez inferidas solo de items/observations con «—» sin evidencia; riesgos default 4 con evidencia citada del relevamiento; diagnóstico en una línea; próximos pasos con razón social; tono rioplatense profesional sin voseo; stat «circuitos con controles» null sin evidencia). Cubre: **R9, R18, R19**.
- [x] T6 — Implementar `src/lib/server/informe/claude.ts`: `assertAnthropicConfigured`, `createClaudeAdapter` con modelo de `INFORME_CLAUDE_MODEL` (default `claude-opus-4-8`); pide el JSON del envelope por prompt y lo extrae del texto (`extractJson`). _Originalmente usaba `output_config.format` derivado de Zod; se quitó en eb02144/63c8d40._ Cubre: **R3, R8**.
- [x] T7 — Implementar `src/lib/server/informe/pipeline.ts`: `createReport` (guard cerrada, snapshot vía `buildCanonicalAuditJson(auditId, { allowOpen: false })`, respuesta inmediata + fire-and-forget) y `runInformePipeline` (transiciones, validación `schema_version`, validación Zod de ambas mitades, sobrescritura de índices con `indexToSemaphore`, validación cruzada de `seccion_code` de hallazgos/día a día contra `canonical_json.sections`, persistencia `prompt_version`/`model`, manejo de error sin drafts parciales, termina siempre en `borrador` o `error`). Cubre: **R5, R6, R9, R12, R13, R24**.
- [x] T8 — Implementar `src/lib/server/informe/guard.ts`: `expireStaleGenerating` con `INFORME_GENERATION_TIMEOUT_MS` (default 300000). Cubre: **R14**.

## API routes

- [x] T9 — Extraer `requireAdminApi` de `src/routes/api/audits/[id]/export/+server.ts` a `src/lib/server/api/guards.ts` (reutilizado en export sin cambiar comportamiento) y agregar `requireReportReadAccess`: admin siempre; técnico asignado solo lectura de informes `aprobado` sin `internal_draft`. Cubre: **R1**.
- [x] T10 — `POST/GET /api/audits/[id]/report/+server.ts`: crear versión (201 con `{ report_id, version, status }`, 409 no cerrada, 503 sin key; regenerar = nueva versión) y listar versiones ordenadas. Cubre: **R1, R2, R3, R4, R6, R21, R27**.
- [x] T11 — `GET .../report/[version]/status/+server.ts`: estado por versión aplicando `expireStaleGenerating`. Cubre: **R14, R15**.
- [x] T12 — `GET/PATCH .../report/[version]/+server.ts`: detalle con `internal_draft` (solo admin; técnico asignado GET solo `aprobado` sin `internal_draft`) y PATCH de `client_draft`/`loom_url` (400 Zod, 409 fuera de `borrador`, re-sobrescritura de índices, `edited_by/edited_at`; con `origin: 'inline'` agrega entrada `audit_report_edit` y devuelve `seq`). Sumar `GET .../report/[version]/edits` (solo admin, historial append-only). Cubre: **R1, R12, R17, R20, R25, R31**.
- [x] T13 — `POST .../report/[version]/retry/+server.ts` (409 si status ≠ `error`, misma fila y versión) y `POST .../report/[version]/approve/+server.ts` (409 si status ≠ `borrador`; segundo approve y PATCH posterior → 409). Cubre: **R22, R23**.

## UI

- [x] T14 — Detalle de auditoría (`(app)/auditorias/[id]/+page.server.ts` + `.svelte`): sección «Informe IA» con listado de versiones (estado, fechas, quién aprobó), CTA «Generar informe» solo auditoría `cerrada` + admin, badge de estado con polling (`src/lib/client/informe/polling.ts`, `report-status-badge.svelte`). Cubre: **R15, R27**.
- [x] T15 — Pantalla de revisión `(app)/auditorias/[id]/informe/[version]/`: tabs Informe cliente / Vista interna (`internal-view.svelte` con `upsell_findings` + recomendaciones), edición por sección (`section-editor.svelte` → PATCH), campo Loom, acciones Aprobar / Regenerar / Reintentar según estado. Cubre: **R15, R17, R20, R21, R22, R23, R25**.
- [x] T16 — Render: `src/lib/components/informe/report-render.svelte` implementando el template A4 oficial (7 páginas: portada dark, resumen con gauge + 3 stat-cards, tabla de hallazgos con dots `indexToSemaphore`, riesgos en grid, plan con timeline, día a día, cierre dark con contacto fijo), solo `client_draft` + `stripInternalFindings`, scores por circuito resueltos del snapshot vía `seccion_code`, colores con tokens `--sys-*`, logos directo del CDN R2 (`__LOGO_VERT__` → `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png` portada/cierre dark; `__LOGO_COLOR__` → `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_horizontal_b.png` footers claros), atributos `data-field` en cada bloque de texto del draft (los bloques canónicos no llevan), placeholder «a editar» cuando `circuitos_con_controles` es null, `@media print` (incl. Loom oculto), bloque Loom condicional solo pantalla + ruta `(app)/auditorias/[id]/informe/[version]/imprimir/` (acceso de técnico asignado solo si `aprobado`). QA visual: imprimir con 3, 4 y 5 riesgos sin desbordar las páginas A4. Cubre: **R1, R16, R25, R26, R30**.
- [x] T16b — Implementar `src/lib/components/informe/inline-editor.svelte` + `src/lib/client/informe/inline-edit.ts`: modo edición sobre `report-render` (solo admin + estado `borrador`), `contenteditable` en bloques `data-field`, serialización `textContent` (texto plano) al path del `client_draft`, autosave con debounce 1 s → PATCH `origin: 'inline'`, feedback «Guardado (edición N)», error Zod marca el bloque y revierte, botón «Listo» (sin botón guardar). Cubre: **R30, R31**.

## Variables de entorno

- [x] T17 — Documentar `ANTHROPIC_API_KEY`, `INFORME_CLAUDE_MODEL`, `INFORME_GENERATION_TIMEOUT_MS` en `.env.example` y agregar `@anthropic-ai/sdk` a dependencies. Cubre: **R3, R8, R14**.

## Tests unitarios

- [x] T18 — `tests/fixtures/informe-claude-mock.ts` (respuesta válida, JSON inválido, throw, promesa colgada) y fixture canónico estable con lo que el template A4 consume: `client.cuit`, `market_data.modulos_tango`, varias secciones con score (cubriendo los tres rangos de semáforo) y `closed_at`. Cubre: **R28**.
- [x] T19 — `tests/informe-state-machine.test.ts`: tabla de transiciones válidas; `aprobado→borrador`, `pendiente→aprobado`, `generando→aprobado` lanzan `InformeInvalidTransitionError`. Cubre: **R7, R24**.
- [x] T20 — `tests/informe-schemas.test.ts`: drafts válidos pasan; sin `resumen.diagnostico`, 6 riesgos, 2 observaciones transversales, etapa sin `semana`, circuito día a día con 2 funcionalidades, clave extra (`upsell`), recomendación sin `rango_estimado`, `urgencia` fuera de enum y URL no-Loom rechazados. Cubre: **R10, R11, R16, R25**.
- [x] T21 — `tests/informe-prompt.test.ts`: prompt importado del módulo versionado (no inline), contiene instrucción líneas/rangos + prohibición de producto cerrado y los seis términos de jerga prohibida. Cubre: **R9, R18, R19**.
- [x] T22 — `tests/informe-pipeline.test.ts`: usa builder canónico (spy) y rechaza `schema_version` distinta; adapter recibe modelo de env (override y default) y arma `model`/`system`/`messages` (sin `output_config`); índices inventados por el mock quedan sobrescritos con canónico + semáforo coherente; draft con `seccion_code` inexistente en el snapshot termina en `error`; fila guarda `prompt_version` y `model`; mock que lanza y mock inválido dejan `error` con mensaje y drafts NULL; pipeline exitoso termina en `borrador`, nunca `aprobado`. Cubre: **R5, R8, R9, R12, R13, R24**.
- [x] T23 — `tests/informe-render.test.ts`: snapshot con fixture estable contiene las siete páginas/secciones del template A4, gauge con `stroke-dasharray` derivado del índice del fixture canónico, dots de semáforo coherentes con `indexToSemaphore`, scores de la tabla provenientes del fixture canónico (no del draft), variables `--sys-*`, URLs de logo del CDN R2 (`sys_vertical_w.png`, `sys_horizontal_b.png`) y regla `@media print`; con `upsell_findings` poblados no aparece ninguno de sus textos; iframe Loom presente/ausente según `loom_url` y oculto en print; en modo edición los bloques del draft exponen `contenteditable` + `data-field` y los bloques canónicos (score, gauge) no; `circuitos_con_controles` null renderiza «a editar». Cubre: **R12, R16, R25, R26, R30**.

## Tests API e integración

- [x] T24 — `tests/api/informe-create.test.ts`: sin sesión 401, `tecnico` 403, admin 2xx; auditoría `en_cierre` 409 sin fila nueva; sin `ANTHROPIC_API_KEY` 503 sin fila nueva; primer POST version 1 y segundo version 2 con snapshot `schema_version='1.0'`; respuesta inmediata `pendiente` con mock colgado; regenerar con v1 en `borrador` crea v2 sin tocar v1; GET listado ordenado. Cubre: **R1, R2, R3, R4, R6, R21, R27**.
- [x] T25 — `tests/api/informe-status.test.ts`: estado por versión; fila `generando` con `updated_at` viejo se reporta y persiste `error` (timeout), fila reciente sigue `generando`. Cubre: **R14, R15**.
- [x] T26 — `tests/api/informe-review.test.ts`: GET detalle incluye `internal_draft` solo para admin; PATCH válido persiste edición con `edited_by/edited_at`; PATCH sobre `aprobado` 409; PATCH inválido 400; retry sobre `error` reejecuta y termina `borrador` con la misma versión, retry sobre `borrador` 409; approve persiste quién/cuándo, segundo approve 409; técnico asignado GET sobre `aprobado` 200 sin `internal_draft`, sobre `borrador` 403, no asignado 403; dos PATCH `origin: 'inline'` crean entradas `audit_report_edit` seq 1 y 2 con snapshot y summary «Edición inline», PATCH inline con HTML embebido persiste texto plano, GET `/edits` lista el historial. Cubre: **R1, R17, R20, R22, R23, R30, R31**.

## E2E y cierre

- [x] T27 — `e2e/informe.spec.ts` (Claude mockeado): auditoría cerrada → generar → indicador «Generando»→«Borrador» → editar una sección → edición inline (activar modo edición, editar un bloque, esperar autosave «Guardado (edición 1)», salir con «Listo») → aprobar → abrir render imprimible; detalle muestra listado y CTA. Cubre: **R15, R27, R29, R30, R31**.
- [x] T28 — Ejecutar `pnpm test` (suite informe verde sin `ANTHROPIC_API_KEY` real) y `pnpm exec playwright test e2e/informe.spec.ts`. Cubre: **R28, R29**.
- [x] T29 — Ejecutar `./init.sh` exit code 0 y completar trazabilidad R→test en `progress/impl_14_informe_ia.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → api/informe-create.test.ts (401/403/2xx) + api/informe-review.test.ts (técnico asignado lee aprobado)
- R2 → api/informe-create.test.ts (en_cierre 409)
- R3 → api/informe-create.test.ts (503 sin key)
- R4 → api/informe-create.test.ts (version 1/2, snapshot 1.0)
- R5 → informe-pipeline.test.ts (builder canónico, schema_version)
- R6 → api/informe-create.test.ts (respuesta inmediata, mock colgado)
- R7 → informe-state-machine.test.ts
- R8 → informe-pipeline.test.ts (modelo env/default, JSON por prompt sin output_config)
- R9 → informe-prompt.test.ts + informe-pipeline.test.ts (prompt_version/model persistidos)
- R10 → informe-schemas.test.ts (draft cliente)
- R11 → informe-schemas.test.ts (draft interno)
- R12 → informe-pipeline.test.ts (índices sobrescritos, seccion_code inválido) + informe-render.test.ts (scores del snapshot)
- R13 → informe-pipeline.test.ts (error sin drafts parciales)
- R14 → api/informe-status.test.ts (timeout)
- R15 → api/informe-status.test.ts + e2e/informe.spec.ts
- R16 → informe-render.test.ts + informe-schemas.test.ts (strict)
- R17 → api/informe-review.test.ts + e2e (tab vista interna)
- R18 → informe-prompt.test.ts (líneas/rangos)
- R19 → informe-prompt.test.ts (jerga prohibida)
- R20 → api/informe-review.test.ts (PATCH)
- R21 → api/informe-create.test.ts (regenerar v2)
- R22 → api/informe-review.test.ts (retry)
- R23 → api/informe-review.test.ts (approve inmutable)
- R24 → informe-pipeline.test.ts + informe-state-machine.test.ts
- R25 → informe-schemas.test.ts + informe-render.test.ts (Loom)
- R26 → informe-render.test.ts (snapshot branded + print)
- R27 → api/informe-create.test.ts (listado) + e2e (CTA)
- R28 → pnpm test suite informe sin ANTHROPIC_API_KEY
- R29 → e2e/informe.spec.ts
- R30 → informe-render.test.ts (contenteditable/data-field) + api/informe-review.test.ts (texto plano)
- R31 → api/informe-review.test.ts (historial seq 1/2) + e2e/informe.spec.ts (autosave «Guardado (edición 1)» + «Listo»)
```
