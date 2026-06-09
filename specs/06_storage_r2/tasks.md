# Tasks — #6 06_storage_r2

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_06_storage_r2.md`.

## Prerrequisitos

- [x] T1 — Verificar que `01_stack_scaffolding` (#1) dejó carpeta `src/lib/server/storage/` y vars R2 en `.env.example`. Cubre: **R11**.
- [x] T2 — Verificar que `02_modelo_datos` (#2) creó tablas `attachment` y `audit_response` con constraints de 07a. Cubre: **R8, R9**.

## Dependencias y config

- [x] T3 — Instalar `aws4fetch` y añadir `R2_PRESIGN_TTL_SECONDS` a `.env.example`. Cubre: **R1, R4, R11**.
- [x] T4 — Crear `src/lib/server/storage/r2-config.ts` con schema Zod de vars R2. Cubre: **R4, R11**.

## Módulo storage (core)

- [x] T5 — Crear `r2-keys.ts` con `buildR2Key` y `sanitizeSectionCode` según convención `_general` y `{section}`. Cubre: **R6, R7**.
- [x] T6 — Crear `r2-client.ts` con singleton `AwsClient` de `aws4fetch`. Cubre: **R1**.
- [x] T7 — Crear `schemas.ts` con allowlist MIME, `MAX_UPLOAD_BYTES` y schemas de request. Cubre: **R10**.
- [x] T8 — Crear `presign.ts` con `presignPut` y `presignGet` usando TTL de config. Cubre: **R2, R3, R4, R5**.
- [x] T9 — Crear `attachments.ts` con `requestPresignedUpload`, `confirmUpload`, `requestPresignedDownload`. Cubre: **R2, R3, R8, R9, R10**.
- [x] T10 — Crear `index.ts` re-exportando API pública del módulo. Cubre: **R1**.

## Capa DB

- [x] T11 — Crear `src/lib/server/db/attachments.ts` con `insertAttachment`, `getAttachmentById`. Cubre: **R8**.
- [x] T12 — Crear o extender `audit-responses.ts` con `upsertFileRefResponse` (append `attachment_ids`). Cubre: **R9**.

## API routes

- [x] T13 — Implementar `POST .../presign-put/+server.ts` con guards técnico/admin y envelope JSON. Cubre: **R2, R10, R12**.
- [x] T14 — Implementar `POST .../confirm/+server.ts` creando `attachment` y vinculando `audit_response`. Cubre: **R8, R9, R12**.
- [x] T15 — Implementar `GET .../presign-get/+server.ts` para descarga firmada. Cubre: **R3, R5, R12**.

## Tests

- [x] T16 — Crear `tests/fixtures/r2-mock.ts` con mock de `AwsClient.sign`. Cubre: **R13**.
- [x] T17 — Crear `tests/storage-r2.test.ts` (keys, TTL, presign PUT/GET mock, bucket privado). Cubre: **R2, R3, R4, R5, R6, R7**.
- [x] T18 — Crear `tests/api/attachments-presign.test.ts` (auth, validación MIME/tamaño, confirm + audit_response). Cubre: **R8, R9, R10, R12, R13**.

## Verificación final

- [x] T19 — Ejecutar `pnpm test` y confirmar tests storage/API verdes sin credenciales R2 reales. Cubre: **R13**.
- [x] T20 — Ejecutar `pnpm run check` sin errores de tipo. Cubre: **R1**.
- [x] T21 — Ejecutar `./init.sh` y confirmar exit code 0. Cubre: todos.
- [x] T22 — Documentar trazabilidad R→test en `progress/impl_06_storage_r2.md`. Cubre: todos.
