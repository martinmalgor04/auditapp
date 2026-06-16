# Design — #23 23_crm_empresa_unificada

> CÓMO. Decisiones técnicas para fusionar `client` + `crm_lead` en `empresa`, preservando las FK
> de `audit`, con estado híbrido y un cockpit `/crm`. Lee `requirements.md` primero.

---

## 1. Estrategia de migración (decisión central)

### Alternativas evaluadas

| Opción | Qué hace | FK `audit.client_id` | Riesgo |
|---|---|---|---|
| **A — Rename + fold (elegida)** | `ALTER TABLE client RENAME TO empresa`; renombrar `client_id`→`empresa_id` en `audit` y demás FK; **foldear** `crm_lead` dentro de `empresa` con INSERTs deduplicados | **Se preserva intacta** (mismos uuid, mismo FK, solo cambia el nombre de la columna referenciada) | **Bajo** |
| B — Tabla nueva + remap | `CREATE TABLE empresa`; copiar `client` y `crm_lead`; reescribir `audit.client_id` a los nuevos uuid | Hay que **remapear** todas las FK a uuid nuevos; ventana de inconsistencia; mapa client→empresa grande (~2000) | Alto |

**Elegida: Opción A (rename + fold).** Razón: `client` ya es un proto-registro unificado (la
migración 005 le agregó `origen`, `nivel_interes`, `observaciones`, `pagina`, `relevado_at` y los
campos Tango). Renombrarlo preserva **cada uuid** y por tanto **cada FK de `audit`** sin tocar una
sola fila de `audit` ni remapear nada. `crm_lead` se foldea encima con INSERT deduplicado. Es el
camino de menor riesgo y satisface R10/R11 casi por construcción.

### Pasos de la migración `015_empresa_unificada.sql` (SQL conceptual)

El runner envuelve el archivo en `sql.begin` → todo es atómico. Idempotente vía guards `IF [NOT]
EXISTS` y `WHERE NOT EXISTS`.

