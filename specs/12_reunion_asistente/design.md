# Design — #12 12_reunion_asistente

## Alcance

Flujo end-to-end para que un técnico registre consentimiento, grabe o suba audio de reunión con el cliente, almacene en R2, procese STT + extracción IA en background y revise propuestas antes de persistir en `audit_response` con `source='reunion_ia'`.

| Incluido (MVP) | Excluido (fase 2) |
|---|---|
| Sesión reunión + consentimiento | `table`, `file_ref`, `multiselect`, `list`, `money`, `datetime` |
| Grabación MediaRecorder + upload webm/m4a/mp3 | Diarización, streaming STT |
| R2 key `_reunion`, `attachment.kind=recording` | Thumbnails waveform |
| Pipeline `direct` (STT+LLM) y `webhook` n8n | Auto-apply por confidence |
| Tablas `reunion_*` + propuestas revisables | Informe reunión standalone |
| UI en auditoría + enlace desde form | Subida desde briefing cliente |
| Retención audio configurable | Borrado transcript al archivar |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `02_modelo_datos` (#2) | `audit`, `audit_response`, `template_item`, `attachment`; extender CHECK `source` y `kind` |
| `03_auth_roles` (#3) | Guard técnico asignado / admin |
| `06_storage_r2` (#6) | Presigned PUT/GET, `buildR2Key`, confirm attachment |
| `07_form_tecnico` (#7) | Parsers valor por `field_type`, ruta form, indicador preloaded |
| `09_contrato_datos` (#9) | Contexto plantilla similar al JSON canónico (labels, options) |

**Prerrequisito duro:** #2, #3, #6, #7 en `done`.

## Arquitectura

```
(auditoría editable)
       │
       ▼
POST consent + presign PUT (audio)
       │
       ▼
PUT directo R2 ──► POST confirm ──► attachment(kind=recording)
       │                                    │
       │                                    ▼
       │                          reunion_session(status=processing)
       │                                    │
       ├─ REUNION_PIPELINE_MODE=direct ────┤
       │     processReunionJob()            │
       │     STT → reunion_transcript       │
       │     LLM → reunion_proposal[]       │
       │                                    │
       └─ REUNION_PIPELINE_MODE=webhook ────┘
             POST n8n ──► callback API
                                    │
                                    ▼
                    reunion_session(status=ready_for_review)
                                    │
                                    ▼
              UI revisión: accept / reject / edit
                                    │
                                    ▼
              upsert audit_response(source=reunion_ia)
```

Capas (`docs/architecture.md`):

- `src/lib/server/reunion/` — dominio sesión, pipeline, revisión.
- `src/lib/server/db/reunion-*.ts` — SQL parametrizado.
- `src/lib/client/reunion/` — MediaRecorder, upload, polling estado.
- `src/routes/(app)/auditorias/[id]/reunion/` — UI staff.
- `src/routes/api/audits/[auditId]/reunion/` — API JSON.

## Cambios de schema (migración `NNN_reunion_asistente.sql`)

### Extender constraints existentes

```sql
-- attachment.kind: agregar 'recording'
ALTER TABLE attachment DROP CONSTRAINT ...;
ALTER TABLE attachment ADD CONSTRAINT attachment_kind_check
  CHECK (kind IN ('photo', 'export', 'recording'));

-- audit_response.source: agregar 'reunion_ia'
ALTER TABLE audit_response DROP CONSTRAINT ...;
ALTER TABLE audit_response ADD CONSTRAINT audit_response_source_check
  CHECK (source IN ('admin', 'cliente', 'tecnico', 'reunion_ia'));
```

### `reunion_session`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid FK → audit | |
| attachment_id | uuid FK → attachment UNIQUE | audio principal |
| started_by | uuid FK → app_user | técnico que inició |
| session_type | text | `kickoff` · `visita` · `otro` (default `visita`) |
| consent_recorded_at | timestamptz NOT NULL | antes de audio |
| consent_note | text | opcional («Cliente X autorizó grabación») |
| status | text | ver máquina abajo |
| error_message | text | último fallo pipeline |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| archived_at | timestamptz | retención R22 |

**Máquina `reunion_session.status`:**

```
draft → uploading → processing → ready_for_review → reviewed
                         │                │
                         └──── error ◄────┘
```

- `draft`: consentimiento registrado, sin audio confirmado.
- `uploading`: presign emitido, esperando confirm.
- `processing`: audio OK, pipeline STT/LLM en curso.
- `ready_for_review`: transcript + propuestas listas.
- `reviewed`: al menos una propuesta revisada (aceptada/rechazada/editada) o acción «Finalizar revisión».
- `error`: fallo STT/LLM recuperable.

Índices: `(audit_id)`, `(status)` donde `archived_at IS NULL`.

### `reunion_transcript`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| reunion_session_id | uuid FK UNIQUE | 1:1 con sesión |
| status | text | `pending` · `processing` · `ready` · `error` |
| full_text | text | texto completo STT |
| segments | jsonb | opcional `[{start_ms, end_ms, text}]` |
| stt_provider | text | ej. `openai-whisper`, `n8n` |
| language | text | default `es` |
| error_message | text | |
| created_at / updated_at | timestamptz | |

### `reunion_proposal`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| reunion_session_id | uuid FK | |
| item_id | uuid FK → template_item | |
| proposed_value | jsonb | valor tipado propuesto |
| quote | text NOT NULL | cita del transcript |
| confidence | numeric(4,3) | 0.000–1.000 |
| review_status | text | `pending` · `accepted` · `rejected` · `edited` |
| final_value | jsonb | valor editado por humano |
| reviewed_by | uuid FK → app_user | |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |
| UNIQUE (reunion_session_id, item_id) | | una propuesta por ítem por sesión |

## Archivos a crear/modificar

### Migración y tipos

| Archivo | Propósito |
|---|---|
| `migrations/NNN_reunion_asistente.sql` | Tablas + ALTER constraints |
| `src/lib/server/db/reunion-sessions.ts` | CRUD sesión, transiciones estado |
| `src/lib/server/db/reunion-transcripts.ts` | Upsert transcript |
| `src/lib/server/db/reunion-proposals.ts` | Insert/list/update propuestas |
| `src/lib/server/reunion/errors.ts` | Errores tipados dominio |
| `src/lib/server/reunion/schemas.ts` | Zod: consent, upload, proposal, review |
| `src/lib/server/reunion/guards.ts` | `assertReunionEditable(audit, user)` |
| `src/lib/server/reunion/session.ts` | Crear sesión, registrar consentimiento |
| `src/lib/server/reunion/upload.ts` | Presign/confirm audio reunión |
| `src/lib/server/reunion/pipeline/` | Orquestación async |
| `src/lib/server/reunion/pipeline/direct.ts` | STT + LLM in-process |
| `src/lib/server/reunion/pipeline/webhook.ts` | Disparo n8n + validación callback |
| `src/lib/server/reunion/pipeline/context.ts` | `buildTemplateContextForExtraction(auditId)` |
| `src/lib/server/reunion/pipeline/stt.ts` | Adapter Whisper/OpenAI (env) |
| `src/lib/server/reunion/pipeline/extract.ts` | Prompt + parse JSON propuestas |
| `src/lib/server/reunion/review.ts` | accept/reject/edit → audit_response |
| `src/lib/server/reunion/retention.ts` | Job archivado + cola R2 |
| `src/lib/server/storage/r2-keys.ts` | `buildReunionR2Key(auditId, ext)` |
| `src/lib/server/storage/attachments.ts` | Extender `kind: 'recording'`, MIME audio |

### API routes

| Ruta | Método | Propósito |
|---|---|---|
| `/api/audits/[auditId]/reunion/sessions` | POST | Crear sesión + consentimiento |
| `/api/audits/[auditId]/reunion/sessions` | GET | Listar sesiones de auditoría |
| `/api/audits/[auditId]/reunion/sessions/[sessionId]` | GET | Detalle sesión + transcript + propuestas |
| `/api/audits/[auditId]/reunion/sessions/[sessionId]/presign-put` | POST | Presigned PUT audio |
| `/api/audits/[auditId]/reunion/sessions/[sessionId]/confirm` | POST | Confirm attachment + encolar pipeline |
| `/api/audits/[auditId]/reunion/sessions/[sessionId]/status` | GET | Estado agregado (polling) |
| `/api/audits/[auditId]/reunion/proposals/[proposalId]/accept` | POST | Aceptar propuesta |
| `/api/audits/[auditId]/reunion/proposals/[proposalId]/reject` | POST | Rechazar propuesta |
| `/api/audits/[auditId]/reunion/proposals/[proposalId]/edit` | POST | Editar valor + aceptar |
| `/api/audits/[auditId]/reunion/sessions/[sessionId]/finalize` | POST | Marcar revisión completa → `reviewed` |
| `/api/internal/reunion/callback` | POST | Callback n8n (HMAC `REUNION_CALLBACK_SECRET`) |

### UI

| Archivo | Propósito |
|---|---|
| `src/routes/(app)/auditorias/[id]/reunion/+page.server.ts` | Load sesiones, permisos |
| `src/routes/(app)/auditorias/[id]/reunion/+page.svelte` | Wizard: consent → grabar/subir → espera → revisión |
| `src/routes/(app)/auditorias/[id]/reunion/[sessionId]/+page.svelte` | Detalle/revisión sesión existente |
| `src/lib/components/reunion/consent-banner.svelte` | Aviso privacidad + checkbox |
| `src/lib/components/reunion/audio-recorder.svelte` | MediaRecorder wrapper |
| `src/lib/components/reunion/upload-audio.svelte` | Input file + presign flow |
| `src/lib/components/reunion/pipeline-status.svelte` | Indicador estados R10 |
| `src/lib/components/reunion/proposal-review.svelte` | Lista propuestas + acciones |
| `src/lib/client/reunion/upload.ts` | Client presign → PUT → confirm |
| `src/lib/client/reunion/recorder.ts` | MediaRecorder + mime fallback |
| `src/routes/(app)/auditorias/[id]/+page.svelte` | CTA «Asistente de reunión» + listado sesiones |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | Badge «Sugerencias pendientes» si hay propuestas |

### Job async

| Archivo | Propósito |
|---|---|
| `src/lib/server/reunion/worker.ts` | `processPendingReunionJobs()` — invocado al confirm y por cron ligero |
| `src/hooks.server.ts` o `src/routes/api/cron/reunion/+server.ts` | Tick opcional reproceso `error`/`pending` |

**Estrategia MVP:** al `confirm`, `event.waitUntil(processReunionJob(sessionId))` en SvelteKit adapter; fallback polling DB cada 30s en worker interno para sesiones `processing` > 5 min.

### Tests

| Archivo | Cubre |
|---|---|
| `tests/reunion-r2-keys.test.ts` | R6 |
| `tests/reunion-recorder.test.ts` | R4 |
| `tests/reunion-proposal-schema.test.ts` | R13 |
| `tests/reunion-pipeline.test.ts` | R9, R11, R15, R21 |
| `tests/reunion-extraction.test.ts` | R12 |
| `tests/reunion-retention.test.ts` | R22 |
| `tests/reunion-review-ui.test.ts` | R14 |
| `tests/api/reunion-session.test.ts` | R1, R2, R8, R20 |
| `tests/api/reunion-upload.test.ts` | R3, R5, R6, R7 |
| `tests/api/reunion-status.test.ts` | R10 |
| `tests/api/reunion-review.test.ts` | R16, R17, R18, R19 |
| `tests/fixtures/reunion-audio.webm` | Blob mínimo para tests |
| `tests/fixtures/reunion-pipeline-mock.ts` | STT/LLM stubs |
| `e2e/reunion.spec.ts` | R4, R10, R14, R24 |

## Firmas principales

### Guards

```typescript
const REUNION_EDITABLE_STATUSES: AuditStatus[] = [
  'briefing_enviado', 'briefing_completo', 'en_relevamiento', 'en_cierre'
];

export async function assertReunionAccess(
  auditId: string,
  user: AppUser
): Promise<AuditRow>;

export function assertReunionEditableStatus(status: AuditStatus): void;
```

### Sesión y upload

```typescript
export async function createReunionSession(input: {
  auditId: string;
  userId: string;
  sessionType: 'kickoff' | 'visita' | 'otro';
  consentRecordedAt: Date;
  consentNote?: string;
}): Promise<{ sessionId: string }>;

export async function requestReunionAudioUpload(input: {
  auditId: string;
  sessionId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  userId: string;
}): Promise<PresignPutResult & { r2Key: string }>;

export async function confirmReunionAudio(input: {
  auditId: string;
  sessionId: string;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  userId: string;
}): Promise<{ attachmentId: string }>;
```

### Pipeline

```typescript
export async function enqueueReunionProcessing(sessionId: string): Promise<void>;

export async function processReunionJob(sessionId: string): Promise<void>;
// 1. transcript = await runStt(attachment)
// 2. context = await buildTemplateContextForExtraction(auditId)
// 3. proposals = await extractProposals(transcript, context)
// 4. persist + session.status = ready_for_review

export function buildTemplateContextForExtraction(auditId: string): Promise<{
  items: Array<{
    item_id: string;
    label: string;
    field_type: string;
    options: unknown;
    filled_by: string;
    current_value: unknown | null;
  }>;
}>;
```

### Revisión

```typescript
export async function acceptProposal(
  proposalId: string,
  userId: string
): Promise<void>;

export async function rejectProposal(
  proposalId: string,
  userId: string
): Promise<void>;

export async function editAndAcceptProposal(
  proposalId: string,
  finalValue: unknown,
  userId: string
): Promise<void>;
// Valida con parseFormValue/parseBriefingValue según field_type
// upsert audit_response source='reunion_ia'
```

### R2

```typescript
export function buildReunionR2Key(
  auditId: string,
  ext: 'webm' | 'm4a' | 'mp3',
  uuid?: string
): string;
// → audits/{auditId}/_reunion/{uuid}.{ext}
```

## Schemas Zod (fronteras)

```typescript
export const reunionConsentSchema = z.object({
  session_type: z.enum(['kickoff', 'visita', 'otro']).default('visita'),
  consent_recorded_at: z.coerce.date(),
  consent_note: z.string().max(500).optional()
});

export const reunionAudioPresignSchema = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.enum([
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a'
  ]),
  size_bytes: z.number().int().positive().max(REUNION_MAX_AUDIO_BYTES)
});

export const reunionProposalSchema = z.object({
  item_id: z.string().uuid(),
  proposed_value: z.unknown(),
  quote: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1)
});

export const reunionEditProposalSchema = z.object({
  final_value: z.unknown()
});
```

Validación de `proposed_value` / `final_value`: reutilizar `parseFormValue` de `src/lib/server/form/` (o extraer a `src/lib/server/fields/parse-value.ts` compartido).

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `REUNION_PIPELINE_MODE` | `direct` | `direct` \| `webhook` |
| `REUNION_MAX_AUDIO_BYTES` | `104857600` (100 MB) | Límite upload |
| `REUNION_AUDIO_RETENTION_DAYS` | `365` | Retención grabación |
| `REUNION_STT_PROVIDER` | `openai` | Adapter STT |
| `OPENAI_API_KEY` | — | STT Whisper + LLM (modo direct) |
| `REUNION_LLM_MODEL` | `gpt-4o-mini` | Extracción propuestas |
| `N8N_REUNION_WEBHOOK_URL` | — | Modo webhook |
| `REUNION_CALLBACK_SECRET` | — | HMAC callback n8n |
| `REUNION_CALLBACK_BASE_URL` | `PUBLIC_ORIGIN` | URL callback absoluta |

Documentar en `.env.example`. Nunca exponer al cliente.

## Contrato LLM (extracción)

Prompt system incluye:

- Lista ítems elegibles (R12) con `label`, `field_type`, `options`, valor actual si existe.
- Transcript completo.
- Instrucción: responder **solo JSON** array de `{ item_id, proposed_value, quote, confidence }`.
- No inventar ítems fuera de lista; omitir si no hay evidencia en transcript (`quote` obligatorio si propone).

Parser: `JSON.parse` + `reunionProposalSchema.array()` + validación valor por field_type; descartar propuestas inválidas con log server (no fallar sesión entera).

## Contrato webhook n8n (opcional)

**Outbound (auditapp → n8n):**

```json
{
  "reunion_session_id": "uuid",
  "audit_id": "uuid",
  "r2_key": "audits/.../ _reunion/....webm",
  "callback_url": "https://app.../api/internal/reunion/callback",
  "template_context": { "items": [...] }
}
```

**Inbound callback (n8n → auditapp):**

```json
{
  "reunion_session_id": "uuid",
  "transcript": { "full_text": "...", "segments": [] },
  "proposals": [{ "item_id": "...", "proposed_value": "...", "quote": "...", "confidence": 0.85 }]
}
```

Header `X-Reunion-Signature: HMAC-SHA256(body, REUNION_CALLBACK_SECRET)`.

## Errores de dominio

| Clase | code | HTTP |
|---|---|---|
| `ReunionNotAllowedError` | `REUNION_NOT_ALLOWED` | 403 |
| `ReunionAuditNotEditableError` | `REUNION_AUDIT_NOT_EDITABLE` | 400 |
| `ReunionConsentRequiredError` | `REUNION_CONSENT_REQUIRED` | 400 |
| `ReunionSessionNotFoundError` | `REUNION_SESSION_NOT_FOUND` | 404 |
| `ReunionPipelineError` | `REUNION_PIPELINE_ERROR` | 500 (log interno) |
| `ReunionProposalNotFoundError` | `REUNION_PROPOSAL_NOT_FOUND` | 404 |
| `ReunionProposalValidationError` | `REUNION_PROPOSAL_INVALID` | 400 |

Envelope API estándar `{ success, data, error }`.

## UI/UX (mobile-first)

1. **Entrada:** botón en detalle auditoría y banner en form si hay propuestas `pending`.
2. **Paso consentimiento:** copy fijo SyS («La conversación puede grabarse con autorización del cliente…») + checkbox obligatorio.
3. **Paso audio:** tabs «Grabar» / «Subir archivo»; duración máx sugerida 120 min (warning, no block).
4. **Procesando:** spinner + texto «Transcribiendo y analizando…»; polling cada 3s a `/status`.
5. **Revisión:** cards por propuesta con diff vs valor actual; confidence como badge (alto/medio/bajo); acciones táctiles ≥ 44px.
6. **Post-revisión:** toast «X ítems actualizados» + link al form en sección del primer ítem aceptado.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Guardar audio en Postgres `bytea` | Binarios van a R2 (#6); Postgres solo metadata |
| Auto-aplicar propuestas confidence ≥ 0.9 | Requisito humano: técnico siempre revisa (R15) |
| WebSocket para estado pipeline | MVP: polling simple suficiente; menos infra |
| Una sola tabla JSON para transcript+propuestas | Separar tablas permite reintentar extracción sin re-STT |
| STT en cliente (Web Speech API) | Calidad inferior offline; unificar server/n8n |
| Extender `audit_response.source` con JSON embebido de propuestas | Propuestas son staging; solo persistir tras revisión |
| Procesar ítems `table` en MVP | Complejidad grilla + validación columnas → fase 2 |
| R2 key bajo `_general` | Convención explícita `_reunion` facilita retención y auditoría |

## Integración con form técnico (#7)

- Propuestas aceptadas aparecen en form como respuestas normales con badge «Reunión IA» (lectura `source`).
- Guardado manual posterior del técnico sobrescribe con `source='tecnico'` (comportamiento existente upsert).
- No bloquear autosave del form durante procesamiento reunión (flujos independientes).

## Fase 2 (documentada, no implementar)

- Soporte `table` (extracción filas parciales), `file_ref` (solo metadatos, no foto).
- `multiselect`, `list`, `money`, `datetime`.
- Reprocesar extracción sin re-subir audio.
- Player audio inline con presigned GET.
- Dashboard admin: métricas de sesiones, tasa aceptación propuestas.
