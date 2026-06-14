# Tasks — #20 20_export_import_auditorias

> Orden de implementación. Cada paso referencia los `R<n>` que cubre. El implementer marca `[x]`
> al completar y mantiene el mapa de trazabilidad `R<n> ↔ test` en
> `progress/impl_20_export_import_auditorias.md`. No declarar `done` sin `./init.sh` verde.

## Dominio: schema y errores

- [x] T1 — Crear `src/lib/server/bundle/version.ts` con `BUNDLE_SCHEMA_VERSION = '1.0'` (≠ `CANONICAL_SCHEMA_VERSION`). Cubre: R1.
- [x] T2 — Crear `src/lib/server/bundle/schema.ts` con `auditBundleSchema`, `itemKeySchema`, `type AuditBundle` (ver design §Esquema). Cubre: R1, R3, R6.
- [x] T3 — Crear `src/lib/server/bundle/errors.ts` con `AuditBundleValidationError`, `AuditBundleResolutionError(missing[])`, `AuditBundleDuplicateError`. Cubre: R8, R15.
- [x] T4 — Añadir `tests/audit-bundle-schema.test.ts`: bundle válido pasa; sin `bundle_schema_version` o secciones faltantes falla; `bundle_schema_version` ≠ `CANONICAL_SCHEMA_VERSION`. Cubre: R1.

## Clave de ítem (punto crítico)

- [x] T5 — Crear `src/lib/server/bundle/item-key.ts`: `resolveItemKey(item)` y `itemKeyString(key)` con `{section_code, field_type, sort_order, label}`. Cubre: R4.
- [x] T6 — Añadir `tests/audit-bundle-item-key.test.ts`: misma key origen↔destino; distinto `sort_order` → distinta key; índice destino mapea cada key a un solo `template_item.id`. Cubre: R4.

## Lectura DB y build (export)

- [x] T7 — Crear `src/lib/server/db/audit-bundle.ts` con lecturas `loadAuditForBundle`, `loadResponsesWithItemKeys`, `loadSectionScoresWithCodes`, `loadClosure`, `loadAttachmentsWithItemKeys` (SQL puro, reusando JOINs de `audits.ts`/`audit-form.ts`). Cubre: R1, R5, R6.
- [x] T8 — Crear `src/lib/server/bundle/build.ts` con `buildAuditBundle(auditId)`: arma cabecera con claves naturales, respuestas por `item_key`, scores por `section_code`, cierre, adjuntos como refs `r2_key` (+ `origin_id`), `dedupe_key` con `INSTANCE_ID`. Cubre: R1, R3, R5, R6.
- [x] T9 — Añadir `tests/audit-bundle-build.test.ts`: bundle valida contra schema; no contiene UUID de origen en refs; status preservado para borrador/relevamiento/cerrada; adjuntos como refs sin binario, `item_key:null` si sin ítem. Cubre: R1, R3, R5, R6.

## Endpoint export

- [x] T10 — Crear `src/routes/api/audits/[id]/bundle/export/+server.ts` (`GET`, `requireAdminApi`, 404 si `AuditNotFoundError`). Cubre: R2, R1.
- [x] T11 — Añadir `tests/api/audit-bundle-export.test.ts`: sin sesión 401; `tecnico` 403; `admin` 2xx con bundle válido; en 401/403 no se invoca el builder. Cubre: R2.

## Resolución por clave natural (import lectura)

- [x] T12 — Añadir a `src/lib/server/db/audit-bundle.ts` los resolvers destino: `findClientByNaturalKey`, `findTemplateByCodeVersion`, `buildItemKeyIndex`, `findUserByEmail`. Cubre: R9, R10, R4.
- [x] T13 — Crear `src/lib/server/bundle/resolve.ts` con `resolveBundle(bundle, mode): ResolutionReport` (matches, `missing`, `would_create`), sin escribir. Cubre: R12, R15, R17.

## Import (escritura, transacción, idempotencia)

- [x] T14 — Crear `migrations/011_audit_bundle_import.sql`: tabla `audit_bundle_import` con PK `(origin_instance_id, origin_audit_id)`, FK a `audit` y `app_user`. Cubre: R13.
- [x] T15 — Crear `src/lib/server/bundle/import.ts` con `importAuditBundle(raw, user, mode)`: valida Zod → `resolveBundle` → si `dry-run` devuelve report; si escritura, dedupe + crea `audit`/`audit_response`/`audit_section_score`/`audit_closure`/`attachment` dentro de un único `sql.begin`, remapeando `attachment_ids` embebidos (`file_ref`+`table`) y relinkeando por `r2_key`. Cubre: R8, R9, R10, R11, R12, R13, R14, R17.
- [x] T16 — Añadir `tests/audit-bundle-import.test.ts`: crea auditoría con FK locales y status preservado; recrea responses/scores/closure por clave natural; remapea `attachment_ids` (file_ref y table) y no duplica por `r2_key`; dry-run no escribe; reimport no duplica (`duplicate:true`); error a mitad hace rollback total; template faltante lanza `AuditBundleResolutionError` enumerando; `strict` vs `permissive` para cliente/usuario ausentes. Cubre: R8, R9, R10, R11, R12, R13, R14, R15, R17.

## Endpoint import

- [x] T17 — Crear `src/routes/api/audits/bundle/import/+server.ts` (`POST`, `requireAdminApi`, parse `mode`, mapea errores a 400/422 con `apiError`, éxito con `apiSuccess`). Cubre: R7, R8, R12, R15.
- [x] T18 — Añadir `tests/api/audit-bundle-import.test.ts`: sin sesión 401; `tecnico` 403; body inválido 400; faltante obligatorio 422 con lista; dry-run y escritura 200; conteos de `audit` correctos en cada caso. Cubre: R7, R8, R12, R15.

## Round-trip

- [x] T19 — Añadir `tests/audit-bundle-roundtrip.test.ts` con comparador `bundlesEquivalent` (normaliza UUID/timestamps): `export→import→export` produce bundles equivalentes. Cubre: R16.

## UI backoffice

- [x] T20 — Extender la vista de auditoría en `src/routes/(app)/...`: botón "Exportar bundle" (descarga JSON, solo admin) y modal "Importar bundle" con paso dry-run + confirmación. Cubre: R18.
- [x] T21 — Añadir `e2e/audit-bundle.spec.ts`: admin exporta, hace dry-run, confirma import y ve la auditoría con status original; `tecnico` no ve las acciones. Cubre: R18.

## Trazabilidad y gate

- [x] T22 — Crear `progress/impl_20_export_import_auditorias.md` con el mapa `R1..R18 ↔ test(s)` y actualizar `progress/current.md`. Cubre: trazabilidad (regla dura `docs/specs.md`).
- [x] T23 — Gate final: `pnpm run check` y `pnpm exec tsc --noEmit` sin errores; `pnpm test` (vitest) verde; `pnpm exec playwright test e2e/audit-bundle.spec.ts` verde; `./init.sh` 100% verde. Cubre: R1–R18.

> Nota: T20/T21 (UI/E2E) dependen del backoffice existente; si la vista objetivo no expone aún el
> punto de extensión, documentar el bloqueo en `progress/current.md` antes de marcar `blocked`.
