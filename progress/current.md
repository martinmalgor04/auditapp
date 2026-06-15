# Sesión actual

## Feature en curso: #12 12_reunion_asistente

**Estado:** implementando T1–T44.

### Plan de tasks
- T1: migración SQL 012_reunion_asistente.sql
- T2: db/reunion-sessions.ts
- T3: db/reunion-transcripts.ts + reunion-proposals.ts
- T4: actualizar tipos TS (attachment.kind, audit_response.source)
- T5: reunion/errors.ts + schemas.ts
- T6: reunion/guards.ts
- T7: reunion/session.ts
- T8: storage/r2-keys.ts (buildReunionR2Key)
- T9: reunion/upload.ts
- T10: storage/attachments.ts extender kind recording
- T11: reunion/pipeline/context.ts
- T12: reunion/pipeline/stt.ts
- T13: reunion/pipeline/extract.ts
- T14: reunion/pipeline/direct.ts + worker.ts
- T15: reunion/pipeline/webhook.ts + callback route
- T16: reunion/retention.ts
- T17: reunion/review.ts
- T18: extraer parseFormValue compartido
- T19-T23: API routes
- T24-T27: UI
- T28: .env.example
- T29-T44: tests + e2e + gate