```sql
-- Paso 1: renombrar client → empresa (preserva uuid y FK audit.client_id, crm_lead.client_id).
ALTER TABLE IF EXISTS client RENAME TO empresa;
ALTER INDEX IF EXISTS client_cuit_unique RENAME TO empresa_cuit_unique;

-- Paso 2: columnas nuevas de la entidad unificada (idempotente).
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS relacion text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS tiene_software text;   -- prospecto (crm_lead/csv)
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS fuente text;           -- prospecto (csv 'fuente')
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS estado_override text;
-- nivel_interes, observaciones, pagina, relevado_at YA existen (migr. 005).

-- Paso 3: backfill de relacion según origen actual (determinístico) — CARGA HISTÓRICA (R32).
--   Esto es la migración inicial de datos, NO el import en vivo (que usa selector, R25/R31).
--   origen='presupuestos' | 'tango'  → relacion='cliente'
--   origen='prospecto'               → relacion='prospecto'
--   sin origen pero con audit cerrada con next_step → 'cliente'; resto → 'prospecto'
UPDATE empresa SET relacion = CASE
  WHEN origen IN ('presupuestos','tango') THEN 'cliente'
  WHEN origen = 'prospecto'               THEN 'prospecto'
  ELSE 'prospecto' END
WHERE relacion IS NULL;
ALTER TABLE empresa ALTER COLUMN relacion SET NOT NULL;
ALTER TABLE empresa ADD CONSTRAINT empresa_relacion_check
  CHECK (relacion IN ('cliente','prospecto','ex_cliente'));

-- Paso 4: foldear crm_lead que NO está ya vinculado a un client (client_id IS NULL).
--   Los crm_lead con client_id ya apuntan a una empresa: se fusionan re-puntando (paso 6).
--   Dedup por CUIT: crm_lead no tiene CUIT propio; clave de match = razón social normalizada.
--   norm(s) = lower(regexp_replace(trim(s),'\s+',' ','g'))
INSERT INTO empresa (razon_social, telefono, email, referente_nombre, observaciones, fuente,
                     origen, relacion)
SELECT l.empresa, l.telefono, l.email, l.contacto, l.notas, l.source,
       'prospecto', 'prospecto'
FROM crm_lead l
WHERE l.client_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM empresa e
    WHERE lower(regexp_replace(trim(e.razon_social),'\s+',' ','g'))
        = lower(regexp_replace(trim(l.empresa),'\s+',' ','g'))
  );

-- Paso 5: para cada crm_lead foldeado, mapear lead → empresa por razón social normalizada
--   (tabla temporal lead_to_empresa) para migrar eventos y re-puntar audit_id.
CREATE TEMP TABLE lead_to_empresa ON COMMIT DROP AS
SELECT l.id AS lead_id,
       COALESCE(l.client_id, e.id) AS empresa_id
FROM crm_lead l
LEFT JOIN empresa e
  ON l.client_id IS NULL
 AND lower(regexp_replace(trim(e.razon_social),'\s+',' ','g'))
   = lower(regexp_replace(trim(l.empresa),'\s+',' ','g'));

-- Paso 6: renombrar FK de audit y re-puntar la FK audit_id que vivía en crm_lead.
ALTER TABLE audit RENAME COLUMN client_id TO empresa_id;        -- FK intacta, solo nombre
ALTER INDEX IF EXISTS audit_client_id_idx RENAME TO audit_empresa_id_idx;
-- crm_lead.audit_id ya vincula auditorías de prospecto: no toca audit.empresa_id (ya correcto).

-- Paso 7: tabla de eventos unificada empresa_evento (reemplaza crm_lead_event) + migrar historial.
CREATE TABLE IF NOT EXISTS empresa_evento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('llamada','reunion','nota','cambio_estado','sistema')),
  texto text,
  from_status text,
  to_status text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empresa_evento_empresa_id_idx ON empresa_evento (empresa_id);

INSERT INTO empresa_evento (empresa_id, tipo, from_status, to_status, created_by, created_at)
SELECT m.empresa_id, 'cambio_estado', ev.from_status, ev.to_status, ev.changed_by, ev.created_at
FROM crm_lead_event ev
JOIN lead_to_empresa m ON m.lead_id = ev.lead_id
WHERE m.empresa_id IS NOT NULL;

-- Paso 8: compatibilidad hacia atrás (R30). Vista 'client' apuntando a empresa, para que los
--   módulos aún no reconectados (mercado, audits) sigan leyendo durante el rollout.
CREATE OR REPLACE VIEW client AS SELECT * FROM empresa;

-- crm_lead / crm_lead_event y la vista 'client' NO se borran: por decisión humana (2026-06-16) se
-- conservan como red de rollback/backup. La Fase 6 los DEPRECA documentadamente (legacy/solo
-- lectura) pero NO los dropea; la limpieza física queda como tarea manual futura fuera del
-- alcance de #23.
```

**Nota sobre el índice CUIT (R6):** ya existe `client_cuit_unique` (migr. 013) y se renombra a
`empresa_cuit_unique`. El paso 4 NO inserta CUIT (los prospectos foldeados no tienen), así que no
puede violar el índice. Si en el futuro un fold trajera CUIT, el dedup por CUIT del paso 4 debe
precederlo (mismo patrón `keep min(id)` de migr. 013).

### Dedup de prospectos sin CUIT (R9) — decisión

Clave de fallback = **razón social normalizada** (`lower` + trim + colapso de espacios). Si
coincide con una empresa existente → se fusiona (no inserta, paso 4 `NOT EXISTS`); si no coincide →
fila separada nueva. **No** se descarta ningún prospecto. **Confirmado en la puerta humana
(2026-06-16, decisión 9):** este dedup por razón social normalizada es suficiente; no se pide fuzzy
match adicional.

---

## 2. Esquema final de `empresa`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid PK` | preservado del rename de `client` |
| `razon_social` | `text NOT NULL` | |
| `cuit` | `text` | índice único parcial `empresa_cuit_unique WHERE cuit IS NOT NULL` |
| `relacion` | `text NOT NULL` | CHECK `cliente\|prospecto\|ex_cliente` |
| `rubro`, `empleados`, `puestos`, `sedes` | text/int | datos maestros |
| `referente_nombre/cargo/contacto` | text | |
| `erp_actual`, `proveedor_correo`, `soporte_it_actual` | text | |
| `direccion`, `cp`, `provincia`, `telefono`, `email` | text | |
| `origen` | text | CHECK `presupuestos\|tango\|prospecto` (existente) |
| `nivel_interes`, `tiene_software`, `observaciones`, `fuente`, `pagina`, `relevado_at` | text/ts | prospecto |
| `tango_*` (8 columnas) | varios | licencia Tango (existentes, migr. 005) |
| `estado_override` | `text` nullable | CHECK contra el enum de estados derivados |
| `created_at`, `updated_at` | timestamptz | |

