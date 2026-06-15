# Sesión actual

## Feature en curso: #22 22_cab_contacto_cliente

**Estado:** in_progress — T1–T19 completas. A la espera del reviewer (no se marca done aquí).

### Verificación final
- `pnpm run check` → 0 errores (25 warnings preexistentes).
- `pnpm run build` → OK.
- `pnpm test` → 156 files / 715 tests OK, 2 skip preexistentes.
- `./init.sh` → sec. 1/2/4 OK; sec. 3 FAIL **preexistente** (2 features in_progress: #12 y #21,
  ambas ya in_progress en HEAD antes de esta sesión). No toqué el status de #12 (fuera de alcance).
- Trazabilidad R1–R21 en `progress/impl_21_import_clientes.md`.

### Plan de tasks (specs/21_import_clientes/tasks.md)
- T1: detectar/limpiar duplicados CUIT en DB seedeada antes del índice (R17,R18)
- T2: pnpm add node-xlsx (R3)
- T3: migrations/013_client_cuit_index.sql — merge dup + índice único parcial (R10,R15,R16,R17,R18)
- T4: src/lib/server/clients/schema.ts — Zod + normalizeCuit (R7,R8,R9)
- T5: src/lib/server/clients/errors.ts — UnsupportedFormatError (R4)
- T6: src/lib/server/clients/parse.ts — parseCsv/parseXlsx/detectFormat (R3,R4,R5)
- T7: src/lib/server/clients/normalize.ts — CANONICAL_FIELDS/HEADER_ALIASES/normalizeRow/inspectHeaders (R5,R5.bis,R5.ter,R6,R7)
- T8: src/lib/server/clients/import.ts — planClientImport (R5.ter,R8,R9,R9.bis,R13,R16)
- T9: tests/clients-import-parse.test.ts (R3,R5,R5.bis,R5.ter,R6,R7)
- T10: tests/clients-import-validate.test.ts (R8,R9,R9.bis,R13)
- T10.bis: tests/clients-import-template.test.ts (R20,R21)
- T11: tests/clients-cuit-cleanup.test.ts (R17,R18)
- T12: src/lib/server/db/clients-import.ts — applyClientImport (R10,R11,R12)
- T13: tests/clients-import-upsert.test.ts (R10,R11,R12,R15,R16)
- T14: src/routes/api/crm/clients/import/+server.ts (R2,R3,R4,R13)
- T15: tests/api/clients-import.test.ts (R2,R4,R13)
- T16: static/plantillas/clientes-import-template.csv (R19,R20)
- T17: src/routes/(app)/crm/+page.svelte + page.server.ts (R1,R14,R19,R5.ter)
- T18: e2e/import-clientes.spec.ts (R1,R14,R19)
- T19: trazabilidad + gate verde

### T1 — hallazgos (DB seedeada real)
- Seed real `seed/clientes-presupuestossys.csv` = 1895 filas, **0 CUIT duplicados** (raw ni normalizados).
- Los duplicados de CUIT en la DB dev (`30-99999999-1` x15, `30-99887766-5` x14) son **basura de fixtures de test**
  (`Mercado Seed SA Identificable`, `Bundle Fixture SA`), no del seed. Ninguno referenciado por audit/crm_lead.
- PK de `client` es uuid (gen_random_uuid), no entero. "id menor" = orden lexicográfico de uuid (determinístico).
- FKs hacia client.id: `audit.client_id` (NOT NULL), `crm_lead.client_id` (nullable). La migración repunta ambas
  al id conservado ANTES del DELETE, dentro de la misma transacción (runner envuelve cada migración en sql.begin).
- CUIT en datos existentes está crudo (con guiones en 30 filas, 11 dígitos en 1368). El índice es sobre `cuit` crudo;
  el import persiste CUIT normalizado a dígitos (R7) — comportamiento per spec, sin tocar filas existentes.
