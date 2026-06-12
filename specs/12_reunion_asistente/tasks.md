# Tasks — #12 12_reunion_asistente

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_12_reunion_asistente.md`.

> Prerrequisito: features #2, #3, #6, #7 en `done`.

## Schema y DB

- [ ] T1 — Crear migración `NNN_reunion_asistente.sql`: tablas `reunion_session`, `reunion_transcript`, `reunion_proposal`; extender CHECK `attachment.kind` (+`recording`) y `audit_response.source` (+`reunion_ia`). Cubre: **R7, R8, R16**.
- [ ] T2 — Implementar `src/lib/server/db/reunion-sessions.ts` (insert, get, list by audit, update status). Cubre: **R8, R10, R20**.
- [ ] T3 — Implementar `src/lib/server/db/reunion-transcripts.ts` y `reunion-proposals.ts`. Cubre: **R9, R11**.
- [ ] T4 — Actualizar tipos TS de `AuditResponse.source` y `Attachment.kind` en módulos existentes. Cubre: **R7, R16**.

## Dominio reunion

- [ ] T5 — Crear `src/lib/server/reunion/errors.ts` y `schemas.ts` (consent, presign, proposal, edit). Cubre: **R3, R5, R13**.
- [ ] T6 — Implementar `guards.ts` (`assertReunionAccess`, estados editables). Cubre: **R1, R2**.
- [ ] T7 — Implementar `session.ts` (crear sesión + consentimiento). Cubre: **R3, R8, R20**.
- [ ] T8 — Extender `src/lib/server/storage/r2-keys.ts` con `buildReunionR2Key`. Cubre: **R6**.
- [ ] T9 — Implementar `upload.ts` (presign/confirm audio, kind=recording). Cubre: **R5, R6, R7**.
- [ ] T10 — Extender `attachments.ts` para MIME audio y kind `recording`. Cubre: **R5, R7**.

## Pipeline IA

- [ ] T11 — Implementar `pipeline/context.ts` (`buildTemplateContextForExtraction`, filtro field_types MVP). Cubre: **R12**.
- [ ] T12 — Implementar `pipeline/stt.ts` (adapter Whisper mockable). Cubre: **R9**.
- [ ] T13 — Implementar `pipeline/extract.ts` (prompt, parse JSON, validación valor). Cubre: **R11, R13**.
- [ ] T14 — Implementar `pipeline/direct.ts` y `worker.ts` (`processReunionJob`, `enqueueReunionProcessing`). Cubre: **R9, R11, R15, R21**.
- [ ] T15 — Implementar `pipeline/webhook.ts` + `src/routes/api/internal/reunion/callback/+server.ts` (HMAC). Cubre: **R21**.
- [ ] T16 — Implementar `retention.ts` + hook cron o job documentado. Cubre: **R22**.

## Revisión y persistencia

- [ ] T17 — Implementar `review.ts` (accept, reject, edit+accept → upsert `audit_response`). Cubre: **R15, R16, R17, R18, R19**.
- [ ] T18 — Extraer o reutilizar parser valor compartido (`parseFormValue`) para propuestas. Cubre: **R13**.

## API routes

- [ ] T19 — `POST/GET /api/audits/[auditId]/reunion/sessions`. Cubre: **R1, R2, R8, R20**.
- [ ] T20 — `POST .../sessions/[sessionId]/presign-put` y `.../confirm`. Cubre: **R3, R5, R7, R8**.
- [ ] T21 — `GET .../sessions/[sessionId]` y `.../status`. Cubre: **R10, R20**.
- [ ] T22 — `POST .../proposals/[proposalId]/accept|reject|edit`. Cubre: **R16, R17, R18**.
- [ ] T23 — `POST .../sessions/[sessionId]/finalize`. Cubre: **R10**.

## UI cliente y rutas

- [ ] T24 — Crear `src/lib/client/reunion/recorder.ts` y `upload.ts`. Cubre: **R4, R5**.
- [ ] T25 — Componentes `consent-banner`, `audio-recorder`, `upload-audio`, `pipeline-status`, `proposal-review`. Cubre: **R4, R10, R14**.
- [ ] T26 — Ruta `(app)/auditorias/[id]/reunion/+page` (wizard completo). Cubre: **R4, R10, R14**.
- [ ] T27 — Añadir CTA y listado sesiones en `auditorias/[id]/+page.svelte`; badge en form. Cubre: **R14, R20**.

## Variables de entorno

- [ ] T28 — Documentar vars en `.env.example` (`REUNION_*`, `N8N_*`, `OPENAI_API_KEY`). Cubre: **R21, R22**.

## Tests unitarios

- [ ] T29 — `tests/reunion-r2-keys.test.ts`. Cubre: **R6**.
- [ ] T30 — `tests/reunion-recorder.test.ts`. Cubre: **R4**.
- [ ] T31 — `tests/reunion-proposal-schema.test.ts`. Cubre: **R13**.
- [ ] T32 — `tests/reunion-pipeline.test.ts` (direct, webhook, no auto-apply). Cubre: **R9, R11, R15, R21**.
- [ ] T33 — `tests/reunion-extraction.test.ts` (exclusión table/file_ref). Cubre: **R12**.
- [ ] T34 — `tests/reunion-retention.test.ts`. Cubre: **R22**.
- [ ] T35 — `tests/reunion-review-ui.test.ts`. Cubre: **R14**.

## Tests API e integración

- [ ] T36 — `tests/fixtures/reunion-audio.webm` y `reunion-pipeline-mock.ts`. Cubre: **R23**.
- [ ] T37 — `tests/api/reunion-session.test.ts` (permisos, estados, consentimiento). Cubre: **R1, R2, R3, R20**.
- [ ] T38 — `tests/api/reunion-upload.test.ts`. Cubre: **R5, R6, R7, R8**.
- [ ] T39 — `tests/api/reunion-status.test.ts`. Cubre: **R10**.
- [ ] T40 — `tests/api/reunion-review.test.ts` (accept/reject/edit, source reunion_ia). Cubre: **R16, R17, R18, R19**.

## E2E y cierre

- [ ] T41 — `e2e/reunion.spec.ts` con pipeline mockeado. Cubre: **R4, R10, R14, R24**.
- [ ] T42 — Ejecutar `pnpm test` y `pnpm exec playwright test e2e/reunion.spec.ts` en verde. Cubre: **R23, R24**.
- [ ] T43 — Ejecutar `./init.sh` exit code 0. Cubre: todos.
- [ ] T44 — Completar trazabilidad R→test en `progress/impl_12_reunion_asistente.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → reunion-session.test.ts (403 no asignado)
- R2 → reunion-session.test.ts (cerrada/borrador)
- R3 → reunion-upload.test.ts (consent required)
- R4 → reunion-recorder.test.ts, e2e/reunion.spec.ts
- R5 → reunion-upload.test.ts (MIME/size)
- R6 → reunion-r2-keys.test.ts
- R7 → reunion-upload.test.ts (kind recording)
- R8 → reunion-upload.test.ts (session row)
- R9 → reunion-pipeline.test.ts
- R10 → reunion-status.test.ts, e2e
- R11 → reunion-pipeline.test.ts
- R12 → reunion-extraction.test.ts
- R13 → reunion-proposal-schema.test.ts
- R14 → reunion-review-ui.test.ts, e2e
- R15 → reunion-pipeline.test.ts (no audit_response)
- R16 → reunion-review.test.ts (accept)
- R17 → reunion-review.test.ts (reject)
- R18 → reunion-review.test.ts (edit)
- R19 → reunion-review.test.ts (form override)
- R20 → reunion-session.test.ts (consent visible)
- R21 → reunion-pipeline.test.ts (direct/webhook)
- R22 → reunion-retention.test.ts
- R23 → pnpm test suite reunion
- R24 → e2e/reunion.spec.ts
```
