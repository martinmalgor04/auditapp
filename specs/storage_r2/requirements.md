# Requirements — storage_r2

> Módulo server de presigned URLs Cloudflare R2 y persistencia de `attachment`.
> Fuente: SPEC-07g, PRD auditapp-07g-storage-r2.
> Fuera de alcance: compresión/HEIC en cliente (`form_tecnico` #7), thumbnails backoffice, subida desde briefing cliente (v1).

## R1 — Módulo storage con aws4fetch

El sistema DEBE exponer un módulo en `src/lib/server/storage/` que use la librería `aws4fetch` para firmar peticiones S3-compatibles contra Cloudflare R2.

**Verificación:** `package.json` lista `aws4fetch`; `tests/storage-r2.test.ts` importa el módulo y verifica exports de firma.

## R2 — Presigned PUT

CUANDO un usuario autorizado solicita subir un adjunto, el sistema DEBE generar una URL presigned PUT válida para el bucket R2 configurado.

**Verificación:** test unitario con mock de `aws4fetch` devuelve URL con método PUT, host del endpoint R2 y parámetros de firma AWS SigV4.

## R3 — Presigned GET

CUANDO un usuario autorizado solicita ver o descargar un adjunto existente, el sistema DEBE generar una URL presigned GET de corta vida para el `r2_key` almacenado.

**Verificación:** test unitario con mock devuelve URL GET firmada cuyo path coincide con el `r2_key` solicitado.

## R4 — TTL configurable

El sistema DEBE leer el tiempo de vida de las URLs presigned desde la variable de entorno `R2_PRESIGN_TTL_SECONDS` con valor por defecto de 900 segundos (15 minutos).

**Verificación:** test fija `R2_PRESIGN_TTL_SECONDS=600` y aserta que la firma incluye expiración acorde; sin la var, usa 900.

## R5 — Bucket privado

El sistema NO DEBE exponer URLs públicas ni endpoints que sirvan objetos R2 sin firma presigned.

**Verificación:** inspección de rutas API y módulo storage — no existe URL pública al bucket; test confirma que solo se devuelven URLs con query de firma (`X-Amz-Signature` o equivalente).

## R6 — Convención de key `_general`

CUANDO el adjunto no pertenece a un ítem de plantilla (`item_id` nulo), el sistema DEBE generar la key con el patrón `audits/{audit_id}/_general/{uuid}`.

**Verificación:** test de `buildR2Key` (o equivalente) con `item_id=null` produce key que coincide con regex `^audits/[0-9a-f-]+/_general/[0-9a-f-]+$`.

## R7 — Convención de key por sección

CUANDO el adjunto pertenece a un ítem de plantilla, el sistema DEBE generar la key con el patrón `audits/{audit_id}/{section_code}/{uuid}` donde `section_code` es el código de la sección del ítem.

**Verificación:** test con `audit_id`, `section_code='A11'` e `item_id` definido produce key `audits/{audit_id}/A11/{uuid}`.

## R8 — Unicidad de r2_key en attachment

CUANDO se confirma una subida exitosa, el sistema DEBE insertar una fila en `attachment` con `r2_key` único, `filename`, `content_type`, `size_bytes`, `kind`, `audit_id`, `item_id` (nullable) y `uploaded_by`.

**Verificación:** test de integración inserta attachment y falla con constraint violation al repetir el mismo `r2_key`.

## R9 — Vinculación attachment ↔ audit_response

CUANDO se confirma una subida vinculada a un ítem (`item_id` no nulo), el sistema DEBE actualizar o crear la fila `audit_response` correspondiente a `(audit_id, item_id)` con `field_type=file_ref` almacenando la referencia al `attachment.id` en su valor JSON.

**Verificación:** test de integración confirma subida y aserta que `audit_response` para ese par contiene el UUID del attachment creado.

## R10 — Validación de tipo y tamaño

CUANDO se solicita presigned PUT, el sistema DEBE validar con Zod que `content_type` pertenece a la lista permitida (imágenes: `image/jpeg`, `image/png`, `image/webp`, `image/heic`; documentos: `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `text/plain`) y que `size_bytes` no supera 26_214_400 bytes (25 MB).

**Verificación:** tests API rechazan `content_type=application/x-executable` y `size_bytes` mayor al máximo con envelope `{ success: false }`.

## R11 — Variables de entorno R2

El sistema DEBE validar al arranque (o al primer uso del módulo storage) las variables `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y `R2_ENDPOINT`; estas variables NO DEBEN exponerse al cliente.

**Verificación:** test sin vars R2 lanza error claro server-side; `.env.example` documenta las vars; ningún módulo `$lib` del cliente importa credenciales R2.

## R12 — Autorización en endpoints

CUANDO un usuario sin rol `tecnico` o `admin` solicita presigned PUT o GET, el sistema DEBE responder con HTTP 401 o 403 sin generar URL firmada.

**Verificación:** `tests/api/attachments-presign.test.ts` con sesión mock de rol no autorizado recibe 401/403.

## R13 — Tests con mock o sandbox

El sistema DEBE incluir tests automatizados que verifiquen firma presigned y flujo de attachment usando mock de `aws4fetch` o bucket R2 sandbox de desarrollo, sin requerir credenciales de producción en CI.

**Verificación:** `pnpm test` ejecuta `tests/storage-r2.test.ts` y `tests/api/attachments-presign.test.ts` con exit code 0 en entorno sin R2 real (mock).

## Trazabilidad acceptance → R

| Acceptance (feature_list.json) | Requirements |
|---|---|
| Módulo storage con presigned PUT y GET via aws4fetch | R1, R2, R3 |
| Bucket privado, TTL configurable en URLs | R4, R5 |
| Convención key: `audits/{id}/_general/{uuid}` y `audits/{id}/{section}/{uuid}` | R6, R7 |
| Tabla attachment vincula r2_key a audit_response | R8, R9 |
| Tests con mock o sandbox R2 pasan | R13 (+ R2, R3, R8, R9, R12) |
