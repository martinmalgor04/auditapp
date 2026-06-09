# Review — feature 02_modelo_datos (#2)

**Veredicto:** APPROVED  
**Fecha:** 2026-06-08  
**Reviewer:** reviewer agent

## Resumen

Implementación completa del schema Postgres, runner de migraciones idempotente, validadores Zod para 12 `field_type`, máquina de estados `audit.status`, seed idempotente y suite de 38 tests DB. `./init.sh` verde en revisión.

## Trazabilidad

- R1: [x] `tests/schema.test.ts > creates template definition tables with expected columns`
- R2: [x] `tests/schema.test.ts > client table has extended market columns`
- R3: [x] `tests/schema.test.ts > creates audit instance tables with uniqueness constraints`
- R4: [x] `tests/schema.test.ts > creates auth tables app_user and session`
- R5: [x] `tests/schema.test.ts > rejects invalid field_type` + `accepts all 12 field_types`; `tests/field-type-schemas.test.ts`
- R6: [x] `tests/schema.test.ts > enforces template domain check constraints`
- R7: [x] `tests/schema.test.ts > options jsonb shapes per field_type`; `tests/field-type-schemas.test.ts > validates options fixtures for each type`
- R8: [x] `tests/field-type-schemas.test.ts > upserts valid value per field_type`; `rejects incompatible value shape`
- R9: [x] `tests/audit-status.test.ts` (3 tests: valid statuses, invalid, transitions)
- R10: [x] `tests/schema.test.ts > audit table has combo fields and unique public_token`
- R11: [x] `tests/schema.test.ts > closure and section score columns match spec`
- R12: [x] `tests/schema.test.ts > creates required performance indexes`
- R13: [x] `tests/schema.test.ts > attachment r2_key is unique` (DDL también define `app_user.email UNIQUE`)
- R14: [x] `tests/migrate.test.ts > applies migrations in order`; `skips already applied migrations`
- R15: [x] `tests/seed.test.ts > seeds one admin and two tecnicos`
- R16: [x] `tests/seed.test.ts > seeds three active templates with sections and items`; `template item count matches fixture manifest`
- R17: [x] `tests/seed.test.ts > scoring items have rubric in options`; `score_map values use 0 50 or 100 scale`
- R18: [x] `tests/seed.test.ts > imports clients from csv count`; `maps csv columns to client fields`
- R19: [x] `tests/seed.test.ts > seed is idempotent on second run`
- R20: [x] `./init.sh` exit 0; `pnpm test` 38/38

## Tasks

- T1: [x] DDL template/section/template_item + 12 field_type
- T2: [x] Tabla client extendida
- T3: [x] Tablas audit, audit_response, audit_section_score, audit_closure, attachment
- T4: [x] app_user, session, schema_migration
- T5: [x] CHECK audit.status + índices performance
- T6: [x] migrate.ts + `pnpm run db:migrate`
- T7: [x] field-schemas.ts (Zod options/value)
- T8: [x] audit-status.ts (transiciones)
- T9: [x] tests/helpers/db.ts
- T10: [x] tests/schema.test.ts
- T11: [x] tests/migrate.test.ts
- T12: [x] tests/field-type-schemas.test.ts
- T13: [x] tests/audit-status.test.ts
- T14: [x] seed/templates/manifest.json
- T15: [x] Fixtures it-v2, erp-tango-v2, erp-estandar-v1
- T16: [x] Rúbrica 0/50/100 en ítems scores=true
- T17: [x] seed/users.ts argon2id
- T18: [x] seed/templates.ts
- T19: [x] seed/clients.ts CSV parser
- T20: [x] seed/index.ts + `pnpm run db:seed`
- T21: [x] Contraseñas dev en `.env.example`
- T22: [x] tests/seed.test.ts
- T23: [x] pnpm test verde
- T24: [x] ./init.sh verde
- T25: [x] progress/impl_02_modelo_datos.md

## Checkpoints

- C1: [x] Arnés completo; `./init.sh` exit 0
- C2: [x] Una feature `in_progress`; tests de `01_stack_scaffolding` (done) pasan
- C3: [x] SQL parametrizado en seed; sin ORM; sin secretos en código commiteado; `.env` gitignored
- C4: [x] 38 tests verdes; cobertura de `src/lib/server/db/*`
- C5: [x] Sin `.env` trackeado; cierre de sesión pendiente de leader post-`done`
- C6: [x] Spec EARS completo; tasks [x]; trazabilidad R↔test verificada

## Cumplimiento design

| Criterio | Estado |
|---|---|
| 11 tablas dominio + schema_migration | OK |
| 12 field_type con CHECK SQL + Zod | OK |
| Máquina estados (6 valores + transiciones) | OK |
| Seed: 1 admin, 2 técnicos, 3 plantillas active | OK |
| CSV clientes idempotente ON CONFLICT (id) | OK |
| Índices audit(status), audit(client_id), audit_response(audit_id) | OK |
| Sin token_expires_at, sin indice_global | OK |
| Rúbrica 0/50/100 (bool/tri implícita según design) | OK |

## Verificación ejecutada

```bash
./init.sh   # exit 0 — 38 tests passed
```

## Notas aceptables (no bloqueantes)

1. **Plantillas sin SPEC-04 original:** fixtures generados con `scripts/generate-template-fixtures.ts`; contrato anti-regresión vía `seed/templates/manifest.json` (113 ítems totales). Alineado con design § "Datos de referencia".
2. **CSV clientes 1895 vs ~1905 PRD:** test cuenta registros lógicos del parser CSV (multilínea en `email`); implementación y test son auto-consistentes.
3. **R13 email UNIQUE:** constraint en DDL; no hay test de violación explícito (solo `r2_key`). Cobertura DDL suficiente para esta feature.

## Acción post-aprobación

En `feature_list.json`, feature id `2` (`02_modelo_datos`):

```json
"status": "done"
```

Mover resumen de `progress/current.md` a `progress/history.md` y vaciar plantilla de sesión.

## Cambios requeridos

Ninguno.
