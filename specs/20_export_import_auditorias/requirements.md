# Requirements — #20 20_export_import_auditorias

> Export/import de una auditoría completa como **bundle JSON portable** para migrarla entre
> instancias (dev↔prod, respaldo). El desafío central es el **remapeo de identidades en el
> destino**: los UUID no coinciden entre instancias, así que el import resuelve cliente,
> templates, secciones, ítems y usuarios por **clave natural** (CUIT/razón social, code+version
> de template, code de sección, clave estable de ítem, email de usuario), nunca por UUID de
> origen. Adjuntos: solo **referencias r2_key** (sin binarios; asume bucket R2 compartido).
> Estados: **cualquiera** (se preserva el `status` original). Es un round-trip fiel de la
> entidad auditoría.
>
> **Diferenciación (no duplicar):** distinto del export canónico #9
> (`src/lib/server/canonical/`, `CANONICAL_SCHEMA_VERSION='1.1'`) que es derivado/lossy, solo
> cerradas y sin attachment_ids remapeables; y del backup de respuestas del form #7
> (`src/lib/form/backup-schema.ts`, `formBackupSchema` v1.0) que es parcial (solo respuestas).
> Esta feature define un **bundle propio** (`bundle_schema_version`, distinto de
> `CANONICAL_SCHEMA_VERSION`) y es superset de ambos. Puede reutilizar helpers de lectura DB.
>
> **Scope acotado:** solo admin. No exporta/importa binarios de R2, ni recrea templates/
> secciones/ítems (deben preexistir en destino). No recalcula scoring ni status vía
> transiciones — preserva el `status` tal cual.

Convenciones EARS (`docs/specs.md`): un solo DEBE por requirement, id estable, verificable por
test concreto. Capas y envelope per `docs/architecture.md` / `docs/conventions.md`.

---

## R1 — Bundle exportable versionado y válido contra Zod

CUANDO un admin solicita `GET /api/audits/[id]/bundle/export`, el sistema DEBE producir un
bundle JSON con `bundle_schema_version` (constante propia, distinta de `CANONICAL_SCHEMA_VERSION`)
que contiene cabecera de la auditoría, respuestas, scores por sección, cierre y referencias de
adjuntos, y que valida contra el schema Zod `auditBundleSchema`.

**Verificación:** `tests/audit-bundle-schema.test.ts` — un bundle construido por `buildAuditBundle`
valida contra `auditBundleSchema`; un bundle sin `bundle_schema_version` o con secciones faltantes
es rechazado por el schema; `bundle_schema_version` no es igual a `CANONICAL_SCHEMA_VERSION`.

## R2 — Export solo admin

CUANDO `GET /api/audits/[id]/bundle/export` recibe una request sin sesión o de un usuario con
rol distinto de `admin`, el sistema DEBE responder `401` (sin sesión) o `403` (rol `tecnico`)
mediante `requireAdminApi`, sin leer la auditoría.

**Verificación:** `tests/api/audit-bundle-export.test.ts` — sin sesión 401; `tecnico` 403; `admin`
2xx; en los casos 401/403 no se invoca el builder del bundle.

## R3 — Entidades referenciadas por clave natural, nunca por UUID de origen

CUANDO el export construye el bundle, el sistema DEBE representar cada entidad referenciada por su
clave natural —cliente por `{cuit, razon_social}`, template por `{code, version}`, sección por
`{code}` dentro del template, ítem por su clave estable de ítem (ver R4), usuario por `email`— y
NO DEBE incluir ningún UUID de la instancia de origen como clave de resolución.

**Verificación:** `tests/audit-bundle-build.test.ts` — el bundle serializado no contiene los UUID
de `audit.id`, `client.id`, `template.id`, `section.id`, `template_item.id`, `app_user.id` de
origen en los campos de referencia; cada referencia trae la clave natural esperada.

## R4 — Clave estable de ítem dentro de la sección

CUANDO el export o el import necesita identificar un `template_item` (que no tiene columna `code`),
el sistema DEBE usar la clave natural compuesta `{section_code, field_type, sort_order, label}`
resuelta dentro del template, documentada como `item_key` en el bundle.

**Verificación:** `tests/audit-bundle-item-key.test.ts` — `resolveItemKey` produce la misma clave
para el mismo ítem en origen y destino; dos ítems de la misma sección con distinto `sort_order`
producen claves distintas; la resolución en destino mapea cada `item_key` del bundle a exactamente
un `template_item.id` local.

## R5 — Export en cualquier estado preservando status

CUANDO un admin exporta una auditoría, el sistema DEBE incluirla independientemente de su `status`
(`borrador`…`cerrada`) y registrar el `status` original en la cabecera del bundle.

