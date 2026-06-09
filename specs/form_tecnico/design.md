# Design — form_tecnico

## Alcance

Formulario PWA mobile-first del técnico en `/audits/{auditId}/form`: render data-driven de 12 `field_type`, autosave con cola persistente, export/import JSON de respaldo, fotos vía R2 con compresión cliente, score por sección en vivo (solo lectura), navegación libre por secciones y service worker de shell.

| Incluido | Excluido (otras features) |
|---|---|
| Ruta autenticada form técnico | Login, guards base (#3 ya entrega hooks) |
| Render 12 tipos + UX mobile | Briefing público (#5) |
| Autosave + cola + export/import | Scoring índices IT/ERP/cierre (#8) |
| Compresión HEIC/JPEG cliente | Presigned server-side (#6 ya entrega API) |
| Cámara por fila inventario | Pantalla cierre, preview informe (#8) |
| Score sección en vivo (rúbrica ítem) | Contrato JSON IA (#9) |
| PWA manifest + SW | Deploy prod PWA (#10) |
| Transición → `en_cierre` | Reabrir auditoría (#8) |

## Dependencias previas

| Feature | Contrato usado |
|---|---|
| `modelo_datos` (#2) | Tablas `audit`, `audit_response`, `template_item`, `section`, `audit_section_score`; 12 `field_type`; rúbrica en `options` |
| `auth_roles` (#3) | `event.locals.user`, guard técnico asignado / admin |
| `briefing_externo` (#5) | `src/lib/components/form/field-renderer.svelte`, fields compartidos, patrones autosave |
| `storage_r2` (#6) | `POST .../presign-put`, `POST .../confirm`, `GET .../presign-get` |

Si #6 no está `done`, el implementer no puede completar T14–T16 (fotos); el resto del form es independiente.

## Arquitectura

```
GET /audits/[auditId]/form
  └─ loadAuditForm(auditId, user) → sections, items, responses (cliente+tecnico), scores
  └─ +page.svelte → SectionNav + FieldRenderer + LiveScore + SaveIndicator

PATCH /api/audits/[auditId]/responses
  └─ saveFormResponse → upsert audit_response (source=tecnico)

POST /api/audits/[auditId]/responses/export  (opcional: client-only export)
POST /api/audits/[auditId]/responses/import

POST /audits/[auditId]/form?/complete
  └─ completeRelevamiento → audit.status = en_cierre

Client:
  formStore (Svelte writable) + retryQueue (IndexedDB)
  imagePipeline: HEIC→JPEG → resize → presign → PUT → confirm
  liveScore: debounced re-fetch o client compute mirroring server

SW (vite-plugin-pwa o manual):
  precache: shell, icons, fonts
  runtime: network-first /api/*
```

Capas (`docs/architecture.md`):

- `src/lib/server/form/` — dominio load/save/complete/export-import.
- `src/lib/server/scoring/section-score.ts` — cálculo determinístico por sección (reutilizado en #8).
- `src/lib/client/form/` — autosave, cola, compresión imágenes (solo browser APIs).
- `src/routes/(app)/audits/[auditId]/form/` — UI PWA.
- Componentes compartidos en `src/lib/components/form/` (extender los de #5).

## Archivos a crear o modificar

### Dominio server

| Archivo | Propósito |
|---|---|
| `src/lib/server/form/errors.ts` | `AuditFormNotAllowedError`, `AuditFormNotEditableError`, `FormImportValidationError` |
| `src/lib/server/form/load-form.ts` | Secciones, ítems técnico/admin, respuestas merge, flag `preloaded` |
| `src/lib/server/form/save-response.ts` | Upsert con Zod + guard asignación |
| `src/lib/server/form/complete.ts` | Validación blanda + `en_cierre` |
| `src/lib/server/form/export-import.ts` | Schema JSON backup, merge import |
| `src/lib/server/form/schemas.ts` | `formSaveSchema`, `formBackupSchema` v1 |
| `src/lib/server/db/audit-form.ts` | SQL: load sections/items/responses, upsert, set status |
| `src/lib/server/scoring/section-score.ts` | `computeSectionScore(section, items, responses)` |
| `src/lib/server/scoring/rubric.ts` | Reglas 0/50/100 por field_type (de #2 options) |

### API routes

| Archivo | Propósito |
|---|---|
| `src/routes/api/audits/[auditId]/responses/+server.ts` | PATCH autosave |
| `src/routes/api/audits/[auditId]/responses/import/+server.ts` | POST import JSON |
| `src/routes/api/audits/[auditId]/sections/[sectionId]/score/+server.ts` | GET score en vivo (opcional si se calcula client-side con mismo algoritmo exportado) |

### Rutas UI

| Archivo | Propósito |
|---|---|
| `src/routes/(app)/audits/[auditId]/form/+layout.svelte` | Shell mobile + indicador guardado sticky |
| `src/routes/(app)/audits/[auditId]/form/+page.server.ts` | `load`, action `complete` |
| `src/routes/(app)/audits/[auditId]/form/+page.svelte` | Orquestación sección activa, export/import buttons |

### Componentes UI

| Archivo | Propósito |
|---|---|
| `src/lib/components/form/section-nav.svelte` | Lista secciones + barra progreso + orden libre |
| `src/lib/components/form/live-section-score.svelte` | Score readonly + semáforo |
| `src/lib/components/form/save-indicator.svelte` | Guardando / Guardado / Sin conexión (extender briefing) |
| `src/lib/components/form/method-badge.svelte` | O/E/C/X |
| `src/lib/components/form/fields/field-table.svelte` | Mini-grilla + botón cámara por fila |
| `src/lib/components/form/fields/field-file-ref.svelte` | Tomar foto / subir |
| `src/lib/components/form/fields/field-percent.svelte` | Solo si plantilla lo usa vía `number` con options — usar `field-number` |
| `src/lib/components/form/fields/*.svelte` | Completar 12 tipos (extender subset #5) |
| `src/lib/components/form/preloaded-badge.svelte` | Marca «precargado» |
| `src/lib/components/form/export-import-panel.svelte` | UI export/import JSON |

### Cliente (browser)

| Archivo | Propósito |
|---|---|
| `src/lib/client/form/autosave.ts` | Debounce, PATCH, estado indicador |
| `src/lib/client/form/retry-queue.ts` | IndexedDB `form_retry_queue`, flush on online |
| `src/lib/client/form/backup.ts` | Export/import JSON local + API import |
| `src/lib/client/form/image-pipeline.ts` | HEIC decode, resize canvas, JPEG 0.8 |
| `src/lib/client/form/live-score.ts` | Subscribe cambios → fetch/compute score |

### PWA

| Archivo | Propósito |
|---|---|
| `static/manifest.webmanifest` | Nombre SyS, icons, theme, start_url |
| `static/icons/icon-192.png`, `icon-512.png` | Íconos PWA (marca SyS) |
| `src/service-worker.ts` o config `vite-plugin-pwa` | Precache shell, network-first API |
| `src/app.html` | `<link rel="manifest">`, meta theme-color |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/form-field-renderer.test.ts` | R2, R19 |
| `tests/form-preload.test.ts` | R4 |
| `tests/form-section-nav.test.ts` | R5 |
| `tests/form-autosave.test.ts` | R6 |
| `tests/form-retry-queue.test.ts` | R8 |
| `tests/form-save-indicator.test.ts` | R9 |
| `tests/form-export-import.test.ts` | R10, R11 |
| `tests/form-photo-upload.test.ts` | R12 |
| `tests/form-image-compress.test.ts` | R13 |
| `tests/form-table-camera.test.ts` | R14 |
| `tests/form-live-score.test.ts` | R15, R16, R17 |
| `tests/form-item-ux.test.ts` | R18 |
| `tests/api/audit-form-load.test.ts` | R1 |
| `tests/api/audit-form-save.test.ts` | R7 |
| `tests/api/audit-form-complete.test.ts` | R20 |
| `tests/pwa-manifest.test.ts` | R21 |
| `tests/pwa-sw.test.ts` | R22 |
| `tests/fixtures/audit-form.ts` | Auditoría `briefing_completo` con 12 tipos |
| `e2e/form-tecnico.spec.ts` | R3, R9, R14 smoke, R23, R25 |

## Firmas

### `loadAuditForm`

```typescript
export type FormItem = {
  id: string;
  sectionId: string;
  label: string;
  helpText: string | null;
  fieldType: FieldType;
  options: unknown;
  method: 'O' | 'E' | 'C' | 'X';
  required: boolean;
  allowNa: boolean;
  filledBy: 'tecnico' | 'admin' | 'cliente';
  sortOrder: number;
  value: unknown | null;
  na: boolean;
  notes: string | null;
  preloaded: boolean; // true si última escritura fue source=cliente y técnico no editó aún
};

export type FormSection = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  items: FormItem[];
  liveScore: number | null; // null si sección N/A
  scoreBand: 'green' | 'amber' | 'red' | 'na';
};

export function loadAuditForm(
  auditId: string,
  user: AppUser
): Promise<{ audit: AuditHeader; sections: FormSection[]; progressPct: number }>;
```

### `saveFormResponse`

```typescript
export function saveFormResponse(
  auditId: string,
  user: AppUser,
  payload: { itemId: string; value: unknown; na?: boolean; notes?: string }
): Promise<{ updatedAt: string }>;
```

### `computeSectionScore`

```typescript
export type SectionScoreResult = {
  score: number | null; // null = sección N/A, no puntúa
  band: 'green' | 'amber' | 'red' | 'na';
  itemContributions: Array<{ itemId: string; contribution: number | null }>;
};

export function computeSectionScore(input: {
  items: Array<{ id: string; fieldType: FieldType; options: unknown; scores: boolean }>;
  responses: Map<string, { value: unknown; na: boolean }>;
}): SectionScoreResult;
```

Algoritmo (determinístico, mismo input → mismo output):

1. Filtrar ítems con `scores=true` y respuesta no N/A.
2. Por ítem, aplicar rúbrica de `options` según `field_type` (#2): escala 0/50/100.
3. Promedio simple de contribuciones ítem → score sección entero 0–100.
4. Si ningún ítem scored aplica → `score: null`, `band: 'na'`.
5. Bandas: ≥70 green, 40–69 amber, &lt;40 red.

Persistencia: el score en vivo **no escribe** `audit_section_score` en cada keystroke; #8 persiste al cierre. Opcional: endpoint GET recalcula on demand.

### API PATCH `/api/audits/{auditId}/responses`

Request:

```json
{ "itemId": "uuid", "value": {}, "na": false, "notes": "..." }
```

Response:

```json
{ "success": true, "data": { "updatedAt": "...", "sectionScore": { "score": 72, "band": "green" } }, "error": null }
```

### JSON backup (`formBackupSchema` v1)

```typescript
export const formBackupSchema = z.object({
  schema_version: z.literal('1.0'),
  audit_id: z.string().uuid(),
  exported_at: z.string().datetime(),
  responses: z.array(
    z.object({
      item_id: z.string().uuid(),
      value: z.unknown(),
      na: z.boolean().default(false),
      notes: z.string().nullable().optional()
    })
  )
});
```

Export: merge server responses + cola local pendiente. Import: validar `audit_id`, upsert secuencial o batch, vaciar cola para ítems importados.

### Valor JSON `table` con fotos por fila

```typescript
const tableRowSchema = z.object({
  row_id: z.string().uuid(),
  cells: z.record(z.unknown()),
  attachment_ids: z.array(z.string().uuid()).default([])
});

const tableValueSchema = z.object({
  rows: z.array(tableRowSchema)
});
```

Flujo cámara fila:

1. Usuario agrega fila → `row_id = crypto.randomUUID()`.
2. Tap cámara en fila → `imagePipeline` → presign con `item_id` + metadata `row_id` en body extendido o inferido client-side.
3. Tras `confirm`, append `attachment_id` a `rows[i].attachment_ids` y autosave ítem `table`.

### `imagePipeline`

```typescript
export type PreparedImage = {
  blob: Blob;
  contentType: 'image/jpeg';
  sizeBytes: number;
  filename: string;
};

export async function prepareImageForUpload(file: File): Promise<PreparedImage>;
// HEIC → JPEG via heic2any o equivalente
// Canvas resize max side 1600, toBlob('image/jpeg', 0.8)
```

Constantes:

```typescript
export const IMAGE_MAX_SIDE_PX = 1600;
export const IMAGE_JPEG_QUALITY = 0.8;
export const AUTOSAVE_DEBOUNCE_MS = 600;
export const SCORE_GREEN_MIN = 70;
export const SCORE_AMBER_MIN = 40;
```

## Errores

| Situación | HTTP | Código |
|---|---|---|
| Sin sesión | 401 | — |
| Técnico no asignado | 403 | `AUDIT_FORM_NOT_ALLOWED` |
| Auditoría no editable | 409 | `AUDIT_FORM_NOT_EDITABLE` |
| item_id ajeno a auditoría | 403 | `ITEM_NOT_ALLOWED` |
| Import schema inválido | 400 | `FORM_IMPORT_VALIDATION` |
| Import audit_id distinto | 400 | `FORM_IMPORT_AUDIT_MISMATCH` |
| Presign falla (#6) | 502 | mensaje genérico |

Nunca exponer URLs R2 sin presign ni stack traces.

## Autosave y cola (cliente)

| Tipo campo | Debounce |
|---|---|
| `text`, notes, `list` texto | 600 ms |
| `bool`, `tri`, `select`, `multiselect`, `date`, `datetime`, `number`, `money` | 0 ms |
| `table` (add/remove row) | 0 ms |
| `table` (celda texto) | 600 ms |
| `file_ref` / foto fila | tras confirm upload |

Cola (`retry-queue.ts`):

- Store IndexedDB: `{ auditId, itemId, payload, enqueuedAt, attempts }`.
- Listener `online` + backoff exponencial (1s, 2s, 4s… max 30s).
- Flush exitoso elimina entrada; mismo upsert idempotente server-side.
- Indicador R9: `pendingCount > 0 && !navigator.onLine` → «Sin conexión — se reintenta».

Recarga: `load` trae server state; al montar, flush cola antes de mostrar «Guardado ✓».

## PWA

**Manifest** (`static/manifest.webmanifest`):

```json
{
  "name": "SyS Auditorías",
  "short_name": "SyS Audit",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#003366",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Colores exactos según skill `sys-brand`.

**Service worker:**

- Precache: app shell, `/icons/*`, fonts, `/_app/*` immutable.
- Runtime `/api/**`: `NetworkFirst` con timeout 3s → fallback JSON error offline.
- No cachear presigned URLs R2 (dominio externo).

Preferir `@vite-pwa/sveltekit` si ya está en #1; si no, SW manual documentado en task.

## UX mobile-first

- Una sección por vista; tabs o stepper horizontal con códigos A1, A2…
- Barra progreso global arriba (`progressPct`).
- Botones «Anterior» / «Siguiente» + picker de sección (orden libre).
- `allow_na`: chip «N/A» junto al label.
- Observaciones: `<details>` colapsado.
- `preloaded`: badge ámbar «Precargado del briefing».
- Desktop ≥1024px: `section-nav` sticky lateral 280px.

## Seguridad

- Guard server: técnico solo auditorías asignadas (`audit.assigned_technician_id` o tabla equivalente #2).
- Validación Zod en cada PATCH; SQL parametrizado.
- Import JSON solo mismo `audit_id` y usuario autorizado.
- Compresión en cliente — no enviar HEIC al presign (siempre JPEG post-pipeline).
- Rate limit opcional en PATCH (reutilizar patrón briefing, 120 req/min).

## Alternativa descartada: scoring manual en form

**Descartado:** entrada manual de score 0–100 en `audit_section_score` al terminar sección (spec 07e v1).

**Motivo:** PRD 07e actualizado — score autocalculado determinístico desde rúbrica; el técnico solo responde ítems. Evita divergencia entre score en vivo y cierre (#8).

## Alternativa descartada: offline-first completo

**Descartado:** CRDT/sync IndexedDB con resolución de conflictos y lectura offline prolongada.

**Motivo:** Complejidad v2; v1 usa cola de reintentos + export/import JSON manual como red de seguridad (aceptance #7).

## Alternativa descartada: upload vía proxy server

**Descartado:** multipart POST al servidor SvelteKit.

**Motivo:** Ya descartado en #6; fotos comprimidas van directo a R2 con presigned PUT.

## Alternativa descartada: orden obligatorio de secciones

**Descartado:** wizard secuencial sin saltos.

**Motivo:** PRD confirma orden libre — relevamiento en campo no sigue orden de plantilla.

## Notas para implementer

- Reutilizar `field-renderer.svelte` de #5; añadir tipos faltantes (`datetime`, `table`, `file_ref`, `money`).
- `percent` no es field_type en #2; usar `number` con `options.unit = '%'` si aparece en plantilla.
- Coordinar CORS R2 (#6 design) antes de e2e real de fotos.
- `computeSectionScore` debe exportarse para tests de determinismo que #8 extiende.
- Al completar relevamiento, no invalidar `public_token` (eso ocurre en cierre #8).

## Trazabilidad R → tests

| R | Test principal |
|---|---|
| R1 | `audit-form-load.test.ts` |
| R2, R19 | `form-field-renderer.test.ts` |
| R3, R25 | `e2e/form-tecnico.spec.ts` |
| R4 | `form-preload.test.ts` |
| R5 | `form-section-nav.test.ts` |
| R6 | `form-autosave.test.ts` |
| R7 | `audit-form-save.test.ts` |
| R8 | `form-retry-queue.test.ts`, e2e offline |
| R9 | `form-save-indicator.test.ts`, e2e |
| R10, R11 | `form-export-import.test.ts` |
| R12 | `form-photo-upload.test.ts` |
| R13 | `form-image-compress.test.ts` |
| R14 | `form-table-camera.test.ts` |
| R15–R17 | `form-live-score.test.ts` |
| R18 | `form-item-ux.test.ts` |
| R20 | `audit-form-complete.test.ts` |
| R21 | `pwa-manifest.test.ts` |
| R22 | `pwa-sw.test.ts` |
| R23 | e2e viewport desktop |
| R24 | suite `pnpm test` |
| R25 | `e2e/form-tecnico.spec.ts` |
