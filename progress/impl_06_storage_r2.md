# Implementación — #6 06_storage_r2

**Estado:** done  
**Fecha:** 2026-06-09

## Resumen

Módulo `src/lib/server/storage/` con presigned PUT/GET vía `aws4fetch`, bucket privado, convención de keys, persistencia en `attachment` y vínculo `audit_response` para ítems `file_ref`. Tres endpoints API protegidos por sesión staff.

## Trazabilidad

- R1 → `tests/storage-r2.test.ts` > exports módulo storage
- R2 → `tests/storage-r2.test.ts` > presignPut devuelve URL PUT firmada; `tests/api/attachments-presign.test.ts` > presign-put envelope
- R3 → `tests/storage-r2.test.ts` > presignGet devuelve URL GET firmada; `tests/api/attachments-presign.test.ts` > presign-get
- R4 → `tests/storage-r2.test.ts` > respeta R2_PRESIGN_TTL_SECONDS (600) y default 900
- R5 → `tests/storage-r2.test.ts` > URLs contienen X-Amz-Signature, sin rutas públicas
- R6 → `tests/storage-r2.test.ts` > buildR2Key _general
- R7 → `tests/storage-r2.test.ts` > buildR2Key con section_code
- R8 → `tests/api/attachments-presign.test.ts` > inserta attachment; rechaza r2_key duplicado 409
- R9 → `tests/api/attachments-presign.test.ts` > audit_response file_ref actualizado
- R10 → `tests/api/attachments-presign.test.ts` > rechaza MIME y tamaño inválidos
- R11 → `tests/storage-r2.test.ts` > error sin vars R2; `.env.example` documentado
- R12 → `tests/api/attachments-presign.test.ts` > 401 sin sesión; 403 rol no staff
- R13 → `pnpm test` 160/160 verde con mocks (sin credenciales R2 reales)

## Verificación

- `./init.sh` exit 0
- `pnpm run check` sin errores de tipo
