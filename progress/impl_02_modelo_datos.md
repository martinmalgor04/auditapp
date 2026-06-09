# Implementación — 02_modelo_datos (#2)

**Fecha:** 2026-06-08  
**Agente:** implementer  
**Estado:** listo para reviewer (no marcar `done` hasta aprobación)

## Resumen

Schema Postgres completo (`migrations/001_schema.sql`), runner de migraciones, validadores Zod para 12 `field_type`, máquina de estados `audit.status`, seed idempotente (usuarios argon2id, 3 plantillas activas, clientes CSV) y suite de tests de integración DB.

## Entregables

| Área | Archivos |
|---|---|
| DDL | `migrations/001_schema.sql` |
| Runner | `src/lib/server/db/migrate.ts`, scripts `db:migrate`, `db:seed`, `db:reset` |
| Dominio | `field-schemas.ts`, `audit-status.ts` |
| Seed | `src/lib/server/db/seed/{users,templates,clients,index}.ts` |
| Fixtures | `seed/templates/{manifest,it-v2,erp-tango-v2,erp-estandar-v1}.json` |
| Tests | `tests/{schema,migrate,field-type-schemas,audit-status,seed}.test.ts`, `tests/helpers/db.ts` |

## Notas de implementación

- Plantillas generadas desde `scripts/generate-template-fixtures.ts` (SPEC-04 no disponible en repo; estructura CIS/NIST representativa con todos los `field_type` y rúbrica 0/50/100).
- CSV `clientes-presupuestossys.csv`: **1895 registros** válidos (multilínea en campo `email`); el conteo ~1905 del PRD incluye líneas físicas, no registros lógicos.
- Tests DB requieren Postgres (`pnpm run db:up`); `tests/global-setup.ts` aplica migraciones antes de la suite.
- Dependencias añadidas: `@node-rs/argon2`, `csv-parse`, `tsx`.

## Trazabilidad

- R1 → `tests/schema.test.ts > creates template definition tables with expected columns`
- R2 → `tests/schema.test.ts > client table has extended market columns`
- R3 → `tests/schema.test.ts > creates audit instance tables with uniqueness constraints`
- R4 → `tests/schema.test.ts > creates auth tables app_user and session`
- R5 → `tests/schema.test.ts > rejects invalid field_type` + `accepts all 12 field_types`; `tests/field-type-schemas.test.ts`
- R6 → `tests/schema.test.ts > enforces template domain check constraints`
- R7 → `tests/schema.test.ts > options jsonb shapes per field_type`; `tests/field-type-schemas.test.ts > validates options fixtures for each type`
- R8 → `tests/field-type-schemas.test.ts > upserts valid value per field_type`; `rejects incompatible value shape`
- R9 → `tests/audit-status.test.ts` (3 tests)
- R10 → `tests/schema.test.ts > audit table has combo fields and unique public_token`
- R11 → `tests/schema.test.ts > closure and section score columns match spec`
- R12 → `tests/schema.test.ts > creates required performance indexes`
- R13 → `tests/schema.test.ts > attachment r2_key is unique`
- R14 → `tests/migrate.test.ts` (order + idempotencia)
- R15 → `tests/seed.test.ts > seeds one admin and two tecnicos`
- R16 → `tests/seed.test.ts > seeds three active templates`; `template item count matches fixture manifest`
- R17 → `tests/seed.test.ts > scoring items have rubric in options`; `score_map values use 0 50 or 100 scale`
- R18 → `tests/seed.test.ts > imports clients from csv count`; `maps csv columns to client fields`
- R19 → `tests/seed.test.ts > seed is idempotent on second run`
- R20 → `./init.sh` exit 0 + `pnpm test` (38 tests)

## Verificación

```bash
pnpm run db:up          # Postgres local
pnpm run db:migrate     # aplica 001_schema
pnpm run db:seed        # usuarios + plantillas + clientes
pnpm test               # 38 passed
./init.sh               # verde
```
