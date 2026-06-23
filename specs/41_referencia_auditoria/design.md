# Design — #41 41_referencia_auditoria

> Código humano único e inmutable por auditoría; guard anti-duplicado al crear; un solo tipo
> en altas nuevas. Sin cambio de PK ni rutas.

## Formato del código

```
ref_code = <empresa.codigo>-<TIPO>-<NNNN>
```

| Componente | Origen | Ejemplo |
|---|---|---|
| `<empresa.codigo>` | Columna `empresa.codigo` (R1–R3) | `ISX` |
| `<TIPO>` | Token de `TYPE_REF_TOKEN[audit_type]` (R6) | `ERP` |
| `<NNNN>` | Correlativo por `(empresa_id, audit_type)` (R7) | `0002` |

Ejemplos reales del incidente resuelto: `ISX-ERP-0001`, `ISX-ERP-0002`, `ISX-IT-0001`.

### Mapeo tipo → token (R6)

Constante exportada en `src/lib/audit-types.ts`:

```typescript
export const TYPE_REF_TOKEN: Record<AuditType, 'IT' | 'ERP' | 'ERPE'> = {
  it: 'IT',
  'erp-tango': 'ERP',
  'erp-estandar': 'ERPE'
};
```

Etiqueta UI existente (`AUDIT_TYPE_LABELS`) se mantiene; el token es independiente y más corto
para comunicación oral/escrita.

## Cambios de schema — `migrations/022_audit_ref_code.sql`

### `empresa.codigo`

```sql
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS codigo text;
-- backfill (R10) + UNIQUE + NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS empresa_codigo_unique ON empresa (codigo);
```

### `audit.ref_code`

```sql
ALTER TABLE audit ADD COLUMN IF NOT EXISTS ref_code text;
-- backfill (R11–R12) + UNIQUE + NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS audit_ref_code_unique ON audit (ref_code);
```

### `audit_ref_counter` (secuencia atómica, R8, R13)

```sql
CREATE TABLE IF NOT EXISTS audit_ref_counter (
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  audit_type text NOT NULL CHECK (audit_type IN ('it', 'erp-tango', 'erp-estandar')),
  last_seq int NOT NULL CHECK (last_seq >= 1),
  PRIMARY KEY (empresa_id, audit_type)
);
```

Asignación en `createAudit` (misma transacción del INSERT):

```sql
INSERT INTO audit_ref_counter (empresa_id, audit_type, last_seq)
VALUES ($empresaId, $auditType, 1)
ON CONFLICT (empresa_id, audit_type)
DO UPDATE SET last_seq = audit_ref_counter.last_seq + 1
RETURNING last_seq;
```

El `ON CONFLICT … DO UPDATE` toma lock de fila → seguro bajo concurrencia (R8). El
`ref_code` se compone en TypeScript con `TYPE_REF_TOKEN` + `lpad(seq, 4, '0')`.

**Alternativa descartada — secuencias Postgres por par (empresa, tipo):** inmanejable con
~2000 empresas × 3 tipos (miles de objetos `SEQUENCE`, DDL en cada alta de empresa).
**Alternativa descartada — `MAX(ref_code)+1` sin lock:** race condition bajo concurrencia.

### Inmutabilidad (R3, R9)

Trigger `BEFORE UPDATE` en `empresa` y `audit`:

```sql
-- Rechaza cambio de codigo / ref_code salvo que OLD = NEW (no-op)
IF OLD.codigo IS DISTINCT FROM NEW.codigo THEN RAISE EXCEPTION ...
IF OLD.ref_code IS DISTINCT FROM NEW.ref_code THEN RAISE EXCEPTION ...
```

Defensa en profundidad además de no exponer estos campos en schemas de update.

## Generación de `empresa.codigo` (R1, R2)

Función pura `buildEmpresaCode(razonSocial: string): string` en
`src/lib/server/clients/normalize.ts`:

1. `normalizeForMatch` (ya existe): mayúsculas, sin acentos, espacios colapsados.
2. Tokenizar por espacio; descartar stopwords societarias/conectores (lista en requirements R1).
3. Inicial de cada token significativo; si resultado < 3 chars, completar con letras del primer
   token significativo.
4. Recortar a **5 caracteres** máximo (legible en mobile y en presupuesto).

Resolución de colisión en runtime (`ensureEmpresaCodigo(tx, empresaId, razonSocial)`):

```typescript
let base = buildEmpresaCode(razonSocial);
for (let n = 0; ; n++) {
  const candidate = n === 0 ? base : `${base}${n + 1}`; // ISX, ISX2, ISX3
  const [exists] = await tx`SELECT 1 FROM empresa WHERE codigo = ${candidate} AND id <> ${empresaId}`;
  if (!exists) return candidate;
}
```

**Puntos de generación:**
- `createAudit` al INSERT de empresa nueva (ya en tx).
- `createAudit` al usar empresa existente **sin** `codigo` (edge post-migración).
- Import CSV/Excel (`src/lib/server/clients/import.ts`) en el upsert de empresa.

