# Tasks — #21 21_import_clientes

> Orden de implementación. Cada paso referencia los `R<n>` que cubre. El implementer marca `[x]`
> al completar y mantiene el mapa de trazabilidad `R<n> ↔ test` en
> `progress/impl_21_import_clientes.md`. No declarar `done` sin `./init.sh`, `pnpm run check`,
> `pnpm run build` y `pnpm test` verdes.

## Dependencias y migración

- [x] T1 — Detectar y limpiar duplicados de CUIT en una DB seedeada **antes** del índice único:
  correr `SELECT cuit, count(*) FROM client WHERE cuit IS NOT NULL GROUP BY cuit HAVING
  count(*) > 1` y registrar el resultado; verificar que el `DELETE` de merge (conserva `id` menor)
  no deja FKs colgadas en `audit`/`crm_lead` (repuntar al `id` conservado si hace falta). Cubre:
  R17, R18.
- [x] T2 — `pnpm add node-xlsx`. Confirmar que `pnpm run build` y vitest siguen verdes (default
  export, solo server). Cubre: R3.
- [x] T3 — Crear `migrations/013_client_cuit_index.sql`: **paso 1** `DELETE` de merge de CUIT
  duplicados conservando el `id` menor; **paso 2** `CREATE UNIQUE INDEX IF NOT EXISTS
  client_cuit_unique ON client (cuit) WHERE cuit IS NOT NULL`. Cubre: R10, R15, R16, R17, R18.

## Dominio: schema, normalización, parse

- [x] T4 — Crear `src/lib/server/clients/schema.ts`: `clientImportRowSchema`, `normalizeCuit`,
  `type ClientImportRow`. Cubre: R7, R8, R9.
- [x] T5 — Crear `src/lib/server/clients/errors.ts`: `UnsupportedFormatError`. Cubre: R4.
- [x] T6 — Crear `src/lib/server/clients/parse.ts`: `parseCsv` (csv-parse/sync, `columns:true`,
  `relax_quotes:true`), `parseXlsx` (node-xlsx default export, `xlsx.parse(buffer)`, primera hoja,
  derivar encabezados de `data[0]`, zippear con `data.slice(1)`, celdas→string, descartar filas
  vacías), `detectFormat` (csv/xlsx por extensión+content-type, lanza `UnsupportedFormatError`).
  Cubre: R3, R4, R5.
- [x] T7 — Crear `src/lib/server/clients/normalize.ts`: `CANONICAL_FIELDS`, `HEADER_ALIASES`
  (`numero_doc|cuit`→cuit, `razón social|razon_social`→razon_social), `normalizeRow` con
  `emptyToNull` + `normalizeCuit` descartando columnas no canónicas, `inspectHeaders`
  (mapped/ignored). Cubre: R5, R5.bis, R5.ter, R6, R7.
- [x] T8 — Crear `src/lib/server/clients/import.ts`: `planClientImport(rows, headers)` → `{total,
  valid, skipped, invalid, ignoredColumns}`, numeración de fila 1-based sobre datos, dedupe por
  CUIT (última gana), válidas sin CUIT → `skipped` (categoría separada), `ignoredColumns` desde
  `inspectHeaders`. Cubre: R5.ter, R8, R9, R9.bis, R13, R16.

## Tests de dominio

- [x] T9 — `tests/clients-import-parse.test.ts`: CSV y xlsx (node-xlsx) producen las mismas filas;
  set canónico mapeado y `id`/`categoria_iva`/timestamps descartados; alias `numero_doc`→cuit y
  `razón social`→razon_social; `ignoredColumns` lista las descartadas; vacíos→null;
  `30-12345678-9`→`30123456789`. Cubre: R3, R5, R5.bis, R5.ter, R6, R7.
- [x] T10 — `tests/clients-import-validate.test.ts`: fila sin `razon_social`→inválida con
  fila+motivo; CUIT no-11-dígitos→inválida; el resto del lote sigue procesándose; fila válida sin
  CUIT→`skipped` (no inválida, no creada). Cubre: R8, R9, R9.bis, R13.
