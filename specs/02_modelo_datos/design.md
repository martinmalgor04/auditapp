# Design — #2 02_modelo_datos

## Alcance

Schema Postgres 16, migraciones SQL versionadas, runner propio, seed de usuarios/plantillas/clientes y tests de integración DB. **Sin** código de rutas SvelteKit, auth operativa ni motor de scoring (eso es #3 y #8).

| Incluido | Excluido |
|---|---|
| 11 tablas de dominio + `schema_migration` | Login, hooks, guards (#3) |
| 12 `field_type` + JSONB schemas | Render UI de campos (#7) |
| Máquina de estados (valores + validador stub) | Transiciones en rutas reales (#4–#5) |
| Seed admin/técnicos/plantillas/clientes | Deploy Docker/entrypoint (#10) |
| Índices de performance | Presigned R2 (#6) |

**Prerequisito:** feature `01_stack_scaffolding` (#1) completada (`postgres.js`, vitest, `migrations/`).

## Archivos a crear

### Migraciones SQL

| Archivo | Contenido |
|---|---|
| `migrations/001_schema.sql` | DDL completo: tablas, CHECK, UNIQUE, FK, índices |
| `migrations/002_seed_users.sql` | 1 admin + 2 técnicos (hashes argon2id precomputados o placeholder + script TS) |
| `migrations/003_seed_templates.sql` | 3 plantillas activas (puede delegar a `\i` o omitirse si seed TS) |
| `migrations/004_seed_clients.sql` | Opcional si import CSV vía TS en lugar de SQL puro |

> **Decisión:** plantillas y CSV son voluminosos → seed principal en **TypeScript** (`scripts/seed.ts` o `src/lib/server/db/seed/`) invocado por `pnpm run db:seed`, con migraciones SQL solo para DDL + usuarios mínimos si conviene. El runner DDL sigue siendo SQL puro.

### Runner y seed (TypeScript)

| Archivo | Propósito |
|---|---|
| `src/lib/server/db/migrate.ts` | Aplica `migrations/*.sql`, tabla `schema_migration` |
| `src/lib/server/db/seed/index.ts` | Orquesta seed usuarios, plantillas, clientes |
| `src/lib/server/db/seed/templates.ts` | Datos de las 3 plantillas (manifest + ítems) |
| `src/lib/server/db/seed/clients.ts` | Parser `seed/clientes-presupuestossys.csv` |
| `src/lib/server/db/audit-status.ts` | Validador de transiciones `audit.status` |
| `src/lib/server/db/field-schemas.ts` | Tipos Zod para `options` y `value` por `field_type` |

### Datos de referencia

| Archivo | Propósito |
|---|---|
| `seed/clientes-presupuestossys.csv` | Ya existe (~1905 filas + header) |
| `seed/templates/manifest.json` | Conteo esperado de secciones/ítems por plantilla (contrato del test) |
| `seed/templates/it-v2.json` | Estructura exportada de SPEC-04 IT v2 |
| `seed/templates/erp-tango-v2.json` | ERP Tango v2 |
| `seed/templates/erp-estandar-v1.json` | ERP Estándar v1 |

Los JSON de plantillas se generan una vez desde `docs/source-specs/` / SPEC-04 externo; el implementer los commitea como fixtures.

### Tests

| Archivo | Cubre |
|---|---|
| `tests/schema.test.ts` | R1–R4, R6, R10–R13 |
| `tests/migrate.test.ts` | R14 |
| `tests/field-type-schemas.test.ts` | R5, R7, R8 |
| `tests/audit-status.test.ts` | R9 |
| `tests/seed.test.ts` | R15–R19 |
| `tests/helpers/db.ts` | Setup: migrate + truncate + conexión test DB |

### Scripts package.json

| Script | Comando |
|---|---|
| `db:migrate` | Aplica migraciones |
| `db:seed` | Ejecuta seed completo |
| `db:reset` | Drop/recreate schema test (solo dev/test) |

## DDL — Tablas (resumen)

### `template`

```sql
id uuid PK DEFAULT gen_random_uuid()
code text NOT NULL          -- it | erp-tango | erp-estandar
name text NOT NULL
version text NOT NULL
status text NOT NULL CHECK (status IN ('draft','active','archived'))
created_at timestamptz NOT NULL DEFAULT now()
```

### `section`

```sql
id uuid PK
template_id uuid NOT NULL REFERENCES template(id)
code text NOT NULL          -- CAB | A1 | B7 ...
title text NOT NULL
objective text
standard_ref text
weight text NOT NULL CHECK (weight IN ('bajo','medio','alto','muy_alto'))
has_score boolean NOT NULL DEFAULT true
sort_order int NOT NULL
UNIQUE (template_id, code)
```

### `template_item`

```sql
id uuid PK
section_id uuid NOT NULL REFERENCES section(id)
label text NOT NULL
help_text text
method text[] NOT NULL DEFAULT '{}'
field_type text NOT NULL CHECK (field_type IN (...12 valores...))
options jsonb NOT NULL DEFAULT '{}'
is_prefillable boolean NOT NULL DEFAULT false
prefill_source text CHECK (prefill_source IN ('briefing','dns','whois','registro_sys') OR prefill_source IS NULL)
filled_by text NOT NULL CHECK (filled_by IN ('admin','cliente','tecnico'))
allow_na boolean NOT NULL DEFAULT false
required boolean NOT NULL DEFAULT false
scores boolean NOT NULL DEFAULT true
item_weight numeric NOT NULL DEFAULT 1 CHECK (item_weight >= 0)
sort_order int NOT NULL
```

### `client`

```sql
id uuid PK
razon_social text NOT NULL
cuit text
rubro text
empleados int
puestos int
sedes int
referente_nombre text
referente_cargo text
referente_contacto text
erp_actual text
proveedor_correo text
soporte_it_actual text
direccion text
cp text
provincia text
telefono text
email text
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
```

Columnas `direccion`, `cp`, `provincia`, `telefono`, `email` absorben datos del CSV de presupuestos (no estaban en SPEC-07a original pero simplifican import y `market_data`).

### `audit`

```sql
id uuid PK
client_id uuid NOT NULL REFERENCES client(id)
name text NOT NULL
types text[] NOT NULL       -- {it} | {erp-tango} | combo
template_ids uuid[] NOT NULL
segment text NOT NULL CHECK (segment IN ('A','B','C'))
status text NOT NULL CHECK (status IN (...6 estados...))
assigned_tech_id uuid REFERENCES app_user(id)
created_by uuid REFERENCES app_user(id)
scheduled_at timestamptz
public_token text UNIQUE
closed_at timestamptz
created_at timestamptz NOT NULL DEFAULT now()
```

### `audit_response`

```sql
id uuid PK
audit_id uuid NOT NULL REFERENCES audit(id)
item_id uuid NOT NULL REFERENCES template_item(id)
value jsonb NOT NULL DEFAULT 'null'
na boolean NOT NULL DEFAULT false
observations text
source text NOT NULL CHECK (source IN ('admin','cliente','tecnico'))
updated_by uuid REFERENCES app_user(id)
updated_at timestamptz NOT NULL DEFAULT now()
UNIQUE (audit_id, item_id)
```

### `audit_section_score`

```sql
id uuid PK
audit_id uuid NOT NULL REFERENCES audit(id)
section_id uuid NOT NULL REFERENCES section(id)
score int CHECK (score IS NULL OR (score >= 0 AND score <= 100))
score_breakdown jsonb NOT NULL DEFAULT '[]'
observations text
UNIQUE (audit_id, section_id)
```

### `audit_closure`

```sql
audit_id uuid PRIMARY KEY REFERENCES audit(id)
indice_it int CHECK (indice_it IS NULL OR (indice_it >= 0 AND indice_it <= 100))
indice_erp int CHECK (indice_erp IS NULL OR (indice_erp >= 0 AND indice_erp <= 100))
top_risks jsonb NOT NULL DEFAULT '[]'
quick_wins jsonb NOT NULL DEFAULT '[]'
upsell_findings jsonb NOT NULL DEFAULT '[]'
next_step text
closed_by uuid REFERENCES app_user(id)
closed_at timestamptz
```

### `attachment`

```sql
id uuid PK
audit_id uuid NOT NULL REFERENCES audit(id)
item_id uuid REFERENCES template_item(id)
r2_key text NOT NULL UNIQUE
filename text NOT NULL
content_type text NOT NULL
size_bytes bigint NOT NULL CHECK (size_bytes >= 0)
kind text NOT NULL CHECK (kind IN ('photo','export'))
uploaded_by uuid REFERENCES app_user(id)
created_at timestamptz NOT NULL DEFAULT now()
```

### `app_user` / `session`

Según PRD 07a: `email` UNIQUE, `role` CHECK, `password_hash`, `active`; `session.id` text PK.

### `schema_migration`

```sql
version text PRIMARY KEY   -- nombre archivo sin extensión, ej. 001_schema
applied_at timestamptz NOT NULL DEFAULT now()
```

## JSONB — `template_item.options`

Validación con Zod en `field-schemas.ts`; tests con fixtures.

| field_type | Shape mínima de `options` | Rúbrica (si `scores=true`) |
|---|---|---|
| `text` | `{}` o `{ max_length?: number }` | N/A — `scores=false` típico |
| `number` | `{ unit?: string }` | `{ thresholds: [{ min, max, score }] }` scores ∈ {0,50,100} |
| `bool` | `{}` | implícita: true→100, false→0 |
| `tri` | `{}` | implícita: si→100, parcial→50, no→0 |
| `select` | `{ choices: string[] }` | `{ score_map: Record<string, 0\|50\|100> }` |
| `multiselect` | `{ choices: string[] }` | `{ score_map }` o regla documentada |
| `date` / `datetime` | `{}` | informativo |
| `list` | `{ max_items?: number }` | informativo |
| `table` | `{ columns: [{ key, label, type }] }` | `{ eol_rules: { vigente:100, extendido:50, eol:0 } }` para inventario |
| `file_ref` | `{ max_files?: number }` | informativo |
| `money` | `{ currency?: 'ARS' }` | `{ thresholds }` como number |

**Escala 0/50/100:** todo `score_map` y `thresholds[].score` DEBE ser exactamente 0, 50 o 100 (CHECK en Zod + test de seed).

## JSONB — `audit_response.value`

| field_type | Tipo JSON esperado |
|---|---|
| `text` | string |
| `number` / `money` | number |
| `bool` | boolean |
| `tri` | `"si"` \| `"no"` \| `"parcial"` |
| `select` | string (miembro de choices) |
| `multiselect` | string[] |
| `date` | string `YYYY-MM-DD` |
| `datetime` | string ISO 8601 |
| `list` | string[] |
| `table` | object[] (keys = column.key) |
| `file_ref` | string (uuid attachment) o string[] |

## Máquina de estados — `audit.status`

```
borrador → briefing_enviado → briefing_completo → en_relevamiento → en_cierre → cerrada
                ↑ admin puede saltear briefing ────────────────────────────────┘
cerrada → en_cierre (solo admin, reabrir)
```

| Transición | Actor | Notas |
|---|---|---|
| `borrador` → `briefing_enviado` | admin | Genera `public_token` |
| `borrador` → `en_relevamiento` | admin | Saltea briefing |
| `briefing_enviado` → `briefing_completo` | cliente | Completa ítems `filled_by=cliente` |
| `briefing_enviado` → `en_relevamiento` | admin/técnico | Timeout / carga manual |
| `briefing_completo` → `en_relevamiento` | técnico | Inicia relevamiento |
| `en_relevamiento` → `en_cierre` | técnico | Relevamiento completo |
| `en_cierre` → `cerrada` | admin | Confirma cierre; invalida token |
| `cerrada` → `en_cierre` | admin | Reabrir |

Implementación en esta feature:

- CHECK SQL: solo valores válidos.
- `audit-status.ts`: `isValidAuditStatusTransition(from, to, context?)` — usado en tests; las rutas (#4–#8) lo importarán después.
- `public_token` se pone NULL al pasar a `cerrada` (regla documentada; test en #3/#8).

## Seed

### Usuarios (dev)

| Email | Rol | Password dev |
|---|---|---|
| `admin@serviciosysistemas.com.ar` | admin | `changeme-admin` (hash argon2id en seed) |
| `facu@serviciosysistemas.com.ar` | tecnico | `changeme-tech` |
| `simon@serviciosysistemas.com.ar` | tecnico | `changeme-tech` |

Contraseñas solo para entorno dev; documentar en `.env.example` comentario.

### Plantillas

| code | name | version | status |
|---|---|---|---|
| `it` | Auditoría Técnica IT | v2 | active |
| `erp-tango` | Auditoría ERP Tango | v2 | active |
| `erp-estandar` | Auditoría ERP Estándar | v1 | active |

Cabecera `CAB` con `has_score=false`. Sección CAB compartida conceptualmente; en combo IT+ERP la auditoría referencia dos `template_ids` sin duplicar filas CAB (una por plantilla, no merge en DB).

### Clientes CSV

Mapeo `seed/clientes-presupuestossys.csv`:

| CSV | `client` |
|---|---|
| `id` | `id` |
| `razon_social` | `razon_social` |
| `numero_doc` | `cuit` |
| `direccion` | `direccion` |
| `cp` | `cp` |
| `provincia` | `provincia` |
| `telefono` | `telefono` |
| `email` | `email` |
| `created_at` | `created_at` |
| `updated_at` | `updated_at` |
| — | `rubro`, `empleados`, … → NULL |

Import idempotente: `ON CONFLICT (id) DO UPDATE` o skip si existe.

## Firmas

### `src/lib/server/db/migrate.ts`

```typescript
export type MigrationResult = { applied: string[]; skipped: string[] };

/** Lee migrations/*.sql y aplica los no registrados en schema_migration. */
export async function runMigrations(sql: postgres.Sql): Promise<MigrationResult>;
```

### `src/lib/server/db/audit-status.ts`

```typescript
export const AUDIT_STATUSES = [
  'borrador', 'briefing_enviado', 'briefing_completo',
  'en_relevamiento', 'en_cierre', 'cerrada'
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export function isValidAuditStatus(value: string): value is AuditStatus;

export function isValidAuditStatusTransition(
  from: AuditStatus,
  to: AuditStatus,
  opts?: { allowAdminReopen?: boolean; skipBriefing?: boolean }
): boolean;
```

### `src/lib/server/db/field-schemas.ts`

```typescript
export const FIELD_TYPES = [ /* 12 valores */ ] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export function optionsSchemaFor(fieldType: FieldType): z.ZodType;
export function valueSchemaFor(fieldType: FieldType, options?: unknown): z.ZodType;
```

### `src/lib/server/db/seed/index.ts`

```typescript
export async function runSeed(sql: postgres.Sql, opts?: { users?: boolean; templates?: boolean; clients?: boolean }): Promise<void>;
```

## Errores

| Situación | Comportamiento |
|---|---|
| Migración SQL falla | Abortar; no registrar versión; propagar error Postgres |
| Seed duplicado | Idempotente; no error |
| `field_type` inválido en fixture | ZodError en tests de desarrollo |
| Transición de estado inválida | `isValidAuditStatusTransition` → false (tests); rutas futuras → 400 |
| CSV ausente o corrupto | Error explícito `'seed/clientes-presupuestossys.csv not found'` |

## Alternativa descartada: Drizzle/Prisma migrations

**Descartado:** ORM con codegen de migraciones.

**Motivo:** `docs/architecture.md` exige SQL puro + postgres.js. El runner propio mantiene control total del DDL y es coherente con deploy (#10).

## Alternativa descartada: token_expires_at

**Descartado:** columna `audit.token_expires_at` (presente en SPEC-07a histórico).

**Motivo:** PRD 07a resuelve invalidación por `status` (`cerrada` anula token). Menos columnas, misma seguridad operativa.

## Alternativa descartada: indice_global en audit_closure

**Descartado:** `audit_closure.indice_global`.

**Motivo:** IT y ERP son índices independientes en auditorías combo; el JSON canónico (#9) expone ambos por separado.

## Alternativa descartada: client mínimo (solo razón social/CUIT)

**Descartado:** tabla `client` con 4 columnas.

**Motivo:** PRD 07a — columnas de cabecera fijas alimentan estudio de mercado y listado backoffice; el CSV aporta contacto/ubicación.

## Notas para implementer

- Usar transacciones en seed; tests con DB dedicada (`DATABASE_URL` test) o schema aislado.
- Los tests de schema NO mockean postgres.js (ver `docs/verification.md` nivel 2).
- Peso de sección → factor numérico (`bajo=1, medio=2, alto=3, muy_alto=5`) se documenta aquí para #8; no requiere columna extra.
- `progress/impl_02_modelo_datos.md` debe listar trazabilidad R→test al cerrar.
