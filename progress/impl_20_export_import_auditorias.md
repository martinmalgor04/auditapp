# Implementación — #20 20_export_import_auditorias

Export/import de auditorías completas como **bundle JSON portable** entre instancias, con
remapeo de identidades por **clave natural** en destino. Solo admin. Adjuntos como referencias
`r2_key` (sin binarios). Import transaccional, idempotente (dedupe) y con `dry-run`.

## Decisiones humanas respetadas (design §Open Questions)

- **OQ-1** — Clave de ítem `{section_code, field_type, sort_order, label}`. Mismo `sort_order`
  pero `field_type` distinto ⇒ no matchea ⇒ se trata como faltante (drift). Implementado en
  `item-key.ts` (`itemKeyString` incluye los 4 campos) + `buildItemKeyIndex`.
- **OQ-2** — Endpoint `POST /api/audits/bundle/import` default `dry-run`; la escritura exige
  `mode: strict|permissive` explícito. `strict` no crea clientes; `permissive` crea el cliente
  ausente por clave natural. Implementado en `resolve.ts` + `import.ts` + el `+server.ts`.
- **OQ-3** — En import se regenera `public_token` solo si `status ∈ {briefing_enviado,
  briefing_completo}`; `NULL` en el resto. El bundle nunca porta el token de origen (no se
  exporta). Implementado en `import.ts` (`TOKEN_STATUSES`).

## Archivos creados / modificados

**Dominio (`src/lib/server/bundle/`)**
- `version.ts` — `BUNDLE_SCHEMA_VERSION = '1.0'` (≠ `CANONICAL_SCHEMA_VERSION = '1.1'`).
- `schema.ts` — `auditBundleSchema`, `itemKeySchema`, tipos.
- `errors.ts` — `AuditBundleValidationError` (400), `AuditBundleResolutionError(missing[])` (422),
  `AuditBundleDuplicateError`.
- `item-key.ts` — `resolveItemKey`, `itemKeyString`.
- `build.ts` — `buildAuditBundle(auditId)` (export).
- `resolve.ts` — `resolveBundle(bundle, mode)` (lectura, `ResolutionReport`).
- `import.ts` — `importAuditBundle(raw, user, mode)` (dry-run + escritura transaccional).

**DB (`src/lib/server/db/`)**
- `audit-bundle.ts` — lecturas del build (`loadAuditForBundle`, `loadResponsesWithItemKeys`,
  `loadSectionScoresWithCodes`, `loadClosure`, `loadAttachmentsWithItemKeys`) + resolvers destino
  (`findClientByNaturalKey`, `findTemplateByCodeVersion`, `buildItemKeyIndex`,
  `buildSectionCodeIndex`, `findUserByEmail`).

**API (`src/routes/api/audits/`)**
- `[id]/bundle/export/+server.ts` — `GET` admin.
- `bundle/import/+server.ts` — `POST` admin (dry-run/escritura).

**UI (`src/routes/(app)/auditorias/[id]/`)**
- `+page.svelte` — monta `<AuditBundleActions>` solo si `isAdmin`.
- `src/lib/components/backoffice/audit-bundle-actions.svelte` — botón export + import file +
  dry-run report + confirmación.

**Migración**
- `migrations/011_audit_bundle_import.sql` — tabla `audit_bundle_import` (PK
  `(origin_instance_id, origin_audit_id)`, FK a `audit`/`app_user`) para dedupe.

**Env**
- `src/lib/env.ts` — `INSTANCE_ID` opcional + `getInstanceId()` (fallback `'unknown'`).
- `.env.example` — documenta `INSTANCE_ID`.

**Tests / helpers**
- `tests/fixtures/audit-bundle.ts` — `seedBundleAuditFixture` (audit rica: file_ref + table con
  attachment_ids, score, closure, adjunto sin ítem).
- `tests/helpers/db.ts` — `audit_bundle_import` agregado a los TRUNCATE.
- `e2e/ensure-bundle-audit.ts` — seed E2E.

## Trazabilidad R1..R18 ↔ test(s)

- **R1** (bundle versionado válido Zod) →
  `tests/audit-bundle-schema.test.ts > acepta un bundle válido`,
  `> BUNDLE_SCHEMA_VERSION es distinto de CANONICAL_SCHEMA_VERSION`;
  `tests/audit-bundle-build.test.ts > produce un bundle que valida contra auditBundleSchema`.