**NO** regenerar al editar ficha CRM (`updateEmpresa` no incluye `codigo`).

## Backfill en migración (R10–R13)

Idempotente (`IF NOT EXISTS`, `WHERE ref_code IS NULL`). Orden:

1. **`empresa.codigo`:** función SQL `build_empresa_code(razon_social)` que replica la lógica TS;
   ventana `ROW_NUMBER() OVER (PARTITION BY base_code ORDER BY created_at, id)` para sufijos
   `base`, `base2`, `base3`…
2. **`audit.ref_code`:** CTE `lead_type` con CASE idéntico al backfill design (R12):

   ```sql
   CASE WHEN 'it' = ANY(types) THEN 'it'
        WHEN 'erp-tango' = ANY(types) THEN 'erp-tango'
        ELSE 'erp-estandar' END
   ```

   Correlativo: `row_number() OVER (PARTITION BY empresa_id, lead_type ORDER BY created_at, id)`.
   Componer con `empresa.codigo || '-' || token || '-' || lpad(n::text, 4, '0')`.
3. **`audit_ref_counter`:** `INSERT … SELECT empresa_id, audit_type, max(n) FROM backfill GROUP BY 1,2 ON CONFLICT DO UPDATE SET last_seq = GREATEST(...)`.
4. `ALTER COLUMN SET NOT NULL` + índices UNIQUE + triggers de inmutabilidad.

Casos de prueba obligatorios en migración:
- INGENIERIA SIGLO XXI → `ISX`
- Dos empresas distintas con mismas iniciales → sufijo numérico
- Dos ERP de la misma empresa → `…-ERP-0001`, `…-ERP-0002`
- Legacy `types = ['it','erp-tango']` → ref con token `IT` (tipo líder)

## Un solo tipo en altas nuevas (R14, R15)

| Cambio | Detalle |
|---|---|
| `createAuditSchema` | `types: z.array(auditTypeSchema).length(1, 'Seleccioná un solo tipo')` |
| `new/+page.svelte` | Checkboxes → **radio** (`AuditTypeRadio` o adaptar `audit-type-checkboxes` con prop `single`); un técnico asignado |
| `techByType` | Sigue siendo `Record<AuditType, uuid>` pero solo una clave activa |
| `updateAuditSchema` | **Sin cambio** — edición de tipos legacy permitida (fuera de alcance restringir update) |
| Lecturas | `getAuditById`, form, scoring: sin cambio para `types[]` multi-valor |

## Guard anti-duplicado (R21–R24)

```typescript
export type ActiveAuditConflict = {
  id: string;
  refCode: string;
  status: AuditStatus;
  encargada: string | null; // assigned tech name
};

export async function findActiveSameTypeAudits(
  empresaId: string,
  auditType: AuditType
): Promise<ActiveAuditConflict[]>
```

Query:

```sql
SELECT a.id, a.ref_code, a.status, u.name AS encargada
FROM audit a
LEFT JOIN app_user u ON u.id = a.assigned_tech_id
WHERE a.empresa_id = $1
  AND a.archived_at IS NULL
  AND a.status <> 'cerrada'
  AND $2 = ANY(a.types)
ORDER BY a.created_at ASC
```

Flujo en `createAudit`:

```
parsed = createAuditSchema
if conflicts = findActiveSameTypeAudits(...) AND !parsed.confirmDuplicate
  throw DuplicateAuditWarning({ conflicts })
-- else: tx normal con ref_code
```

Nuevo error en `src/lib/server/backoffice/errors.ts`:

```typescript
export class DuplicateAuditWarning extends Error {
  readonly code = 'DUPLICATE_AUDIT_WARNING';
  readonly status = 409;
  constructor(public conflicts: ActiveAuditConflict[]) { ... }
}
```

Action `auditorias/new/+page.server.ts`:

```typescript
catch (e) {
  if (e instanceof DuplicateAuditWarning)
    return fail(409, { duplicateWarning: true, conflicts: e.conflicts, ...formState });
  return failFromError(e);
}
```

UI: panel de aviso con tabla de conflictos + botón **Crear igualmente** que reenvía el form con
`<input type="hidden" name="confirmDuplicate" value="true" />`.

**Estados "activos" para el guard:** cualquier status excepto `cerrada`, siempre que
`archived_at IS NULL`. Una auditoría archivada o cerrada no bloquea una nueva del mismo tipo.

## Archivos a crear / modificar