- [x] T10.bis — `tests/clients-import-template.test.ts`: leer `static/plantillas/clientes-import-template.csv`,
  verificar encabezados canónicos exactos + ≥1 fila ejemplo; correrlo por
  `parseCsv`+`planClientImport` esperando `invalid: []`. Cubre: R20, R21.

## Limpieza de duplicados (test de migración)

- [x] T11 — `tests/clients-cuit-cleanup.test.ts`: sembrar 2+ filas con el mismo CUIT (id distinto),
  correr la migración 013, verificar que queda 1 fila por CUIT con el `id` menor conservado y que
  el índice `client_cuit_unique` existe y rechaza un insert duplicado. Cubre: R17, R18.

## Escritura DB (upsert transaccional)

- [x] T12 — Crear `src/lib/server/db/clients-import.ts`: `applyClientImport(plan)` en
  `sql.begin`, upsert `ON CONFLICT (cuit) WHERE cuit IS NOT NULL`, `RETURNING (xmax=0) AS
  inserted`, `origen='presupuestos'` solo en insert (no pisa en update), devuelve `ImportResult`
  (incluye `skipped`, `invalid`, `ignoredColumns` del plan). Cubre: R10, R11, R12.
- [x] T13 — `tests/clients-import-upsert.test.ts` (test DB/transacción, no mock): CUIT nuevo crea
  con `origen='presupuestos'`; CUIT existente actualiza sin pisar `origen`; reimport mismo set→0
  duplicados; dos filas mismo CUIT→1 cliente; error a mitad→rollback total (count sin cambios).
  Cubre: R10, R11, R12, R15, R16.

## Endpoint API

- [x] T14 — Crear `src/routes/api/crm/clients/import/+server.ts` (`POST`, multipart,
  `requireAdminApi`, `detectFormat`→parse (CSV texto / xlsx `Buffer.from(arrayBuffer)`)→
  `planClientImport(rows, headers)`→`applyClientImport`, `apiSuccess(result)`;
  `UnsupportedFormatError`→415; falta archivo→400). Cubre: R2, R3, R4, R13.
- [x] T15 — `tests/api/clients-import.test.ts`: sin sesión 401; `tecnico` 403; `cliente` 403; en
  401/403 no se invoca parse/upsert; formato no soportado→415 sin escritura; admin con CSV
  válido→200 con reporte `{total,created,updated,skipped,invalid,ignoredColumns}`. Cubre: R2, R4,
  R13.

## Plantilla + UI en CRM

- [x] T16 — Crear `static/plantillas/clientes-import-template.csv` con encabezados canónicos
  exactos (`razon_social,cuit,direccion,cp,provincia,telefono,email`) y 1-2 filas de ejemplo
  válidas (CUIT con guiones). Cubre: R19, R20.
- [x] T17 — Modificar `src/routes/(app)/crm/+page.svelte`: botón **Importar clientes** visible
  solo si `user.role==='admin'`, panel con `<input type="file" accept=".csv,.xlsx">`, enlace de
  descarga `<a href="/plantillas/clientes-import-template.csv" download>`, `fetch` multipart al
  endpoint, render del reporte (contadores + errores por fila + columnas ignoradas). Ajustar
  `+page.server.ts` solo si hace falta exponer un flag admin. Cubre: R1, R14, R19, R5.ter.
- [x] T18 — `e2e/import-clientes.spec.ts`: admin ve la acción en CRM y el enlace de plantilla, sube
  un CSV de prueba, ve el reporte con creados/actualizados/omitidos/inválidos. Cubre: R1, R14, R19.

## Cierre

- [x] T19 — Completar mapa de trazabilidad `R1..R21 (incl. R5.bis/R5.ter/R9.bis) ↔ test` en
  `progress/impl_21_import_clientes.md`; `./init.sh`, `pnpm run check`, `pnpm run build`,
  `pnpm test` verdes. Cubre: todas.
