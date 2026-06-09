# Tasks — modelo_datos

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_modelo_datos.md`.

**Prerequisito:** `stack_scaffolding` (#1) en `done`.

## Migraciones DDL

- [ ] T1 — Crear `migrations/001_schema.sql` con tablas `template`, `section`, `template_item`, constraints de dominio y 12 `field_type`. Cubre: **R1, R5, R6**.
- [ ] T2 — En `001_schema.sql`, añadir `client` con columnas extendidas + columnas de import CSV. Cubre: **R2**.
- [ ] T3 — En `001_schema.sql`, añadir `audit`, `audit_response`, `audit_section_score`, `audit_closure`, `attachment` con UNIQUEs y FKs. Cubre: **R3, R10, R11**.
- [ ] T4 — En `001_schema.sql`, añadir `app_user`, `session`, `schema_migration`. Cubre: **R4, R13**.
- [ ] T5 — En `001_schema.sql`, añadir CHECK `audit.status` (6 valores) e índices `audit(status)`, `audit(client_id)`, `audit_response(audit_id)`. Cubre: **R9, R12**.

## Runner y validadores

- [ ] T6 — Implementar `src/lib/server/db/migrate.ts` + script `pnpm run db:migrate`. Cubre: **R14**.
- [ ] T7 — Implementar `src/lib/server/db/field-schemas.ts` con Zod para `options` y `value` de los 12 tipos. Cubre: **R7, R8**.
- [ ] T8 — Implementar `src/lib/server/db/audit-status.ts` con transiciones documentadas. Cubre: **R9**.

## Tests de schema

- [ ] T9 — Crear `tests/helpers/db.ts` (conexión test, migrate, cleanup). Cubre: **R14**.
- [ ] T10 — Crear `tests/schema.test.ts` (tablas, columnas, índices, CHECK). Cubre: **R1–R4, R6, R10–R13**.
- [ ] T11 — Crear `tests/migrate.test.ts` (orden, idempotencia). Cubre: **R14**.
- [ ] T12 — Crear `tests/field-type-schemas.test.ts` (fixtures por tipo, rechazo de shapes inválidas). Cubre: **R5, R7, R8**.
- [ ] T13 — Crear `tests/audit-status.test.ts` (estados válidos, transiciones). Cubre: **R9**.

## Fixtures de plantillas

- [ ] T14 — Crear `seed/templates/manifest.json` con conteos esperados por plantilla (contrato anti-regresión). Cubre: **R16**.
- [ ] T15 — Crear `seed/templates/{it-v2,erp-tango-v2,erp-estandar-v1}.json` desde SPEC-04 / source-specs. Cubre: **R16, R17**.
- [ ] T16 — Verificar que cada ítem `scores=true` incluye rúbrica 0/50/100 en `options`. Cubre: **R17**.

## Seed

- [ ] T17 — Implementar seed de usuarios (1 admin, 2 técnicos, argon2id). Cubre: **R15**.
- [ ] T18 — Implementar `src/lib/server/db/seed/templates.ts` + carga de las 3 plantillas activas. Cubre: **R16, R17**.
- [ ] T19 — Implementar `src/lib/server/db/seed/clients.ts` parser CSV → `client` (~1905 filas, mapeo columnas). Cubre: **R18**.
- [ ] T20 — Implementar `src/lib/server/db/seed/index.ts` + script `pnpm run db:seed` idempotente. Cubre: **R19**.
- [ ] T21 — Documentar contraseñas dev en `.env.example` (comentario). Cubre: **R15**.

## Tests de seed

- [ ] T22 — Crear `tests/seed.test.ts` (conteo usuarios, plantillas, clientes, rúbrica, idempotencia). Cubre: **R15–R19**.

## Verificación final

- [ ] T23 — Ejecutar `pnpm test` (todos los tests DB verdes). Cubre: **R20**.
- [ ] T24 — Ejecutar `./init.sh` exit 0. Cubre: **R20**.
- [ ] T25 — Documentar trazabilidad R→test en `progress/impl_modelo_datos.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → tests/schema.test.ts > creates template definition tables
- R2 → tests/schema.test.ts > client table has extended market columns
- R3 → tests/schema.test.ts > creates audit instance tables
- R4 → tests/schema.test.ts > creates auth tables
- R5 → tests/schema.test.ts + field-type-schemas.test.ts
- R6 → tests/schema.test.ts > enforces template domain check constraints
- R7 → tests/field-type-schemas.test.ts > options jsonb shapes
- R8 → tests/field-type-schemas.test.ts > upserts valid value per field_type
- R9 → tests/audit-status.test.ts
- R10 → tests/schema.test.ts > audit table has combo fields
- R11 → tests/schema.test.ts > closure and section score columns
- R12 → tests/schema.test.ts > creates required performance indexes
- R13 → tests/schema.test.ts > attachment r2_key is unique
- R14 → tests/migrate.test.ts
- R15 → tests/seed.test.ts > seeds one admin and two tecnicos
- R16 → tests/seed.test.ts > seeds three active templates
- R17 → tests/seed.test.ts > scoring items have rubric in options
- R18 → tests/seed.test.ts > imports clients from csv
- R19 → tests/seed.test.ts > seed is idempotent
- R20 → ./init.sh + pnpm test
```