| Archivo | Cambio |
|---|---|
| `migrations/022_audit_ref_code.sql` | Columnas, contador, backfill, triggers, NOT NULL+UNIQUE |
| `src/lib/audit-types.ts` | `TYPE_REF_TOKEN`, helper `refTokenForType(type)` |
| `src/lib/server/clients/normalize.ts` | `buildEmpresaCode`, `formatRefCode(codigo, type, seq)` |
| `src/lib/server/clients/import.ts` | Generar `codigo` en upsert de empresa |
| `src/lib/server/backoffice/audits.ts` | `ensureEmpresaCodigo`, `allocateRefCode`, `findActiveSameTypeAudits`; campos `refCode`/`codigo` en tipos de lectura; guard en `createAudit` |
| `src/lib/server/backoffice/errors.ts` | `DuplicateAuditWarning` |
| `src/lib/server/backoffice/schemas.ts` | `types.length(1)`, `confirmDuplicate: z.coerce.boolean().optional()` |
| `src/lib/server/backoffice/form-parsers.ts` | Parsear `confirmDuplicate` |
| `src/lib/server/backoffice/dashboard.ts` | SELECT `a.ref_code`; extender `DashboardAuditRow` |
| `src/lib/backoffice/dashboard-types.ts` | Campo `refCode: string` |
| `src/routes/(app)/auditorias/new/+page.svelte` | Radio tipo único; UI aviso duplicado |
| `src/routes/(app)/auditorias/new/+page.server.ts` | Mapeo 409 |
| `src/lib/components/backoffice/audit-table.svelte` | Columna/fila con `refCode` + badge tipo |
| `src/lib/components/backoffice/audit-card-list.svelte` | Idem mobile |
| `src/routes/(app)/auditorias/[id]/+page.svelte` | `ref_code` en cabecera (debajo del título) |
| `src/routes/(app)/auditorias/[id]/cierre/+page.svelte` | `ref_code` en metadatos |
| `src/lib/informe/render-shared.ts` (+ model builder) | Campo `refCode` en modelo de render |
| Render ERP/IT/mixto + web | Mostrar `refCode` en portada o bloque metadatos |
| `src/lib/server/psys/schemas.ts` | `source.ref_code: z.string().min(1)`; bump `PSYS_CONTRACT_VERSION` → `'1.1'` |
| `src/lib/server/psys/payload.ts` | Incluir `ref_code` en `source` |
| `src/lib/server/briefing/load-form.ts` + `briefing-header.svelte` | Exponer y mostrar `refCode` |
| `src/lib/server/backoffice/audits.ts` → `AuditDetail` | Campo `refCode` |

## Contrato presupuestossys (R19)

Extensión **v1.1** del payload M2M (#16):

```jsonc
"source": {
  "system": "auditapp",
  "audit_id": "<uuid>",
  "report_version": 2,
  "ref_code": "ISX-ERP-0002"   // nuevo, obligatorio en v1.1
}
```

Coordinar feature espejo en presupuestossys (campo opcional en v1.0, obligatorio en v1.1).
Auditapp envía v1.1; si psys aún en v1.0, el campo extra se ignora (forward-compatible).

## Errores

| Error | HTTP | Cuándo |
|---|---|---|
| `DuplicateAuditWarning` | 409 | Conflicto activo mismo tipo sin `confirmDuplicate` |
| `ValidationError` | 400 | `types.length !== 1`, datos inválidos |
| Trigger immutability | 500 (logged) | Intento de UPDATE a `codigo`/`ref_code` |

Reutiliza `ForbiddenError`, `AuditNotFoundError` sin cambios.

## Fuera de alcance (documentado)

- Búsqueda del tablero por `ref_code` (solo razón social hoy; mejora futura).
- Export/import bundle (#20): preservar `ref_code` en bundle es deseable pero no está en
  acceptance; post-implementación manual si hace falta.
- Sobrescritura concurrente de campos de tabla (inventario) — incidente distinto (R22 implícito
  en feature_list como no-objetivo).
- Renumerar o reordenar correlativos al archivar auditorías (los huecos son aceptables).
- Forzar división de auditorías legacy multi-tipo (#32 descartada).

## Trazabilidad de tests (mapa R ↔ archivo)

| R | Test principal |
|---|---|
| R1–R2 | `tests/clients/empresa-code.test.ts` |
| R3, R9 | `tests/backoffice/ref-immutability.test.ts` |
| R4–R7, R10–R13 | `tests/migrations/audit_ref_code.test.ts` |
| R8 | `tests/backoffice/audit-ref-concurrency.test.ts` |
| R14–R15 | `tests/backoffice/single-type.test.ts` |
| R16 | `tests/backoffice/dashboard-ref.test.ts` |
| R17 | `tests/routes/audit-detail-ref.test.ts` |
| R18 | `tests/informe/ref-code-render.test.ts` |
| R19 | `tests/psys/payload-ref.test.ts` |
| R20 | `tests/briefing/ref-code.test.ts` |
| R21–R24 | `tests/backoffice/duplicate-guard.test.ts` |
| R25 | `tests/backoffice/routes-still-uuid.test.ts` (smoke: hrefs usan id) |

Mapa completo en `progress/impl_41_referencia_auditoria.md` al implementar.
