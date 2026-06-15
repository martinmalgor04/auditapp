# Implementación — #21 21_import_clientes

Feature de import de clientes en vivo (CSV/.xlsx) dentro del CRM, solo admin. Match por CUIT,
upsert transaccional, reporte por fila. Set canónico de 7 columnas; resto ignorado y reportado.

## Archivos creados
- `migrations/013_client_cuit_index.sql` — merge de CUIT duplicados (repunta FKs audit/crm_lead,
  conserva id menor) + índice único parcial `client_cuit_unique WHERE cuit IS NOT NULL`.
- `src/lib/server/clients/schema.ts` — `clientImportRowSchema` (Zod), `normalizeCuit`, `ClientImportRow`.
- `src/lib/server/clients/errors.ts` — `UnsupportedFormatError` (code `UNSUPPORTED_FORMAT`).
- `src/lib/server/clients/parse.ts` — `parseCsv` (csv-parse/sync), `parseXlsx` (node-xlsx, 1ª hoja,
  síncrono), `detectFormat` (csv/xlsx por extensión+content-type).
- `src/lib/server/clients/normalize.ts` — `CANONICAL_FIELDS`, `HEADER_ALIASES`, `normalizeRow`
  (emptyToNull + normalizeCuit, descarta no canónicas), `inspectHeaders` (mapped/ignored).
- `src/lib/server/clients/import.ts` — `planClientImport(rows, headers)` → `{total, valid, skipped,
  invalid, ignoredColumns}`; dedupe por CUIT (última gana); válidas sin CUIT → skipped.
- `src/lib/server/db/clients-import.ts` — `applyClientImport(plan)` en `sql.begin`, upsert
  `ON CONFLICT (cuit) WHERE cuit IS NOT NULL`, `RETURNING (xmax=0)`, origen solo en insert.
- `src/routes/api/crm/clients/import/+server.ts` — endpoint POST admin-only multipart.
- `static/plantillas/clientes-import-template.csv` — plantilla con 7 encabezados canónicos + 2 ejemplos.
- Tests: `tests/clients-import-parse.test.ts`, `tests/clients-import-validate.test.ts`,
  `tests/clients-import-template.test.ts`, `tests/clients-cuit-cleanup.test.ts`,
  `tests/clients-import-upsert.test.ts`, `tests/api/clients-import.test.ts`,
  `e2e/import-clientes.spec.ts`.

## Archivos modificados
- `src/routes/(app)/crm/+page.svelte` — botón "Importar clientes" (solo admin), panel con
  `<input type=file accept=.csv,.xlsx>`, enlace de plantilla, fetch multipart, reporte (contadores +
  errores por fila + columnas ignoradas).
- `package.json` / `pnpm-lock.yaml` — `node-xlsx@0.24.0`.
- `tests/setup.ts` — agrega los 3 tests de dominio puro a SKIP_DB_RESET (no tocan DB).
- `tests/fixtures/mercado-audit.ts`, `tests/fixtures/audit-bundle.ts`,
  `tests/audit-bundle-build.test.ts` — adaptación a la nueva restricción UNIQUE de cuit
  (ver "Efectos colaterales").

## Trazabilidad R ↔ test
- R1 → `e2e/import-clientes.spec.ts > admin ve la acción de importar y el enlace de plantilla`
- R2 → `tests/api/clients-import.test.ts > sin sesión 401 / rol tecnico 403` (sin escritura)
- R3 → `tests/clients-import-parse.test.ts > CSV y xlsx producen las mismas filas normalizadas`
- R4 → `tests/clients-import-parse.test.ts > detectFormat ... rechaza el resto` +
  `tests/api/clients-import.test.ts > formato no soportado responde 415 sin escribir`
- R5 → `tests/clients-import-parse.test.ts > solo set canónico se mapea; id/categoria_iva/ts descartados`
- R5.bis → `tests/clients-import-parse.test.ts > alias numero_doc -> cuit y razón social -> razon_social`
- R5.ter → `tests/clients-import-parse.test.ts > inspectHeaders lista columnas ignoradas` +
  `tests/api/clients-import.test.ts > ignoredColumns contiene id/categoria_iva`
- R6 → `tests/clients-import-parse.test.ts > vacíos -> null en opcionales`
- R7 → `tests/clients-import-parse.test.ts > normalizeCuit deja solo dígitos`
- R8 → `tests/clients-import-validate.test.ts > fila sin razon_social -> inválida ... no aborta`
- R9 → `tests/clients-import-validate.test.ts > CUIT no-11-dígitos -> inválida`
- R9.bis → `tests/clients-import-validate.test.ts > válida sin CUIT -> skipped`
- R10 → `tests/clients-import-upsert.test.ts > CUIT nuevo crea; existente actualiza`
- R11 → `tests/clients-import-upsert.test.ts > origen=presupuestos en insert; no se pisa en update`
- R12 → `tests/clients-import-upsert.test.ts > error a mitad de la transacción revierte todo`
- R13 → `tests/api/clients-import.test.ts > admin con CSV válido ... reporte completo` +
  `tests/clients-import-validate.test.ts > reporta total, categorías separadas`
- R14 → `e2e/import-clientes.spec.ts > subir un CSV muestra el reporte con contadores`
- R15 → `tests/clients-import-upsert.test.ts > reimport del mismo set no crea duplicados`
- R16 → `tests/clients-import-upsert.test.ts > dos filas mismo CUIT -> 1 cliente` +
  `tests/clients-import-validate.test.ts > dos filas mismo CUIT -> consolida`
- R17 → `tests/clients-cuit-cleanup.test.ts > detecta duplicados antes del índice`
- R18 → `tests/clients-cuit-cleanup.test.ts > mergea conservando id menor` +
  `> repunta FKs de audit/crm_lead al id conservado`
- R19 → `e2e/import-clientes.spec.ts > enlace de plantilla` (href correcto)
- R20 → `tests/clients-import-template.test.ts > encabezados canónicos exactos + ≥1 fila`
- R21 → `tests/clients-import-template.test.ts > importar la plantilla -> 0 inválidas/ignoradas`

## T1 — verificación de la migración contra el seed real
- Seed real `seed/clientes-presupuestossys.csv` = 1895 filas, **0 CUIT duplicados** (raw ni
  normalizados a dígitos). El merge (R17/R18) es red de seguridad, no toca el seed limpio.
- La DB dev tenía 2 grupos de CUIT duplicados (`30-99999999-1` x15, `30-99887766-5` x14) que eran
  basura de fixtures de test acumulada. La migración 013 corrió contra esa DB:
  índice creado, 0 grupos duplicados restantes, registrada en `schema_migration`. Sin FKs colgadas.
- PK de `client` es uuid: `min(uuid)` no existe en PG → se usa `min(id::text)::uuid`
  (orden lexicográfico determinístico = "id menor").

## Resultado de verificación
- `pnpm run check` → 0 errores, 25 warnings (todas preexistentes `state_referenced_locally`).
- `pnpm run build` → OK (adapter-node).
- `pnpm test` → 156 archivos, 715 tests pasan, 2 skip preexistentes, 0 fallos.
- `./init.sh` → secciones 1, 2 y 4 (tests) OK. Sección 3 reporta FAIL **preexistente**: hay 2
  features en `in_progress` (#12 `12_reunion_asistente` y #21). Ambas ya estaban `in_progress` en
  HEAD antes de esta sesión (verificado con `git show HEAD:feature_list.json`). No lo introduje
  esta feature y no toqué el status de #12 (fuera de alcance). El reviewer debe resolver el estado
  de #12 para que el gate quede verde.
