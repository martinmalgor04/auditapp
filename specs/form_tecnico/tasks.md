# Tasks — form_tecnico

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_form_tecnico.md`.

> Prerrequisitos: #2 `modelo_datos`, #3 `auth_roles`, #5 `briefing_externo` (motor form parcial), #6 `storage_r2` en `done` para tareas de fotos (T14–T16).

## Scoring y dominio server

- [ ] T1 — Crear `src/lib/server/scoring/rubric.ts` y `section-score.ts` con `computeSectionScore` determinístico (rúbrica 0/50/100 por field_type). Cubre: **R15, R16, R17**.
- [ ] T2 — Crear `src/lib/server/form/errors.ts` (`AuditFormNotAllowedError`, `AuditFormNotEditableError`, `FormImportValidationError`). Cubre: **R1, R11, R20**.
- [ ] T3 — Implementar `src/lib/server/db/audit-form.ts`: load sections/items/responses, upsert, set status. Cubre: **R4, R7**.
- [ ] T4 — Implementar `load-form.ts` con merge respuestas cliente/técnico y flag `preloaded`. Cubre: **R4, R5**.
- [ ] T5 — Crear `schemas.ts` (`formSaveSchema`, `formBackupSchema` v1). Cubre: **R10, R11, R7**.
- [ ] T6 — Implementar `save-response.ts` con guards asignación y estados editables. Cubre: **R7**.
- [ ] T7 — Implementar `export-import.ts` (validación Zod, batch upsert). Cubre: **R10, R11**.
- [ ] T8 — Implementar `complete.ts` → `en_cierre` con warning ítems pending. Cubre: **R20**.

## API

- [ ] T9 — Crear `src/routes/api/audits/[auditId]/responses/+server.ts` (PATCH, envelope + `sectionScore` opcional). Cubre: **R7, R15**.
- [ ] T10 — Crear `src/routes/api/audits/[auditId]/responses/import/+server.ts` (POST). Cubre: **R11**.
- [ ] T11 — Implementar `+page.server.ts` load + action `complete`. Cubre: **R1, R20**.
- [ ] T12 — Añadir fixture `tests/fixtures/audit-form.ts` (12 field_types, respuestas cliente). Cubre: **R24**.

## Componentes form (extender #5)

- [ ] T13 — Completar `field-renderer.svelte` y fields faltantes: `datetime`, `money`, `table`, `file_ref`. Cubre: **R2**.
- [ ] T14 — Implementar `field-table.svelte` con mini-grilla, `row_id` y botón cámara por fila. Cubre: **R14**.
- [ ] T15 — Implementar `field-file-ref.svelte` (captura nativa + galería). Cubre: **R12**.
- [ ] T16 — Crear `method-badge.svelte`, `preloaded-badge.svelte`, `live-section-score.svelte`. Cubre: **R4, R15, R16, R19**.
- [ ] T17 — Implementar `section-nav.svelte` (orden libre + barra progreso). Cubre: **R5**.
- [ ] T18 — Extender `save-indicator.svelte` con estado «Sin conexión — se reintenta». Cubre: **R9**.
- [ ] T19 — Implementar `export-import-panel.svelte`. Cubre: **R10, R11**.

## Cliente: autosave, cola, imágenes

- [ ] T20 — Implementar `src/lib/client/form/autosave.ts` (debounce 600 ms / inmediato). Cubre: **R6**.
- [ ] T21 — Implementar `retry-queue.ts` con IndexedDB y flush on `online`. Cubre: **R8, R9**.
- [ ] T22 — Implementar `backup.ts` (export JSON local, import vía API). Cubre: **R10, R11**.
- [ ] T23 — Implementar `image-pipeline.ts` (HEIC→JPEG, resize 1600px, quality 0.8). Cubre: **R13**.
- [ ] T24 — Integrar flujo foto: presign (#6) → PUT → confirm → update `table`/`file_ref`. Cubre: **R12, R14**.
- [ ] T25 — Implementar `live-score.ts` (recalcular al guardar ítem). Cubre: **R15**.

## UI rutas y layout

- [ ] T26 — Crear `+layout.svelte` form (mobile shell, indicador sticky, targets ≥44px). Cubre: **R3, R9**.
- [ ] T27 — Implementar `+page.svelte`: sección activa, N/A, observaciones colapsadas, complete. Cubre: **R5, R18, R20**.
- [ ] T28 — Añadir layout desktop ≥1024px (nav lateral). Cubre: **R23**.

## PWA

- [ ] T29 — Crear `static/manifest.webmanifest` e íconos SyS en `static/icons/`. Cubre: **R21**.
- [ ] T30 — Configurar service worker (vite-plugin-pwa o manual): precache shell, network-first `/api/*`. Cubre: **R22**.
- [ ] T31 — Registrar manifest y SW en `app.html` / hooks SvelteKit. Cubre: **R21, R22**.

## Tests unitarios e integración

- [ ] T32 — `tests/form-field-renderer.test.ts` + `form-item-ux.test.ts`. Cubre: **R2, R18, R19**.
- [ ] T33 — `tests/form-preload.test.ts` + `form-section-nav.test.ts`. Cubre: **R4, R5**.
- [ ] T34 — `tests/form-autosave.test.ts` + `form-retry-queue.test.ts` + `form-save-indicator.test.ts`. Cubre: **R6, R8, R9**.
- [ ] T35 — `tests/form-export-import.test.ts`. Cubre: **R10, R11**.
- [ ] T36 — `tests/form-image-compress.test.ts` + `form-photo-upload.test.ts` + `form-table-camera.test.ts`. Cubre: **R12, R13, R14**.
- [ ] T37 — `tests/form-live-score.test.ts`. Cubre: **R15, R16, R17**.
- [ ] T38 — `tests/api/audit-form-load.test.ts` + `audit-form-save.test.ts` + `audit-form-complete.test.ts`. Cubre: **R1, R7, R20**.
- [ ] T39 — `tests/pwa-manifest.test.ts` + `pwa-sw.test.ts`. Cubre: **R21, R22**.

## E2E y cierre

- [ ] T40 — Crear `e2e/form-tecnico.spec.ts`: login → form → autosave → score → offline recovery (mobile + desktop smoke). Cubre: **R3, R9, R23, R25**.
- [ ] T41 — Ejecutar `pnpm test` y `pnpm exec playwright test e2e/form-tecnico.spec.ts` en verde. Cubre: **R24, R25**.
- [ ] T42 — Ejecutar `./init.sh` exit code 0. Cubre: todos.
- [ ] T43 — Completar trazabilidad R→test en `progress/impl_form_tecnico.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → audit-form-load.test.ts
- R2 → form-field-renderer.test.ts, e2e smoke tipos
- R3 → e2e viewport móvil
- R4 → form-preload.test.ts
- R5 → form-section-nav.test.ts
- R6 → form-autosave.test.ts
- R7 → audit-form-save.test.ts
- R8 → form-retry-queue.test.ts, e2e offline
- R9 → form-save-indicator.test.ts, e2e
- R10 → form-export-import.test.ts (export)
- R11 → form-export-import.test.ts (import)
- R12 → form-photo-upload.test.ts
- R13 → form-image-compress.test.ts
- R14 → form-table-camera.test.ts
- R15 → form-live-score.test.ts
- R16 → form-live-score.test.ts (bandas)
- R17 → form-live-score.test.ts (N/A)
- R18 → form-item-ux.test.ts
- R19 → form-field-renderer.test.ts
- R20 → audit-form-complete.test.ts
- R21 → pwa-manifest.test.ts
- R22 → pwa-sw.test.ts
- R23 → e2e desktop viewport
- R24 → suite pnpm test form-*
- R25 → e2e/form-tecnico.spec.ts flujo feliz
```