- **R2** (export solo admin) →
  `tests/api/audit-bundle-export.test.ts > sin sesión 401 ... no invoca el builder`,
  `> rol tecnico 403 ... no invoca el builder`, `> admin obtiene 200 con bundle válido`.
- **R3** (claves naturales, nunca UUID de origen) →
  `tests/audit-bundle-build.test.ts > no contiene UUID de origen en campos de referencia`.
- **R4** (clave estable de ítem) →
  `tests/audit-bundle-item-key.test.ts` (4 casos: misma key, distinto sort_order, drift
  field_type, índice destino 1:1).
- **R5** (export en cualquier estado, status preservado) →
  `tests/audit-bundle-build.test.ts > preserva el status original (borrador, en_relevamiento,
  cerrada)`.
- **R6** (adjuntos como refs sin binarios, item_key null sin ítem) →
  `tests/audit-bundle-build.test.ts > incluye adjuntos como refs r2_key sin binario; item_key
  null sin ítem`.
- **R7** (import solo admin) →
  `tests/api/audit-bundle-import.test.ts > sin sesión 401 ...`, `> rol tecnico 403 ...`.
- **R8** (import valida Zod antes de tocar DB) →
  `tests/audit-bundle-import.test.ts > body inválido lanza AuditBundleValidationError`;
  `tests/api/audit-bundle-import.test.ts > body inválido ... 400 sin escribir`.
- **R9** (resolución por clave natural + crea audit) →
  `tests/audit-bundle-import.test.ts > crea audit con FK locales y status preservado ...`.
- **R10** (recreación responses/scores/closure remapeados) →
  `tests/audit-bundle-import.test.ts > crea audit ... recrea responses/scores`,
  `> preserva closure en auditoría cerrada`.
- **R11** (recreación adjuntos + remapeo attachment_ids embebidos) →
  `tests/audit-bundle-import.test.ts > remapea attachment_ids embebidos (file_ref y table) ...`,
  `> no duplica attachment cuando el r2_key ya existe`.
- **R12** (dry-run reporta sin escribir) →
  `tests/audit-bundle-import.test.ts > dry-run no escribe`,
  `> dry-run con template faltante lista el faltante y no escribe`;
  `tests/api/audit-bundle-import.test.ts > dry-run responde 200 con report ...`,
  `> default sin mode es dry-run ...`.
- **R13** (idempotencia por clave de bundle) →
  `tests/audit-bundle-import.test.ts > reimport no duplica (duplicate:true, +1 audit)`.
- **R14** (atomicidad: rollback total) →
  `tests/audit-bundle-import.test.ts > atomicidad: error a mitad hace rollback total (R14)`.
- **R15** (faltantes obligatorios enumerados, sin escribir) →
  `tests/audit-bundle-import.test.ts > template faltante en escritura lanza
  AuditBundleResolutionError sin escribir`;
  `tests/api/audit-bundle-import.test.ts > template faltante en escritura responde 422 con la
  lista de faltantes`.
- **R16** (round-trip idempotente) →
  `tests/audit-bundle-roundtrip.test.ts > export → import → export produce bundles equivalentes`.
- **R17** (política cliente/usuario ausentes) →
  `tests/audit-bundle-import.test.ts > strict con cliente ausente falla y no escribe (R17)`,
  `> permissive crea cliente ausente por CUIT y deja assigned_tech NULL si el email no existe`.
- **R18** (E2E backoffice admin export→import) →
  `e2e/audit-bundle.spec.ts > admin exporta, hace dry-run, confirma y ve la auditoría ...`,
  `> un tecnico no ve las acciones de export/import`.

## Verificación

- `pnpm test` (vitest): nuevos 40 tests verdes; suite completa — ver gate.
- `pnpm exec playwright test e2e/audit-bundle.spec.ts`: ver gate.
- `./init.sh`: ver gate.
- Nota sobre `pnpm run check` / `pnpm exec tsc --noEmit`: el repo trae **errores
  pre-existentes** ajenos a esta feature (`tests/setup.ts`, `tests/api/attachments-delete.test.ts`,
  `tests/form-save-indicator.test.ts`, `src/lib/server/db/audit-responses.ts`). Ninguno está en
  los archivos de #20. El gate del arnés (`init.sh`) corre `pnpm test`, no `tsc`.