**Verificación:** `tests/audit-bundle-build.test.ts` — exportar una auditoría en `borrador`, en
`en_relevamiento` y en `cerrada` produce bundles válidos cuyo `header.status` coincide con el
`status` de origen.

## R6 — Adjuntos como referencias sin binarios

CUANDO el export procesa los adjuntos de la auditoría, el sistema DEBE incluir cada uno como
referencia `{r2_key, filename, content_type, size_bytes, kind, item_key}` (sin contenido binario),
y la `item_key` DEBE ser `null` cuando el adjunto no está ligado a un ítem.

**Verificación:** `tests/audit-bundle-build.test.ts` — el bundle lista cada `attachment` con su
`r2_key` y metadata, sin campo de binario/base64; un adjunto con `item_id` null produce
`item_key: null`.

## R7 — Import solo admin

CUANDO `POST /api/audits/bundle/import` recibe una request sin sesión o de un usuario con rol
distinto de `admin`, el sistema DEBE responder `401` o `403` mediante `requireAdminApi`, sin
escribir en la DB.

**Verificación:** `tests/api/audit-bundle-import.test.ts` — sin sesión 401; `tecnico` 403; el
conteo de filas de `audit` no cambia en esos casos.

## R8 — Import valida el bundle con Zod antes de tocar la DB

CUANDO `POST /api/audits/bundle/import` recibe el body, el sistema DEBE validarlo con
`auditBundleSchema`; SI la validación falla ENTONCES el sistema DEBE responder `400` con el
envelope `{ success:false, ... }` y detalle del error, sin escribir en la DB.

**Verificación:** `tests/api/audit-bundle-import.test.ts` — body sin `bundle_schema_version` o con
`header` incompleto retorna 400; el conteo de `audit` no cambia.

## R9 — Resolución por clave natural en destino y creación de la auditoría

CUANDO el import procesa un bundle válido en modo escritura, el sistema DEBE resolver cliente,
template(s), secciones, ítems y usuarios por clave natural en la instancia destino y crear la fila
`audit` con `status` igual al del bundle, generando un `id` nuevo local y un `public_token` propio
si el status lo requiere.

**Verificación:** `tests/audit-bundle-import.test.ts` — importar un bundle en una base con las
mismas plantillas crea una `audit` nueva con `client_id`, `template_ids`, `assigned_tech_id`
resueltos a los UUID locales; `audit.status` igual al `header.status`.

## R10 — Recreación de respuestas, scores y cierre con remapeo

CUANDO el import crea la auditoría, el sistema DEBE recrear `audit_response` (por `item_key`),
`audit_section_score` (por `section_code`) y `audit_closure` ligándolos al `audit.id` local.

**Verificación:** `tests/audit-bundle-import.test.ts` — tras importar, los conteos de
`audit_response`, `audit_section_score` y la fila `audit_closure` coinciden con el bundle; cada
respuesta apunta al `template_item.id` local correcto vía su `item_key`.

## R11 — Recreación de adjuntos y remapeo de attachment_ids embebidos

CUANDO el import recrea los adjuntos, el sistema DEBE insertar filas `attachment` relinkeando por
`r2_key` (reusando la fila existente si el `r2_key` ya está presente) y DEBE remapear los
`attachment_ids` embebidos en `audit_response.value` (`field_type` `file_ref` y `table`) de los
UUID de origen a los nuevos `attachment.id` locales.

**Verificación:** `tests/audit-bundle-import.test.ts` — tras importar, un `audit_response` de tipo
`file_ref` tiene `value.attachment_ids` apuntando a los `attachment.id` locales (no a los de
origen); un `table` remapea `attachment_ids` por fila; un `r2_key` ya existente no inserta fila
duplicada.

## R12 — Dry-run que reporta sin escribir

CUANDO `POST /api/audits/bundle/import` recibe `mode: "dry-run"`, el sistema DEBE devolver un
reporte de qué entidades hacen match, cuáles faltan (template/sección/ítem/cliente/usuario no
encontrados) y qué se crearía, sin escribir ninguna fila en la DB.

**Verificación:** `tests/audit-bundle-import.test.ts` — dry-run sobre un bundle resoluble reporta
matches y `would_create` sin alterar conteos de `audit`/`audit_response`/`attachment`; dry-run
sobre un bundle con un template faltante lista el faltante y no escribe.

## R13 — Idempotencia por clave de bundle

CUANDO un admin importa en modo escritura un bundle cuya clave de dedupe
`{origin_instance_id, origin_audit_id}` ya fue importada antes, el sistema DEBE detectar el
duplicado y NO DEBE crear una segunda auditoría, reportando la `audit.id` local ya existente.

**Verificación:** `tests/audit-bundle-import.test.ts` — importar dos veces el mismo bundle crea
una sola `audit`; la segunda respuesta reporta `duplicate: true` con el `audit_id` local previo;
el conteo de `audit` aumenta en 1 (no 2).

