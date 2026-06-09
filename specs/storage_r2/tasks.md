# Tasks — storage_r2

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_storage_r2.md`.

## Prerrequisitos

- [ ] T1 — Verificar que `stack_scaffolding` (#1) dejó carpeta `src/lib/server/storage/` y vars R2 en `.env.example`. Cubre: **R11**.
- [ ] T2 — Verificar que `modelo_datos` (#2) creó tablas `attachment` y `audit_response` con constraints de 07a. Cubre: **R8, R9**.

## Dependencias y config

- [ ] T3 — Instalar `aws4fetch` y añadir `R2_PRESIGN_TTL_SECONDS` a `.env.example`. Cubre: **R1, R4, R11**.
- [ ] T4 — Crear `src/lib/server/storage/r2-config.ts` con schema Zod de vars R2. Cubre: **R4, R11**.

## Módulo storage (core)

- [ ] T5 — Crear `r2-keys.ts` con `buildR2Key` y `sanitizeSectionCode` según convención `_general` y `{section}`. Cubre: **R6, R7**.
- [ ] T6 — Crear `r2-client.ts` con singleton `AwsClient` de `aws4fetch`. Cubre: **R1**.
- [ ] T7 — Crear `schemas.ts` con allowlist MIME, `MAX_UPLOAD_BYTES` y schemas de request. Cubre: **R10**.
- [ ] T8 — Crear `presign.ts` con `presignPut` y `presignGet` usando TTL de config. Cubre: **R2, R3, R4, R5**.
- [ ] T9 — Crear `attachments.ts` con `requestPresignedUpload`, `confirmUpload`, `requestPresignedDownload`. Cubre: **R2, R3, R8, R9, R10**.
- [ ] T10 — Crear `index.ts` re-exportando API pública del módulo. Cubre: **R1**.

## Capa DB

- [ ] T11 — Crear `src/lib/server/db/attachments.ts` con `insertAttachment`, `getAttachmentById`. Cubre: **R8**.
- [ ] T12 — Crear o extender `audit-responses.ts` con `upsertFileRefResponse` (append `attachment_ids`). Cubre: **R9**.

## API routes

- [ ] T13 — Implementar `POST .../presign-put/+server.ts` con guards técnico/admin y envelope JSON. Cubre: **R2, R10, R12**.
- [ ] T14 — Implementar `POST .../confirm/+server.ts` creando `attachment` y vinculando `audit_response`. Cubre: **R8, R9, R12**.
- [ ] T15 — Implementar `GET .../presign-get/+server.ts` para descarga firmada. Cubre: **R3, R5, R12**.

## Tests

- [ ] T16 — Crear `tests/fixtures/r2-mock.ts` con mock de `AwsClient.sign`. Cubre: **R13**.
- [ ] T17 — Crear `tests/storage-r2.test.ts` (keys, TTL, presign PUT/GET mock, bucket privado). Cubre: **R2, R3, R4, R5, R6, R7**.
- [ ] T18 — Crear `tests/api/attachments-presign.test.ts` (auth, validación MIME/tamaño, confirm + audit_response). Cubre: **R8, R9, R10, R12, R13**.

## Verificación final

- [ ] T19 — Ejecutar `pnpm test` y confirmar tests storage/API verdes sin credenciales R2 reales. Cubre: **R13**.
- [ ] T20 — Ejecutar `pnpm run check` sin errores de tipo. Cubre: **R1**.
- [ ] T21 — Ejecutar `./init.sh` y confirmar exit code 0. Cubre: todos.
- [ ] T22 — Documentar trazabilidad R→test en `progress/impl_storage_r2.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → tests/storage-r2.test.ts > exports módulo storage
- R2 → tests/storage-r2.test.ts > presignPut devuelve URL PUT firmada
- R3 → tests/storage-r2.test.ts > presignGet devuelve URL GET firmada
- R4 → tests/storage-r2.test.ts > respeta R2_PRESIGN_TTL_SECONDS
- R5 → tests/storage-r2.test.ts > URLs contienen firma, sin rutas públicas
- R6 → tests/storage-r2.test.ts > buildR2Key _general
- R7 → tests/storage-r2.test.ts > buildR2Key con section_code
- R8 → tests/api/attachments-presign.test.ts > inserta attachment único
- R9 → tests/api/attachments-presign.test.ts > audit_response file_ref actualizado
- R10 → tests/api/attachments-presign.test.ts > rechaza MIME y tamaño inválidos
- R11 → tests/storage-r2.test.ts > error sin vars R2; .env.example documentado
- R12 → tests/api/attachments-presign.test.ts > 401/403 sin rol autorizado
- R13 → pnpm test verde con mocks en CI
```
