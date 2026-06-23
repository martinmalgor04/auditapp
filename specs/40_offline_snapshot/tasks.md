# Tasks — #40 Snapshot local del relevamiento (recuperación offline)

## Lista de tareas

- [x] T1 — Exportar `DB_NAME` y `DB_VERSION = 2` como constantes desde `src/lib/client/form/retry-queue.ts` y extender `onupgradeneeded` para crear el store `form_draft` (keyPath `auditId`) cuando `oldVersion < 2`, sin tocar `form_retry_queue`. Cubre: R1, R20.

- [x] T2 — Crear `src/lib/client/form/draft-store.ts` con los tipos `DraftResponses` y `FormDraft`, y las funciones `openDb`, `saveDraft`, `loadDraft` y `deleteDraft`. `openDb` importa `DB_NAME` y `DB_VERSION` de `retry-queue.ts`. `saveDraft` es fire-and-forget (captura errores en `console.warn`). Cubre: R1, R3, R4.

- [x] T3 — Crear `tests/draft-store.test.ts` con vitest + `fake-indexeddb`. Casos: (a) `saveDraft` crea documento con `savedAt` ISO; (b) `saveDraft` sobreescribe el draft existente para el mismo `auditId`; (c) `loadDraft` devuelve `null` cuando no hay draft; (d) `loadDraft` devuelve el draft guardado; (e) `deleteDraft` elimina el draft y subsecuente `loadDraft` devuelve `null`. Cubre: R1, R3, R5, R6.

- [x] T4 — Crear `src/lib/components/form/DraftRecoveryBanner.svelte` (Svelte 5 runes). Props: `savedAt: string`, callbacks `onrestore` y `ondiscard`. Muestra la fecha/hora formateada en local. Dos botones: **Restaurar borrador** y **Descartar**. Sin lógica de IDB; solo UI. Cubre: R8, R9.

- [x] T5 — Modificar `src/routes/(app)/auditorias/[id]/form/+page.svelte`: en `onMount`, llamar `loadDraft(auditId)` y asignar a estado reactivo `pendingDraft: FormDraft | null`. Renderizar `DraftRecoveryBanner` condicionalmente cuando `pendingDraft !== null`. Cubre: R7, R8, R9, R10.

- [x] T6 — En `+page.svelte`, implementar el handler `handleRestore()`: iterar `pendingDraft.responses`, aplicar valores sobre el estado reactivo del form, marcar ítems como dirty, setear `pendingDraft = null`. Enlazar con el evento `onrestore` del banner. No disparar PATCH. Cubre: R11, R12, R13, R14.

- [x] T7 — En `+page.svelte`, implementar el handler `handleDiscard()`: llamar `deleteDraft(auditId)` y setear `pendingDraft = null`. Enlazar con el evento `ondiscard` del banner. Cubre: R6, R15, R16.

- [x] T8 — En `+page.svelte`, integrar la escritura del draft en el wrapper de `scheduleSave`: tras actualizar el estado reactivo del campo (y antes o inmediatamente después de llamar al autosave), construir el mapa completo de respuestas y llamar `void saveDraft(...)`. La llamada es fire-and-forget. Cubre: R2, R3, R4, R17, R18, R19.

- [x] T9 — En `+page.svelte`, agregar la limpieza del draft al detectar que la retry-queue quedó vacía y el último outcome fue `saved`: llamar `void deleteDraft(auditId)`. Punto de enganche: callback `onFlushed` de `registerOnlineFlush` y en el path exitoso post-`patch`. Cubre: R5.

- [x] T10 — Crear `tests/draft-recovery.test.ts` con vitest. Casos (lógica pura, sin montar Svelte): (a) `handleRestore` aplica todos los campos del draft sobre el mapa de respuestas del form; (b) `handleRestore` marca ítems como dirty; (c) `handleRestore` no dispara ningún PATCH (verificado con spy); (d) `handleDiscard` llama `deleteDraft` con el `auditId` correcto; (e) campos `file_ref` con valor null en el draft se aplican sin error (R19). Cubre: R11, R12, R13, R14, R15, R16, R19.

- [x] T11 — Ejecutar `pnpm run check` y `pnpm test` y verificar que todos los tests existentes siguen verdes y los nuevos T3 y T10 pasan. Cubre: R20 (no regresión).
