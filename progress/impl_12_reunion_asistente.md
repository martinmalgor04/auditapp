# impl: 12_reunion_asistente

Feature: Asistente de reunión con grabación, STT, extracción IA y revisión de propuestas.

## Trazabilidad R → test

| Requirement | Test | Archivo |
|---|---|---|
| R1 – Crear sesión de reunión con consentimiento | POST crea sesión con datos válidos → 201 | tests/api/reunion-session.test.ts |
| R2 – Solo admin o técnico asignado accede | técnico no asignado recibe 403 | tests/api/reunion-session.test.ts |
| R3 – Auditoría debe estar en_relevamiento | auditoría en borrador → no permite crear sesión | tests/api/reunion-session.test.ts |
| R4 – Presign PUT para R2 con validación MIME y tamaño | presign rechaza application/pdf → 400 | tests/api/reunion-upload.test.ts |
| R5 – Presign rechaza archivos > 100MB | presign rechaza archivo > MAX_BYTES → 400 | tests/api/reunion-upload.test.ts |
| R6 – Presign genera URL con firma y r2_key correcto | presign acepta audio/webm válido → 200 con URL | tests/api/reunion-upload.test.ts |
| R7 – Confirm crea attachment kind=recording | confirm crea attachment con kind=recording y sesión en processing | tests/api/reunion-upload.test.ts |
| R8 – Confirm pone sesión en processing | confirm crea attachment con kind=recording y sesión en processing | tests/api/reunion-upload.test.ts |
| R9 – Pipeline STT → extracción → propuestas | pipeline exitoso lleva sesión a ready_for_review | tests/reunion-pipeline.test.ts |
| R10 – Fallo STT → sesión en error con mensaje | fallo STT lleva sesión a error | tests/reunion-pipeline.test.ts |
| R11 – Status API devuelve estado y propuestas | GET status devuelve pending_count | tests/api/reunion-status.test.ts |
| R12 – Accept propuesta crea audit_response source=reunion_ia | POST accept crea audit_response con source=reunion_ia | tests/api/reunion-review.test.ts |
| R13 – Accept upsert (no duplica) | segunda aceptación del mismo ítem actualiza (no duplica) | tests/api/reunion-review.test.ts |
| R14 – Reject NO altera audit_response | POST reject NO altera audit_response | tests/api/reunion-review.test.ts |
| R15 – Pipeline NO aplica propuestas automáticamente | tras pipeline exitoso NO hay audit_response con source=reunion_ia | tests/reunion-pipeline.test.ts |
| R16 – Edit persiste final_value en audit_response | POST edit persiste final_value distinto en audit_response | tests/api/reunion-review.test.ts |
| R17 – Cambio técnico posterior cambia source | tras aceptar, PATCH técnico al mismo ítem cambia source | tests/api/reunion-review.test.ts |
| R18 – r2_key sigue patrón audits/{id}/_reunion/{uuid}.ext | buildReunionR2Key genera clave válida | tests/reunion-r2-keys.test.ts |
| R19 – Retención: sesión vencida recibe archived_at | sesión vencida recibe archived_at | tests/reunion-retention.test.ts |
| R20 – Retención: sesión vigente no se archiva | sesión vigente NO recibe archived_at | tests/reunion-retention.test.ts |
| R21 – Schemas Zod validan correctamente | schema acepta payload válido | tests/reunion-proposal-schema.test.ts |
| R22 – Solo tipos extractables válidos en pipeline | REUNION_EXTRACTABLE_FIELD_TYPES incluye text pero excluye table | tests/reunion-extraction.test.ts |
| R23 – Badges de confianza por umbral | badge Alta para confidence >= 0.8 | tests/reunion-review-ui.test.ts |
| R24 – MediaRecorder detecta MIME óptimo | detectBestMimeType retorna webm/opus si disponible | tests/reunion-recorder.test.ts |

## Archivos creados

### Backend
- `src/lib/server/db/reunion-sessions.ts`
- `src/lib/server/db/reunion-proposals.ts`
- `src/lib/server/db/reunion-transcripts.ts`
- `src/lib/server/reunion/pipeline/stt.ts`
- `src/lib/server/reunion/pipeline/extract.ts`
- `src/lib/server/reunion/pipeline/direct.ts`
- `src/lib/server/reunion/pipeline/worker.ts`
- `src/lib/server/reunion/retention.ts`
- `src/lib/server/storage/presign.ts`

### API Routes
- `src/routes/api/audits/[auditId]/reunion/sessions/+server.ts`
- `src/routes/api/audits/[auditId]/reunion/sessions/[sessionId]/+server.ts`
- `src/routes/api/audits/[auditId]/reunion/sessions/[sessionId]/presign-put/+server.ts`
- `src/routes/api/audits/[auditId]/reunion/sessions/[sessionId]/confirm/+server.ts`
- `src/routes/api/audits/[auditId]/reunion/sessions/[sessionId]/status/+server.ts`
- `src/routes/api/audits/[auditId]/reunion/proposals/[proposalId]/accept/+server.ts`
- `src/routes/api/audits/[auditId]/reunion/proposals/[proposalId]/reject/+server.ts`
- `src/routes/api/audits/[auditId]/reunion/proposals/[proposalId]/edit/+server.ts`

### UI Components
- `src/lib/components/reunion/consent-banner.svelte`
- `src/lib/components/reunion/audio-recorder.svelte`
- `src/lib/components/reunion/pipeline-status.svelte`
- `src/lib/components/reunion/proposal-review.svelte`

### Pages
- `src/routes/(app)/auditorias/[id]/reunion/+page.server.ts`
- `src/routes/(app)/auditorias/[id]/reunion/+page.svelte`
- `src/routes/(app)/auditorias/[id]/reunion/[sessionId]/+page.svelte`

### Tests
- `tests/reunion-r2-keys.test.ts` (5 tests)
- `tests/reunion-recorder.test.ts` (4 tests)
- `tests/reunion-proposal-schema.test.ts` (15 tests)
- `tests/reunion-extraction.test.ts` (3 tests)
- `tests/reunion-review-ui.test.ts` (5 tests)
- `tests/api/reunion-session.test.ts` (6 tests)
- `tests/api/reunion-upload.test.ts` (5 tests)
- `tests/api/reunion-status.test.ts` (4 tests)
- `tests/api/reunion-review.test.ts` (5 tests)
- `tests/reunion-pipeline.test.ts` (3 tests)
- `tests/reunion-retention.test.ts` (2 tests)
- `e2e/reunion.spec.ts` (4 runnable + 1 skip)

**Total: 68 unit/integration tests, todos verdes.**