Índices: `empresa_cuit_unique` (renombrado), `empresa (relacion)`, `empresa (lower(razon_social))`
para búsqueda/dedup.

Tabla `empresa_evento` (nueva, reemplaza `crm_lead_event`): ver SQL paso 7.

---

## 3. Auto-derivación del estado híbrido

### Estados

`sin_contactar → contactada → auditoria_en_curso → auditada → presupuestada → activa | inactiva`

### Función `deriveEmpresaEstado` (server, `src/lib/server/crm/empresa-estado.ts`)

```typescript
export type EmpresaEstado =
  | 'sin_contactar' | 'contactada' | 'auditoria_en_curso'
  | 'auditada' | 'presupuestada' | 'activa' | 'inactiva';

export type EstadoInputs = {
  relacion: 'cliente' | 'prospecto' | 'ex_cliente';
  hasContactEvent: boolean;       // empresa_evento tipo llamada/reunion/nota
  hasOpenAudit: boolean;          // audit no 'cerrada' ni archivada
  hasClosedAudit: boolean;        // audit status 'cerrada'
  hasPresupuesto: boolean;        // audit_proposal_link (#007) de alguna audit de la empresa
  lastActivityAt: Date | null;    // máx(audit.created_at, evento.created_at)
};

/** R14: reglas determinísticas. Prioridad de mayor avance hacia atrás. */
export function deriveEmpresaEstado(i: EstadoInputs): EmpresaEstado {
  if (i.relacion === 'ex_cliente') return 'inactiva';
  if (i.hasPresupuesto) return 'presupuestada';
  if (i.hasClosedAudit) return 'auditada';
  if (i.hasOpenAudit) return 'auditoria_en_curso';
  if (i.relacion === 'cliente') {
    return withinActivityWindow(i.lastActivityAt) ? 'activa' : 'inactiva';
  }
  if (i.hasContactEvent) return 'contactada';
  return 'sin_contactar';
}

/** R15: override gana cuando está seteado. */
export function effectiveEstado(
  override: EmpresaEstado | null, inputs: EstadoInputs
): { value: EmpresaEstado; source: 'override' | 'derived' } {
  return override
    ? { value: override, source: 'override' }
    : { value: deriveEmpresaEstado(inputs), source: 'derived' };
}
```

`withinActivityWindow`: cliente con actividad en los últimos **N** meses → `activa`, si no →
`inactiva`. **N = 18 meses** confirmado en la puerta humana (2026-06-16, decisión 9; alinea con
`tango_venc_escala`).

La query de inputs (en `src/lib/server/db/empresa.ts`) hace, por empresa:
`LEFT JOIN audit` (estados/closure), `EXISTS empresa_evento` de contacto, `EXISTS audit_proposal_link`
vía las audits de la empresa (presupuesto). Para el listado de ~2000 se computa en **una** query agregada (no N+1), no por fila.

---

## 4. Mapeo de módulos reconectados client → empresa

| Módulo / archivo | Hoy | Tras reconectar |
|---|---|---|
| `src/lib/server/db/clients-import.ts` | `INSERT INTO client` | `INSERT INTO empresa`, `relacion` recibida como parámetro (selector) |
| `src/routes/api/crm/clients/import/+server.ts` | aplica plan a client | aplica a empresa; valida `relacion` (`cliente\|prospecto`) del selector con Zod |
| `src/routes/(app)/crm/import` (UI de import masivo) | n/a | **selector `relacion` (`cliente\|prospecto`)** que aplica a todo el lote (R31) |
| `src/lib/server/clients/{schema,import,normalize}.ts` | set canónico → client | mismo set → empresa |
| `src/lib/server/backoffice/audits.ts` (`createAudit`, `searchClientsForPicker`, `getClientCabFields`, `syncClientFromCab`, `getAuditById`) | `FROM client` / `INSERT INTO client` | `FROM empresa` / `INSERT INTO empresa` |
| `src/lib/server/mercado/queries.ts` (~10 `JOIN client`) | `JOIN client c` | `JOIN empresa c` |
| `src/routes/(app)/crm/{+page.server.ts,+page.svelte}` | `crm_lead` vía `listLeads` | cockpit sobre `empresa` |
| `src/lib/server/db/crm-leads.ts` | crm_lead CRUD | reemplazado por `src/lib/server/db/empresa.ts` |
| `cab-client-map.ts` | tipos `ClientCabFields` | sin cambio de forma; se alimenta de empresa |

