# Design — storage_r2

## Alcance

Módulo server de almacenamiento en Cloudflare R2: generación de presigned PUT/GET con `aws4fetch`, convención de keys, persistencia en `attachment` y vínculo con `audit_response` para ítems `file_ref`. Endpoints API protegidos por sesión (depende de `auth_roles` #3).

| Incluido | Excluido (otras features) |
|---|---|
| `aws4fetch` + módulo `storage/` | Compresión cliente 1600px/0.8 (`form_tecnico` #7) |
| Presigned PUT y GET | Conversión HEIC en navegador (#7) |
| Validación Zod content_type + tamaño | UI de captura/cámara (#7) |
| CRUD confirmación `attachment` | Preview thumbnails backoffice (descartado v1) |
| Upsert `audit_response` file_ref | Subida desde briefing cliente (v1) |
| Tests mock/sandbox | Job batch limpieza R2 (futuro; ver nota § Job diferido) |

## Dependencias

| Feature | Qué aporta |
|---|---|
| `stack_scaffolding` (#1) | Carpeta `src/lib/server/storage/`, `.env.example` vars R2 |
| `modelo_datos` (#2) | Tabla `attachment`, `audit_response`, constraints |
| `auth_roles` (#3) | `event.locals.user`, guards técnico/admin |

Si #2 no está `done`, el implementer verifica que la migración de `attachment` exista antes de T6.

## Archivos a crear o modificar

### Módulo storage

| Archivo | Propósito |
|---|---|
| `src/lib/server/storage/r2-config.ts` | Lectura y validación Zod de vars R2 + `R2_PRESIGN_TTL_SECONDS` |
| `src/lib/server/storage/r2-keys.ts` | `buildR2Key`, sanitización `section_code` |
| `src/lib/server/storage/r2-client.ts` | Wrapper `aws4fetch` (AwsClient) singleton |
| `src/lib/server/storage/presign.ts` | `presignPut`, `presignGet` |
| `src/lib/server/storage/attachments.ts` | Dominio: validar, confirmar, resolver GET |
| `src/lib/server/storage/index.ts` | Re-exports públicos del módulo |

### Esquemas Zod

| Archivo | Propósito |
|---|---|
| `src/lib/server/storage/schemas.ts` | `presignPutRequestSchema`, `confirmUploadSchema`, MIME allowlist, `MAX_UPLOAD_BYTES` |

### Persistencia DB

| Archivo | Propósito |
|---|---|
| `src/lib/server/db/attachments.ts` | Queries SQL: `insertAttachment`, `getAttachmentById`, `getAttachmentsByAudit` |
| `src/lib/server/db/audit-responses.ts` | `upsertFileRefResponse` — merge attachment id en JSON `file_ref` |

### API routes

| Archivo | Propósito |
|---|---|
| `src/routes/api/audits/[auditId]/attachments/presign-put/+server.ts` | POST — solicita presigned PUT |
| `src/routes/api/audits/[auditId]/attachments/confirm/+server.ts` | POST — confirma subida y crea `attachment` |
| `src/routes/api/attachments/[attachmentId]/presign-get/+server.ts` | GET — presigned GET para preview/descarga |

### Configuración

| Archivo | Propósito |
|---|---|
| `.env.example` | Añadir `R2_PRESIGN_TTL_SECONDS=900` |
| `package.json` | Dependencia `aws4fetch` |

### Tests

| Archivo | Propósito |
|---|---|
| `tests/storage-r2.test.ts` | Unit: keys, TTL, presign mock |
| `tests/api/attachments-presign.test.ts` | API: auth, validación, confirm + audit_response |
| `tests/fixtures/r2-mock.ts` | Mock de `AwsClient` / fetch para firmas |

## Firmas

### `src/lib/server/storage/r2-config.ts`

```typescript
import { z } from 'zod';

export const r2EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900)
});

export type R2Env = z.infer<typeof r2EnvSchema>;

export function getR2Env(): R2Env;
```

### `src/lib/server/storage/r2-keys.ts`

```typescript
export type R2KeyInput =
  | { auditId: string; sectionCode: string; uuid?: string }
  | { auditId: string; general: true; uuid?: string };

/** Genera key según convención; uuid default crypto.randomUUID(). */
export function buildR2Key(input: R2KeyInput): string;

/** Normaliza section_code: alfanumérico + guión, sin path traversal. */
export function sanitizeSectionCode(code: string): string;
```

Patrones resultantes:

```
audits/{auditId}/_general/{uuid}
audits/{auditId}/{sectionCode}/{uuid}
```

Opcional: sufijo `.{ext}` derivado de `content_type` (p. ej. `.jpg`) — no altera unicidad porque `uuid` es único.

### `src/lib/server/storage/presign.ts`

```typescript
export type PresignPutResult = {
  uploadUrl: string;
  r2Key: string;
  expiresAt: Date;
  headers: Record<string, string>; // Content-Type obligatorio en PUT
};

export type PresignGetResult = {
  downloadUrl: string;
  expiresAt: Date;
};

export async function presignPut(params: {
  r2Key: string;
  contentType: string;
  ttlSeconds?: number;
}): Promise<PresignPutResult>;

export async function presignGet(params: {
  r2Key: string;
  ttlSeconds?: number;
}): Promise<PresignGetResult>;
```

Implementación con `AwsClient` de `aws4fetch`:

```typescript
import { AwsClient } from 'aws4fetch';

const client = new AwsClient({
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto'
});

// PUT: client.sign(url, { method: 'PUT', headers: { 'Content-Type': ... }, aws: { signQuery: true } })
// GET: client.sign(url, { method: 'GET', aws: { signQuery: true } })
```

URL base: `{R2_ENDPOINT}/{R2_BUCKET}/{r2Key}` (path-style, compatible R2).

### `src/lib/server/storage/attachments.ts`

```typescript
export class StorageValidationError extends Error {
  readonly code = 'STORAGE_VALIDATION_ERROR';
}

export class AttachmentNotFoundError extends Error {
  readonly code = 'ATTACHMENT_NOT_FOUND';
}

export async function requestPresignedUpload(input: {
  auditId: string;
  itemId: string | null;
  sectionCode: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  kind: 'photo' | 'export';
  userId: string;
}): Promise<PresignPutResult>;

export async function confirmUpload(input: {
  auditId: string;
  itemId: string | null;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  kind: 'photo' | 'export';
  userId: string;
}): Promise<{ attachmentId: string }>;

export async function requestPresignedDownload(input: {
  attachmentId: string;
  userId: string;
}): Promise<PresignGetResult>;
```

Flujo `confirmUpload`:

1. Verificar que `r2Key` coincide con patrón esperado para `auditId` (+ sección si aplica).
2. `INSERT INTO attachment (...)`.
3. Si `itemId` presente → `upsertFileRefResponse(auditId, itemId, attachmentId)`.

### Valor JSON `file_ref` en `audit_response`

```typescript
// Schema Zod del valor
const fileRefValueSchema = z.object({
  attachment_ids: z.array(z.string().uuid()).min(1)
});
```

Upsert: append `attachmentId` si no está; `source='tecnico'`; respeta unique `(audit_id, item_id)`.

### API — presign PUT

**POST** `/api/audits/{auditId}/attachments/presign-put`

Body:

```typescript
{
  item_id: string | null;
  section_code: string | null;  // requerido si item_id
  filename: string;
  content_type: string;
  size_bytes: number;
  kind: 'photo' | 'export';
}
```

Response envelope:

```typescript
{ success: true, data: { upload_url, r2_key, expires_at, headers }, error: null }
```

Guards: usuario autenticado `tecnico` o `admin`; auditoría en estado editable (`en_relevamiento`, `en_cierre` o según política de #3).

### API — confirm

**POST** `/api/audits/{auditId}/attachments/confirm`

Body:

```typescript
{
  item_id: string | null;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  kind: 'photo' | 'export';
}
```

Response: `{ success: true, data: { attachment_id }, error: null }`.

### API — presign GET

**GET** `/api/attachments/{attachmentId}/presign-get`

Response: `{ success: true, data: { download_url, expires_at }, error: null }`.

## Constantes

```typescript
export const MAX_UPLOAD_BYTES = 26_214_400; // 25 MB

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain'
] as const;
```

## Errores

| Situación | Código HTTP | Comportamiento |
|---|---|---|
| Sin sesión / rol no autorizado | 401 / 403 | `apiError('No autorizado')` |
| Auditoría no encontrada | 404 | `AUDIT_NOT_FOUND` |
| content_type o size inválido | 400 | `STORAGE_VALIDATION_ERROR` |
| `r2_key` no coincide con auditoría | 400 | `STORAGE_VALIDATION_ERROR` |
| attachment no encontrado | 404 | `ATTACHMENT_NOT_FOUND` |
| Vars R2 ausentes | 500 server log | Mensaje genérico al cliente |
| `r2_key` duplicado (race) | 409 | `CONFLICT` |

Nunca devolver `R2_SECRET_ACCESS_KEY` ni stack trace al cliente.

## Variables `.env.example` (añadir)

```bash
# Cloudflare R2 — TTL presigned URLs (segundos, default 900)
R2_PRESIGN_TTL_SECONDS=900
```

Vars existentes de #1: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`.

## CORS en bucket R2 (operacional)

Configurar en dashboard Cloudflare antes de pruebas E2E reales:

- `AllowedOrigins`: dominio de la app (`PUBLIC_APP_URL`, prod y dev).
- `AllowedMethods`: `PUT`, `GET`, `HEAD`.
- `AllowedHeaders`: `Content-Type`, `Content-Length`, headers de firma AWS.

Documentar en comentario de `README` o `docs/` — no bloquea tests unitarios con mock.

## Alternativa descartada: `@aws-sdk/client-s3`

**Descartado:** AWS SDK v3 completo.

**Motivo:** PRD 07g y `feature_list.json` fijan `aws4fetch` — librería liviana (~15 KB), suficiente para presigned URLs sin listar/borrar objetos en runtime de request. Menor superficie en bundle server.

## Alternativa descartada: proxy de binarios por SvelteKit

**Descartado:** `POST /api/upload` que recibe el archivo en el servidor y lo reenvía a R2.

**Motivo:** Los binarios (fotos 5–10 MB HEIC) saturarían el servidor Dokploy y los datos móviles del técnico pasarían dos veces. Presigned PUT sube directo navegador → R2.

## Alternativa descartada: bucket público con CDN

**Descartado:** Objetos públicos o dominio custom público en R2.

**Motivo:** Adjuntos de auditoría son datos sensibles del cliente; acceso solo vía presigned GET autenticado (R5).

## Job de limpieza diferido

SPEC-07g PRD milestone 6d prevé job batch para objetos de auditorías archivadas. **Fuera de alcance de esta feature** — no está en acceptance de `feature_list.json` #6. Diseño reservado:

- Tabla cola `r2_deletion_queue(r2_key, audit_id, queued_at)` o flag en `attachment`.
- Cron/worker en feature futura o `deploy_dokploy` #10.

Al borrar auditoría (backoffice #4), solo encolar keys — implementación mínima opcional si #4 ya define el hook.

## Estrategia de tests

| Capa | Estrategia |
|---|---|
| Unit (`storage-r2.test.ts`) | Mock `aws4fetch.AwsClient.sign`; assert URL contiene bucket, key, firma |
| Keys | Pure functions, sin red |
| API (`attachments-presign.test.ts`) | Mock módulo `presign` + DB test/transacción; sesión fake vía helper auth |
| Sandbox (opcional local) | Variable `R2_SANDBOX=1` + credenciales dev; skip en CI si no hay vars |

CI debe pasar solo con mocks (R13).

## Notas para implementer

- `section_code` se obtiene de join `template_item → section` al validar `item_id`; el cliente puede enviarlo pero el server lo verifica.
- Para adjuntos de cierre (`item_id=null`), usar key `_general` y no tocar `audit_response`.
- Registrar `uploaded_by` con `event.locals.user.id`.
- El cliente hace PUT directo a `upload_url` con header `Content-Type` devuelto; luego llama `confirm`.
