# Implementación #7 `07_form_tecnico`

Sesión implementer 2026-06-09.

## Resumen

Form técnico PWA en `/auditorias/{id}/form`: 12 field_types, autosave debounced + cola IndexedDB, export/import JSON, fotos R2, score en vivo, nav libre por secciones, transición a `en_cierre`.

## Trazabilidad R → test

- R1 → `tests/api/audit-form-load.test.ts`
- R2 → `tests/form-field-renderer.test.ts`, `e2e/form-tecnico.spec.ts`
- R3 → `e2e/form-tecnico.spec.ts` (viewport 375×812)
- R4 → `tests/form-preload.test.ts`
- R5 → `tests/form-section-nav.test.ts`
- R6 → `tests/form-autosave.test.ts`
- R7 → `tests/api/audit-form-save.test.ts`
- R8 → `tests/form-retry-queue.test.ts`, e2e offline (cola)
- R9 → `tests/form-save-indicator.test.ts`, e2e
- R10 → `tests/form-export-import.test.ts` (export)
- R11 → `tests/form-export-import.test.ts` (import)
- R12 → `tests/form-photo-upload.test.ts`
- R13 → `tests/form-image-compress.test.ts`
- R14 → `tests/form-table-camera.test.ts`
- R15 → `tests/form-live-score.test.ts`
- R16 → `tests/form-live-score.test.ts` (bandas)
- R17 → `tests/form-live-score.test.ts` (N/A)
- R18 → `tests/form-item-ux.test.ts`
- R19 → `tests/form-field-renderer.test.ts`
- R20 → `tests/api/audit-form-complete.test.ts`
- R21 → `tests/pwa-manifest.test.ts`
- R22 → `tests/pwa-sw.test.ts`
- R23 → `e2e/form-tecnico.spec.ts` (desktop)
- R24 → suite `pnpm test -- tests/form-* tests/api/audit-form tests/pwa-*`
- R25 → `e2e/form-tecnico.spec.ts`

## Verificación ejecutada

- `pnpm test -- tests/form-* tests/api/audit-form* tests/pwa-*` → 34 tests OK
- `pnpm run build` → OK
- `pnpm exec playwright test e2e/form-tecnico.spec.ts` → 2 tests OK
- `./init.sh` → exit 0 (194 tests OK)

## Archivos clave

| Área | Paths |
|---|---|
| Scoring | `src/lib/scoring/{rubric,section-score,types}.ts` |
| Dominio | `src/lib/server/form/*`, `src/lib/server/db/audit-form.ts` |
| API | `src/routes/api/audits/[auditId]/responses/` |
| UI | `src/routes/(app)/auditorias/[id]/form/` |
| Componentes | `src/lib/components/form/*` |
| Cliente | `src/lib/client/form/*` |
| PWA | `static/manifest.webmanifest`, `static/sw.js`, `src/hooks.client.ts` |
| E2E | `e2e/form-tecnico.spec.ts`, `e2e/ensure-form-audit.ts` |