## R14 — Atomicidad: un import fallido no deja datos parciales

SI durante la escritura del import ocurre un error (entidad faltante detectada tarde, violación de
constraint, fallo de DB) ENTONCES el sistema DEBE abortar la transacción de modo que no quede
ninguna fila parcial (`audit`, `audit_response`, `audit_section_score`, `audit_closure`,
`attachment`) creada por ese import.

**Verificación:** `tests/audit-bundle-import.test.ts` — un import que falla a mitad (forzando error
tras crear `audit`) deja el conteo de `audit` y `audit_response` igual al previo (rollback total).

## R15 — Faltantes obligatorios enumerados, sin escribir

SI el import (dry-run o escritura) detecta que faltan entidades obligatorias en destino —template
por `{code,version}` o ítem por `item_key` inexistente— ENTONCES el sistema DEBE fallar con un
error tipado `AuditBundleResolutionError` que enumera los faltantes y NO DEBE escribir ninguna
fila.

**Verificación:** `tests/audit-bundle-import.test.ts` — importar un bundle cuyo template no existe
en destino lanza `AuditBundleResolutionError` con `code='AUDIT_BUNDLE_RESOLUTION'` y la lista de
faltantes; el conteo de `audit` no cambia; `tests/api/audit-bundle-import.test.ts` — el endpoint
responde 422 con el envelope de error y los faltantes.

## R16 — Round-trip idempotente del bundle

CUANDO se exporta una auditoría, se importa en una instancia equivalente y se vuelve a exportar la
auditoría creada, el sistema DEBE producir un segundo bundle semánticamente equivalente al primero
(misma cabecera por clave natural, mismas respuestas por `item_key`, mismos scores por
`section_code`, mismo cierre y mismas referencias de adjuntos por `r2_key`), ignorando UUID e
instantes de auditoría.

**Verificación:** `tests/audit-bundle-roundtrip.test.ts` — `export → import → export` produce dos
bundles que un comparador `bundlesEquivalent` (que normaliza UUID/timestamps) declara equivalentes.

## R17 — Política de cliente y usuario ausentes (match-or-create / fallback)

CUANDO el import resuelve cliente o usuario y no encuentra match por clave natural, el sistema DEBE
aplicar la política del `mode`: en `strict` fallar enumerándolos como faltantes (R15); en
`permissive` crear el `client` ausente por su clave natural y, para usuarios ausentes, asignar
`NULL` en las FK nullable (`assigned_tech_id`, `created_by`, `updated_by`, `closed_by`,
`uploaded_by`).

**Verificación:** `tests/audit-bundle-import.test.ts` — modo `strict` con cliente ausente falla y
no escribe; modo `permissive` crea el `client` por CUIT y deja `assigned_tech_id=NULL` cuando el
email del técnico no existe en destino.

## R18 — E2E del flujo admin export→import

CUANDO un admin usa el backoffice para exportar una auditoría y luego importar el bundle, el
sistema DEBE descargar un bundle válido y, tras un dry-run y una confirmación, mostrar la
auditoría importada en el listado preservando su status.

**Verificación:** `e2e/audit-bundle.spec.ts` — admin exporta (descarga JSON), abre import, ve el
reporte dry-run, confirma y la auditoría aparece en el listado con el status original; un
`tecnico` no ve las acciones de export/import.

---

## Cobertura de acceptance

| Acceptance (feature_list #20) | Requirements |
|---|---|
| Export admin produce bundle versionado válido contra Zod (cabecera, respuestas, scores, cierre, refs adjuntos) | R1, R2, R6 |
| Export usa claves naturales (cliente CUIT/razón social, template code+version, sección code, ítem clave estable, usuario email); nunca UUID de origen | R3, R4 |
| Export en cualquier estado, registra status original | R5 |
| Adjuntos como referencias (r2_key + metadata) sin binarios; import relinkea por r2_key | R6, R11 |
| Import admin valida Zod, resuelve por clave natural y crea auditoría+respuestas+scores+cierre+adjuntos preservando status | R7, R8, R9, R10, R11 |
| Dry-run reporta matches/faltantes/qué se crearía sin escribir | R12 |
| Idempotencia (dedupe por clave de bundle) y atomicidad (transacción) | R13, R14 |
| Faltantes obligatorios (template/ítem) → error claro enumerándolos, sin escribir | R15 |
| Tests round-trip, remapeo por clave natural, dry-run, idempotencia, status, atomicidad, guards | R3, R4, R12, R13, R14, R16, R2, R7 |
| Política match-or-create cliente / fallback usuario (decisión de modo) | R17 |
| Flujo E2E backoffice admin export→import | R18 |
