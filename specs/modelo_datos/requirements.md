# Requirements — modelo_datos

> Schema Postgres completo, constraints, seed inicial y tests de integridad.
> Depende de `stack_scaffolding` (#1) para postgres.js, vitest y carpeta `migrations/`.
> Fuentes: `docs/source-specs/specs-07/07a-modelo-datos/spec.md`, `docs/source-specs/prds/auditapp-07a-modelo-datos.prd.md`.

## R1 — Tablas de definición de plantillas

El sistema DEBE crear las tablas `template`, `section` y `template_item` con PK `uuid` (`gen_random_uuid()`), timestamps `timestamptz` y FK `section.template_id → template.id`, `template_item.section_id → section.id`.

**Verificación:** `tests/schema.test.ts > creates template definition tables with expected columns`.

## R2 — Tabla client extendida

El sistema DEBE crear la tabla `client` con columnas: `id`, `razon_social`, `cuit`, `rubro`, `empleados`, `puestos`, `sedes`, `referente_nombre`, `referente_cargo`, `referente_contacto`, `erp_actual`, `proveedor_correo`, `soporte_it_actual`, `direccion`, `cp`, `provincia`, `telefono`, `email`, `created_at`, `updated_at`.

**Verificación:** `tests/schema.test.ts > client table has extended market columns`.

## R3 — Tablas de instancia de auditoría

El sistema DEBE crear las tablas `audit`, `audit_response`, `audit_section_score`, `audit_closure` y `attachment` con las FK documentadas en el design y `UNIQUE (audit_id, item_id)` en `audit_response`, `UNIQUE (audit_id, section_id)` en `audit_section_score`, `audit_closure.audit_id` como PK/FK 1:1.

**Verificación:** `tests/schema.test.ts > creates audit instance tables with uniqueness constraints`.

## R4 — Tablas de autenticación

El sistema DEBE crear las tablas `app_user` (`email` UNIQUE, `role` admin|tecnico, `password_hash`, `active`) y `session` (`id` text PK, `user_id` FK, `expires_at`).

**Verificación:** `tests/schema.test.ts > creates auth tables app_user and session`.

## R5 — Constraint de los 12 field_type

El sistema DEBE restringir `template_item.field_type` a exactamente: `text`, `number`, `bool`, `tri`, `select`, `multiselect`, `date`, `datetime`, `list`, `table`, `file_ref`, `money`.

**Verificación:** `tests/schema.test.ts > rejects invalid field_type`; `tests/schema.test.ts > accepts all 12 field_types`.

## R6 — Constraints de dominio en plantillas

El sistema DEBE restringir: `template.status` ∈ `{draft, active, archived}`; `section.weight` ∈ `{bajo, medio, alto, muy_alto}`; `template_item.filled_by` ∈ `{admin, cliente, tecnico}`; `template_item.method` ⊆ `{O, E, C, X}`; `template_item.scores` boolean default `true`; `template_item.item_weight` numeric default `1` ≥ 0.

**Verificación:** `tests/schema.test.ts > enforces template domain check constraints`.

## R7 — Esquemas JSONB de options por field_type

El sistema DEBE documentar y validar en tests el esquema JSONB de `template_item.options` según `field_type` (ver design § JSONB). Ítems `select`/`multiselect` DEBEN incluir `choices`; ítems `table` DEBEN incluir `columns`; ítems con scoring DEBEN incluir rúbrica en `options` (`score_map`, `thresholds` o `eol_rules` según tipo).

**Verificación:** `tests/schema.test.ts > options jsonb shapes per field_type`; `tests/field-type-schemas.test.ts > validates options fixtures for each type`.

## R8 — Esquema JSONB de audit_response.value

El sistema DEBE aceptar en `audit_response.value` únicamente formas JSON compatibles con el `field_type` del `template_item` referenciado (ver design § JSONB value).

**Verificación:** `tests/field-type-schemas.test.ts > upserts valid value per field_type`; `tests/field-type-schemas.test.ts > rejects incompatible value shape`.

## R9 — Máquina de estados audit.status

El sistema DEBE restringir `audit.status` a: `borrador`, `briefing_enviado`, `briefing_completo`, `en_relevamiento`, `en_cierre`, `cerrada`. Las transiciones válidas DEBEN documentarse en design § Estado y validarse en tests (transiciones permitidas y rechazo de saltos inválidos a nivel de módulo de dominio stub).

**Verificación:** `tests/audit-status.test.ts > accepts all valid statuses`; `tests/audit-status.test.ts > rejects invalid status value`; `tests/audit-status.test.ts > allows documented transitions and rejects invalid jumps`.

## R10 — Columnas y constraints de audit

El sistema DEBE definir `audit` con: `types text[]`, `template_ids uuid[]`, `segment` ∈ `{A, B, C}`, `public_token` UNIQUE, `assigned_tech_id`/`created_by` FK → `app_user`, `scheduled_at`, `closed_at`, `created_at`. Sin columna `token_expires_at` (invalidación por `status`, no por tiempo).

**Verificación:** `tests/schema.test.ts > audit table has combo fields and unique public_token`.

## R11 — audit_section_score y audit_closure

El sistema DEBE definir `audit_section_score.score` como entero 0–100 nullable, `score_breakdown jsonb` para aportes por ítem, y `audit_closure` con `indice_it`, `indice_erp` (sin `indice_global`), `top_risks`, `quick_wins`, `upsell_findings`, `next_step`, `closed_by`, `closed_at`.

**Verificación:** `tests/schema.test.ts > closure and section score columns match spec`.

## R12 — Índices de performance

El sistema DEBE crear índices en `audit(status)`, `audit(client_id)` y `audit_response(audit_id)`.

**Verificación:** `tests/schema.test.ts > creates required performance indexes`.

## R13 — Índices y unicidad adicionales

El sistema DEBE crear índice/constraint UNIQUE en `attachment.r2_key` y UNIQUE en `app_user.email`.

**Verificación:** `tests/schema.test.ts > attachment r2_key is unique`.

## R14 — Runner de migraciones

El sistema DEBE incluir un runner que aplique archivos SQL numerados en `migrations/` en orden lexicográfico, registrando versiones aplicadas en tabla `schema_migration`, idempotente ante re-ejecución.

**Verificación:** `tests/migrate.test.ts > applies migrations in order`; `tests/migrate.test.ts > skips already applied migrations`.

## R15 — Seed de usuarios

CUANDO se ejecuta el seed, el sistema DEBE insertar exactamente 1 usuario `admin` y 2 usuarios `tecnico` activos con `password_hash` argon2id (contraseña de dev documentada en `.env.example` o README de seed).

**Verificación:** `tests/seed.test.ts > seeds one admin and two tecnicos`.

## R16 — Seed de plantillas activas

CUANDO se ejecuta el seed, el sistema DEBE cargar 3 plantillas `status=active`: IT v2 (`code=it`), ERP Tango v2 (`code=erp-tango`), ERP Estándar v1 (`code=erp-estandar`), cada una con todas sus secciones e ítems según SPEC-04 (0 ítems faltantes respecto al fixture de referencia).

**Verificación:** `tests/seed.test.ts > seeds three active templates with sections and items`; `tests/seed.test.ts > template item count matches fixture manifest`.

## R17 — Rúbrica de scoring en options

CUANDO se cargan ítems con `scores=true`, el sistema DEBE incluir en `template_item.options` rúbrica determinística con escala de madurez 0/50/100 según `field_type`: `bool`/`tri` reglas fijas; `select` con `score_map`; `number`/`money` con `thresholds`; `table` inventario con `eol_rules`. Ítems informativos (`scores=false`) NO DEBEN exigir rúbrica.

**Verificación:** `tests/seed.test.ts > scoring items have rubric in options`; `tests/seed.test.ts > score_map values use 0 50 or 100 scale`.

## R18 — Seed de clientes desde CSV

CUANDO se ejecuta el seed de clientes, el sistema DEBE importar `seed/clientes-presupuestossys.csv` insertando ~1905 filas en `client`, mapeando `numero_doc→cuit`, `razon_social→razon_social`, preservando `id` del CSV, y columnas disponibles (`direccion`, `cp`, `provincia`, `telefono`, `email`, timestamps); campos sin dato en CSV quedan NULL.

**Verificación:** `tests/seed.test.ts > imports clients from csv count`; `tests/seed.test.ts > maps csv columns to client fields`.

## R19 — Integridad referencial del seed

SI el seed se ejecuta dos veces ENTONCES el sistema DEBE ser idempotente (UPSERT o skip por claves naturales) sin duplicar usuarios, plantillas ni clientes.

**Verificación:** `tests/seed.test.ts > seed is idempotent on second run`.

## R20 — Tests en init.sh

CUANDO se ejecuta `./init.sh`, los tests de schema y seed DEBEN pasar con Postgres de test disponible (`DATABASE_URL` de test).

**Verificación:** `./init.sh` exit 0; `pnpm test` incluye `tests/schema.test.ts`, `tests/seed.test.ts`, `tests/migrate.test.ts`, `tests/field-type-schemas.test.ts`, `tests/audit-status.test.ts`.