Durante el rollout, la **vista `client`** (paso 8) cubre a cualquier lector aún no migrado (R30),
así cada fase es independiente y verificable.

---

## 5. Endpoints y firmas nuevas

- `src/lib/server/db/empresa.ts`:
  `listEmpresas(filters)`, `getEmpresaById(id)`, `updateEmpresa(id, patch)`,
  `searchEmpresasForPicker(q)`, `getEmpresaCabFields(id)`, `setEstadoOverride(id, estado|null, by)`,
  `addEvento(id, {tipo,texto}, by)`, `listEventos(id)`, `countEmpresas(filters)`.
- Rutas:
  `GET /crm` (cockpit, `requireStaff`), `GET /crm/[id]` (ficha),
  `POST /api/crm/empresas/[id]` (update + override + evento, `requireStaff`),
  `GET /api/crm/empresas/export` (CSV filtrado, `requireStaff`),
  `POST /api/crm/clients/import` (reconectado, `requireAdminApi`). **Recibe `relacion`
  (`cliente|prospecto`) del selector de la UI** y la aplica a todo el lote (R25/R31); el endpoint
  NO infiere la relación por origen del archivo.
- Errores: reusar `ValidationError`, `ForbiddenError` (`backoffice/errors.ts`); nuevo
  `EmpresaNotFoundError` (`src/lib/server/crm/errors.ts`, patrón `code = 'EMPRESA_NOT_FOUND'`).
- Validación Zod en frontera: `empresaUpdateSchema`, `empresaEventoSchema`,
  `empresaListFiltersSchema`, `empresaImportSchema` (incluye `relacion: z.enum(['cliente',
  'prospecto'])` del selector) en `src/lib/server/crm/schemas.ts`.

---

## 6. Decisiones de la puerta humana (2026-06-16) — RESUELTAS

Las open questions del design v1 quedaron cerradas por Martín. Entrada FIJA:

1. **Estrategia de migración:** **A (rename + fold)** — confirmada frente a la opción B.
2. **Prospectos sin CUIT:** dedup por **razón social normalizada**; sin match → fila separada (no se
   descartan). **Confirmado, suficiente** (sin fuzzy match adicional).
3. **Deprecación de tablas viejas:** **NO se dropean.** `crm_lead`/`crm_lead_event` y la vista
   `client` se **mantienen como red de rollback/backup**. La Fase 6 los marca como legacy/solo
   lectura y documenta el procedimiento de limpieza manual posterior, que queda **fuera del alcance
   de #23**.
4. **Ventana activa/inactiva:** **18 meses** sin actividad → `inactiva`. Confirmado.
5. **`relacion` del import en vivo:** **NO se infiere por origen.** La pantalla de import masivo
   ofrece un **selector explícito** (`cliente | prospecto`) que aplica a todo el lote; el endpoint lo
   recibe validado con Zod (R25/R31). La carga histórica de la migración inicial sí es determinística
   por origen (R32), distinto del import en vivo.
6. **`ex_cliente`:** **solo manual** en la ficha. La migración no marca ninguno automáticamente.
7. **`presupuesto` como señal de estado:** fuente de verdad = vínculo **`audit_proposal_link`
   (#16)** de las audits de la empresa. Confirmado.

## 7. Mejoras futuras / roadmap (fuera de alcance de #23)

- **Recomendaciones de empresas para contactar.** Aprovechar el registro unificado de empresas + su
  estado de seguimiento (`sin_contactar`, `inactiva`, etc.) para sugerir proactivamente a qué
  empresas contactar/re-contactar. Se conecta con el estudio de mercado NEA (#18) y con el estado
  híbrido de esta feature. Nota para una feature posterior; **no** se implementa en #23.
