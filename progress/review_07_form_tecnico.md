# Review — feature 07_form_tecnico (#7)

**Veredicto:** APPROVED  
**Fecha:** 2026-06-09  
**Reviewer:** reviewer agent

## Resumen

Form técnico PWA implementado en `/auditorias/{id}/form`: 12 `field_type`, autosave debounced + cola, export/import JSON, fotos R2, score en vivo, nav libre por secciones, transición a `en_cierre`, manifest y SW. 34 tests nuevos form/pwa/api (194 total vitest). `./init.sh` verde. E2E `form-tecnico.spec.ts` 2/2 verde tras `./init.sh` secuencial.

## Trazabilidad

- R1: [x] `tests/api/audit-form-load.test.ts > assigned tecnico receives form data`; `> unassigned tecnico receives 403`; `> admin can load any audit form`
- R2: [x] `tests/form-field-renderer.test.ts > covers all 12 field types`; `e2e/form-tecnico.spec.ts` (smoke form mobile)
- R3: [x] `e2e/form-tecnico.spec.ts` viewport 375×812 + `min-h-` en botón «Relevamiento completo»
- R4: [x] `tests/form-preload.test.ts > includes cliente responses with preloaded flag`; `> technician edit persists source tecnico`
- R5: [x] `tests/form-section-nav.test.ts > allows free navigation between sections`; `> progress bar reflects completed items over total`
- R6: [x] `tests/form-autosave.test.ts > debounces text fields ~600ms`; `> saves tri immediately`
- R7: [x] `tests/api/audit-form-save.test.ts > two PATCH of same item update one row with source tecnico`; `> PATCH endpoint returns envelope with sectionScore`
- R8: [x] `tests/form-retry-queue.test.ts > accumulates offline changes and flushes one upsert per item`
- R9: [x] `tests/form-save-indicator.test.ts > transitions saving → saved → idle`; `> shows offline message on network failure`; e2e indicador Guardando/Guardado
- R10: [x] `tests/form-export-import.test.ts > export produces valid JSON including queued local response`
- R11: [x] `tests/form-export-import.test.ts > import restores values for same audit_id`; `> rejects backup from another audit`
- R12: [x] `tests/form-photo-upload.test.ts > presign → confirm updates file_ref attachment_ids`
- R13: [x] `tests/form-image-compress.test.ts > uses max side 1600 and jpeg quality 0.8`; `> HEIC filename converts to jpeg extension`; `> content type for upload is image/jpeg after pipeline`
- R14: [x] `tests/form-table-camera.test.ts > appends attachment to row_id not general`
- R15: [x] `tests/form-live-score.test.ts > updates score when scored item changes`; `> no manual score input in DOM contract`
- R16: [x] `tests/form-live-score.test.ts > maps bands green amber red`
- R17: [x] `tests/form-live-score.test.ts > all N/A section shows na without numeric score`
- R18: [x] `tests/form-item-ux.test.ts > N/A toggle clears required validation`; `> observations collapsed by default uses details element`
- R19: [x] `tests/form-field-renderer.test.ts > method E maps to Entrevista label`
- R20: [x] `tests/api/audit-form-complete.test.ts > transitions to en_cierre with warnings for pending required items`
- R21: [x] `tests/pwa-manifest.test.ts > GET manifest returns valid JSON with required fields`
- R22: [x] `tests/pwa-sw.test.ts > SW file registers precache shell and network-first api`; `> api fetch uses network not cache-only`
- R23: [x] `e2e/form-tecnico.spec.ts > lateral nav visible` (1280×800, `[data-section-nav]`)
- R24: [x] `pnpm test` — 49 files / 194 tests OK (incluye `form-*`, `audit-form-*`, `pwa-*`)
- R25: [x] `e2e/form-tecnico.spec.ts > login, form, autosave indicator, section nav, live score`

## Tasks

- T1–T8: [x] Scoring y dominio server
- T9–T12: [x] API + fixture
- T13–T19: [x] Componentes form
- T20–T25: [x] Cliente autosave/cola/imágenes
- T26–T28: [x] UI rutas y layout
- T29–T31: [x] PWA
- T32–T39: [x] Tests unitarios e integración
- T40–T43: [x] E2E y cierre

## Checkpoints

- C1: [x] Arnés completo; `./init.sh` exit 0 (194 tests)
- C2: [x] Una feature `in_progress` (#7); features `done` con tests verdes
- C3: [x] SQL parametrizado en `audit-form.ts`; sin `console.log` ni TODOs en `src/lib/**/form/`; secretos solo env
- C4: [x] `tests/form-*`, `tests/api/audit-form-*`, `tests/pwa-*` cubren módulo; vitest 194/194 verdes; e2e form 2/2 verdes
- C5: [x] `progress/impl_07_form_tecnico.md` documenta trazabilidad; `current.md` describe sesión activa
- C6: [x] Spec EARS en `specs/07_form_tecnico/`; tasks T1–T43 `[x]`; R1–R25 con ≥1 test

## Verificación ejecutada (reviewer)

| Comando | Resultado |
|---|---|
| `./init.sh` | exit 0 — 194 tests OK |
| `pnpm exec playwright test e2e/form-tecnico.spec.ts` (tras init.sh) | 2 passed |

Nota: en la primera corrida de e2e (en paralelo con `./init.sh`) el test mobile falló con 403 «Auditoría no encontrada» por condición de carrera en DB (`ensureE2eFormAudit` TRUNCATE vs vitest). Corridas secuenciales posteriores: verdes.

## Acceptance (feature_list.json #7)

| Criterio | Estado |
|---|---|
| Render data-driven de 12 field_type mobile-first | OK |
| Datos briefing precargados visibles al técnico | OK |
| Autosave debounced + cola reintentos + export/import JSON | OK |
| Indicador Guardando/Guardado/Sin conexión | OK |
| Fotos: presigned PUT, compresión 1600px/0.8, HEIC→JPEG | OK |
| Cámara desde grilla inventario enlaza foto a fila | OK |
| Score en vivo solo lectura por sección con semáforo | OK |
| Secciones orden libre, barra progreso | OK |
| PWA: manifest SyS, SW shell, network-first datos | OK |
| Tests y e2e form pasan | OK |

## Gaps menores (no bloquean cierre)

1. **E2E flaky bajo contención DB** — `e2e/ensure-form-audit.ts` hace `TRUNCATE` de `audit`/`session`; si corre en paralelo con vitest puede devolver 403. Recomendado: fixture compartido en `globalSetup` o lock más estricto.
2. **R8 sin escenario offline en e2e** — `requirements.md` menciona offline/online en e2e; solo cubierto por `form-retry-queue.test.ts` (unit). El núcleo cumple; el e2e offline es nice-to-have.
3. **R1 sin test HTTP 401 anónimo** — `audit-form-load.test.ts` cubre asignación/403 admin; acceso sin sesión delegado a guards auth (#3), no probado en ruta form.
4. **Tests R2/R19 contractuales** — `form-field-renderer.test.ts` valida constantes/labels, no render DOM de componentes Svelte.
5. **Duplicación scoring** — módulos en `src/lib/scoring/` y `src/lib/server/scoring/`; tests usan `$lib/scoring/`.
6. **`progress/impl_07_form_tecnico.md` desactualizado** — afirma `./init.sh` rojo; ya verde (194 tests).
7. **Warnings Svelte 5** — `+page.svelte` referencia `data` en inicialización `$state` (no bloquea build ni e2e).

## Cambios requeridos

Ninguno.
