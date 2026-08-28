# Design — #62 62_escaneo_revision_ui

## Alcance

UI de revisión humana de dispositivos escaneados: vista consolidada
multi-VLAN por auditoría (decisión de puerta #59, 2026-08-27), acciones
confirmar/descartar/fusionar con registro de quién/cuándo (R24 de #59),
vinculación con el relevamiento manual (FK diferida de #59) y pantallas de
gestión de escaneos diferidas por #60 (crear escaneo, emitir/revocar token).
**No incluye** scoring (#63), diff (#64), edición del dato escaneado, ni
copia de datos hacia el relevamiento manual (OQ1).

## Dependencias

| Feature | Estado al redactar | Qué consume #62 |
|---|---|---|
| #59 `59_escaneo_modelo_datos` | done (mergeada) | Tablas 030, `repo.ts` (`listarEscaneosDeAuditoria`, `obtenerEscaneo`, `listarDispositivos`, `marcarRevision`), `schemas.ts`, `errors.ts` |
| #60 `60_escaneo_ingesta_api` | in_progress | `emitirTokenEscaneo` / `revocarTokenEscaneo` (`src/lib/server/escaneos/api.ts`) y tabla `escaneo_token` (migración 031) — solo para las actions de token (T11). Si #62 implementa antes del merge de #60, T11 se hace al final contra master ya mergeado. |

**No modifica** `repo.ts` de #59: lo nuevo vive en módulos propios que
componen o conviven con esas funciones (misma línea que #60).

## Contexto verificado (repo real)

| Asumido / a diseñar | Realidad verificada | Consecuencia |
|---|---|---|
| Destino de la FK de vinculación | No existe tabla de relevamiento: las filas son `audit_response(audit_id, item_id).value.rows[*]` con `row_id` UUID estable (`field-table.svelte` genera `crypto.randomUUID()`); `UNIQUE (audit_id, item_id)` en `audit_response` | Vínculo = par `(relevamiento_item_id, relevamiento_row_id)` con FK solo a `template_item`; la existencia de la fila se valida/resuelve vía jsonb (no se puede FK al interior de un jsonb) |
| Estabilidad de `row_id` | Estable mientras la fila exista; el técnico **puede borrar filas** (`removeRow` legítimo, `merge-table.ts`) | El vínculo puede quedar roto → caso R25 con resolución en lectura |
| Unidad de revisión | #59 guarda `revision` por fila de `escaneo_dispositivo` (por ocurrencia) | La decisión humana es sobre el **dispositivo físico** (identidad): las acciones de #62 operan sobre el grupo de ocurrencias (ver §Revisión por grupo) |
| Ubicación de la UI | El detalle de auditoría navega a sub-páginas por dominio (`form`, `reunion`, `cierre`) | Nueva sub-página `/auditorias/[id]/escaneos` + detalle `/auditorias/[id]/escaneos/dispositivos/[identidad]` |
| Mutaciones | Form actions + `failFromError` en la página (patrón `auditorias/[id]/+page.server.ts`); `generateBriefingLink` ya devuelve un secreto una vez vía `form` | Todas las mutaciones de #62 son form actions; el token se muestra una vez en la respuesta del action |
| Autorización | `assertAdminOrAssigned(auditId, user)` (admin siempre; técnico solo `techIsAssigned`, #33/#57); `requireStaff`; 404 vía `getAuditById(id, user)` | Mismo patrón en load y actions de ambas páginas |
| `empresaId` para el repo | `getAuditById` expone `empresa_id AS client_id` | Las páginas pasan `audit.clientId` como `empresaId` a las funciones nuevas (R27/R28) |
| Listas mobile-first | CRM: cards `lg:hidden` + tabla `hidden lg:block`, filtros por query string, paginación server-side | Mismo patrón (R30) |
| Badges/labels | Mapas en `$lib/crm/empresa-view.ts` + spans con tokens `--sys-*`; `ChipPill`/`ChipFilters` (#42) | View-file `$lib/escaneos/escaneo-view.ts` + chips reutilizados (R31) |
| Tests de página | `tests/api/closure-page.test.ts`, `closure-confirm-action.test.ts` (loads/actions contra Postgres real) | Mismo patrón para las actions de #62 |

## Decisiones de diseño (resumen)

1. **Read-model consolidado = query SQL en módulo propio, no vista ni tabla
   derivada.** `listarConsolidado(empresaId, auditId, filtros)` agrupa las
   ocurrencias por `identidad` con `GROUP BY` + `ARRAY_AGG ... ORDER BY rn`
   por campo. El filtro `empresaId` vive en la misma query (R27/R28 de #59).
   Justificación y descartadas en §Alternativas.
2. **Precedencia «más reciente con relleno de huecos».** Cada campo toma el
   valor no nulo de la ocurrencia más reciente (`visto_at DESC NULLS LAST`,
   `updated_at DESC`, `id`); `tipo` salta `desconocido` (semántica R18 de
   #59: "no lo sé" no pisa un dato conocido). El caso multi-VLAN real
   (escaneo con credenciales ve SO; escaneo ARP de otra VLAN ve solo
   IP/MAC/hostname) conserva lo más completo sin reglas nuevas.
3. **La revisión es por identidad, no por ocurrencia.** Las acciones
   escriben en TODAS las ocurrencias del grupo `(audit_id, identidad)`; la
   revisión efectiva en lectura es la más reciente distinta de
   `sin_revisar` (R13), de modo que una ocurrencia nueva de un escaneo
   posterior no revierte la decisión humana (R14).
4. **Vínculo = dos columnas en `escaneo_dispositivo` + validación jsonb.**
   `relevamiento_item_id uuid REFERENCES template_item(id) ON DELETE SET
   NULL` + `relevamiento_row_id text`, CHECK de paridad (ambas o ninguna).
   No se normaliza el relevamiento (ver §Alternativas). La escritura es
   solo sobre `escaneo_dispositivo`: `audit_response` jamás se toca (R23).
5. **Fusión ⟺ vínculo, por construcción.** `fusionarDispositivo` exige
   (ítem, fila) y setea vínculo + `fusionado` en la misma tx; cualquier
   revisión no-fusión limpia el vínculo; `desvincularDispositivo` limpia
   vínculo y vuelve a `sin_revisar`. No hay CHECK DB fusión↔vínculo
   (ver §Alternativas): la invariante la garantizan los dos únicos caminos
   de escritura + tests.
6. **Form actions server-side, no fetch a la API de #60.** Las actions
   componen `crearEscaneo` (#59) y `emitirTokenEscaneo` /
   `revocarTokenEscaneo` (#60) directamente — homogéneo con la página madre
   (`generateBriefingLink` ya devuelve un secreto una vez vía `form`). Los
   endpoints staff de #60 quedan como API pública testeada; no se
   duplica lógica.
7. **Auditoría cerrada = solo lectura** (R4), coherente con el detalle
   (`readonly` cuando `status='cerrada'`); para revisar se reabre (#39).
8. **Detalle por `identidad`, no por id de fila.** La URL
   `/auditorias/[id]/escaneos/dispositivos/[identidad]` es estable aunque
   lleguen ocurrencias nuevas (el id canónico cambia, la identidad no). El
   param se pasa con `encodeURIComponent` (IPv6 contiene `:`).

## Archivos

| Archivo | Cambio |
|---|---|
| `migrations/032_escaneo_revision_vinculo.sql` | Columnas de vínculo + CHECK de paridad + índice parcial |
| `src/lib/server/escaneos/schemas.ts` | Agregar schemas Zod de UI (filtros, marcar, fusionar, crear escaneo) |
| `src/lib/server/escaneos/errors.ts` | Agregar `VinculoRelevamientoInvalidoError` |
| `src/lib/server/escaneos/consolidado.ts` | **Nuevo.** Read-models: `listarConsolidado`, `contadoresRevisionConsolidado`, `obtenerDispositivoConsolidado`, `listarFilasInventarioManual`, `listarEscaneosParaUi` |
| `src/lib/server/escaneos/revision.ts` | **Nuevo.** Mutaciones: `marcarRevisionGrupo`, `fusionarDispositivo`, `desvincularDispositivo` |
| `src/lib/escaneos/escaneo-view.ts` | **Nuevo.** Labels/badges/`formatMac` (patrón `$lib/crm/empresa-view.ts`) |
| `src/routes/(app)/auditorias/[id]/escaneos/+page.server.ts` | **Nuevo.** load + actions (crear/token/marcar) |
| `src/routes/(app)/auditorias/[id]/escaneos/+page.svelte` | **Nuevo.** Sección escaneos + lista consolidada |
| `src/routes/(app)/auditorias/[id]/escaneos/dispositivos/[identidad]/+page.server.ts` | **Nuevo.** load detalle + actions de revisión |
| `src/routes/(app)/auditorias/[id]/escaneos/dispositivos/[identidad]/+page.svelte` | **Nuevo.** Detalle + raw colapsable + panel de fusión |
| `src/lib/components/escaneos/revision-badge.svelte` | **Nuevo.** Pill de estado de revisión |
| `src/lib/components/escaneos/escaneo-estado-badge.svelte` | **Nuevo.** Pill de estado de escaneo |
| `src/lib/components/escaneos/provenance-chips.svelte` | **Nuevo.** Chips de escaneos de origen |
| `src/lib/components/escaneos/raw-json-details.svelte` | **Nuevo.** `<details>` colapsable con `<pre>` del raw |
| `src/lib/components/escaneos/fusionar-panel.svelte` | **Nuevo.** Selector de fila manual + nota |
| `src/lib/components/escaneos/consolidado-cards.svelte` / `consolidado-tabla.svelte` | **Nuevo.** Lista mobile / desktop (extracción por convención <200 líneas) |
| `src/lib/components/escaneos/escaneo-token-panel.svelte` | **Nuevo.** Muestra el token una sola vez + copy |
| `src/routes/(app)/auditorias/[id]/+page.svelte` | Agregar enlace "Escaneos de red" (R1) — única modificación a página existente |
| `tests/escaneos-consolidado.test.ts` | **Nuevo.** Read-model contra Postgres real |
| `tests/escaneos-revision.test.ts` | **Nuevo.** Mutaciones de revisión/vínculo contra Postgres real |
| `tests/escaneos-revision-routes.test.ts` | **Nuevo.** Guards, actions y markup (patrón `closure-page.test.ts`) |
| `e2e/escaneos-revision.spec.ts` | **Nuevo.** Flujo feliz de revisión |

## Esquema — `migrations/032_escaneo_revision_vinculo.sql`

Idempotente (runner en transacción; guards), convenciones de #59.

```sql
-- =====================================================================
-- 032_escaneo_revision_vinculo.sql — #62
-- Vinculación dispositivo escaneado ↔ fila del relevamiento manual.
-- La fila vive en audit_response.value.rows[*] (jsonb): no se puede FK al
-- row_id; la existencia se valida en aplicación y se resuelve en lectura.
-- =====================================================================

ALTER TABLE escaneo_dispositivo
  ADD COLUMN IF NOT EXISTS relevamiento_item_id uuid
    REFERENCES template_item(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relevamiento_row_id text;

-- Paridad: ambas columnas o ninguna (invariante local de fila, estilo #59)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'escaneo_dispositivo_vinculo_ck'
  ) THEN
    ALTER TABLE escaneo_dispositivo
      ADD CONSTRAINT escaneo_dispositivo_vinculo_ck CHECK (
        (relevamiento_item_id IS NULL) = (relevamiento_row_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS escaneo_dispositivo_vinculo_idx
  ON escaneo_dispositivo (relevamiento_item_id)
  WHERE relevamiento_item_id IS NOT NULL;
```

Notas:

- **FK a `template_item`, no a `audit_response`**: el ítem de plantilla es la
  referencia estable; la response se reescribe por upsert en cada autosave
  del form. El par `(audit_id, item_id)` de la response queda implícito: el
  grupo de ocurrencias ya fija la auditoría, y la validación de fusión
  exige que el ítem sea `field_type='table'` de la plantilla de ESA
  auditoría con la fila presente (R22).
- **`ON DELETE SET NULL`**: borrar un ítem de plantilla no debe romperse por
  vínculos históricos; si ocurre, la lectura lo muestra como vínculo roto
  (mismo camino de R25).
- **Sin CHECK fusión↔vínculo a nivel DB** (ver §Alternativas).

## Read-model consolidado — `src/lib/server/escaneos/consolidado.ts`

### Tipos

```ts
export type OcurrenciaConsolidada = {
  dispositivoId: string;
  escaneoId: string;
  escaneoEtiqueta: string | null;
  escaneoRango: string;
  escaneoEstado: EscaneoEstado;
  vistoAt: Date | null;
};

export type DispositivoConsolidado = {
  identidad: string;
  identidadPorIp: boolean; // true si ninguna ocurrencia tiene MAC (R15)
  mac: string | null;
  ip: string;
  hostname: string | null;
  fqdn: string | null;
  fabricante: string | null;
  modelo: string | null;
  serial: string | null;
  tipo: DispositivoTipo;
  soFamilia: string | null;
  soNombre: string | null;
  soVersion: string | null;
  cpuDescripcion: string | null;
  memoriaMb: number | null;
  discoTotalGb: number | null;
  vistoAt: Date | null; // el más reciente entre ocurrencias
  revision: DispositivoRevision; // efectiva (R13)
  revisadoPor: string | null;
  revisadoAt: Date | null;
  notaTecnico: string | null;
  relevamientoItemId: string | null;
  relevamientoRowId: string | null;
  canonicalId: string; // id de la ocurrencia rn = 1 (software/servicios, R18)
  ocurrencias: OcurrenciaConsolidada[]; // provenance (R10)
};

export type FiltrosConsolidado = {
  tipo?: DispositivoTipo;
  revision?: DispositivoRevision; // sobre la revisión efectiva
  escaneoId?: string; // grupos con al menos una ocurrencia en ese escaneo
  limit?: number; // default 100, máx 500 (misma cota que #59)
  offset?: number;
};
```

### Query de referencia (R9–R17)

```sql
WITH oc AS (
  SELECT
    d.*,
    e.etiqueta AS escaneo_etiqueta,
    e.rango_objetivo AS escaneo_rango,
    e.estado AS escaneo_estado,
    ROW_NUMBER() OVER (
      PARTITION BY d.identidad
      ORDER BY d.visto_at DESC NULLS LAST, d.updated_at DESC, d.id
    ) AS rn
  FROM escaneo_dispositivo d
  JOIN escaneo e ON e.id = d.escaneo_id
  JOIN audit a ON a.id = e.audit_id
  WHERE e.audit_id = ${auditId}
    AND a.empresa_id = ${empresaId}          -- R27/R28, misma query
),
consolidado AS (
  SELECT
    identidad,
    bool_and(mac IS NULL) AS identidad_por_ip,
    (ARRAY_AGG(mac      ORDER BY rn) FILTER (WHERE mac      IS NOT NULL))[1] AS mac,
    (ARRAY_AGG(ip       ORDER BY rn))[1]                                     AS ip,
    (ARRAY_AGG(hostname ORDER BY rn) FILTER (WHERE hostname IS NOT NULL))[1] AS hostname,
    -- ... mismo patrón para fqdn, fabricante, modelo, serial,
    --     so_familia, so_nombre, so_version, so_arquitectura,
    --     cpu_descripcion, memoria_mb, disco_total_gb ...
    COALESCE(
      (ARRAY_AGG(tipo ORDER BY rn) FILTER (WHERE tipo <> 'desconocido'))[1],
      'desconocido'
    ) AS tipo,                                -- R12
    (ARRAY_AGG(visto_at ORDER BY rn))[1] AS visto_at,
    COALESCE(
      (ARRAY_AGG(revision ORDER BY revisado_at DESC NULLS LAST, rn)
         FILTER (WHERE revision <> 'sin_revisar'))[1],
      'sin_revisar'
    ) AS revision,                            -- R13/R14
    (ARRAY_AGG(revisado_por ORDER BY revisado_at DESC NULLS LAST, rn)
       FILTER (WHERE revision <> 'sin_revisar'))[1] AS revisado_por,
    (ARRAY_AGG(revisado_at ORDER BY revisado_at DESC NULLS LAST, rn)
       FILTER (WHERE revision <> 'sin_revisar'))[1] AS revisado_at,
    (ARRAY_AGG(nota_tecnico ORDER BY revisado_at DESC NULLS LAST, rn)
       FILTER (WHERE nota_tecnico IS NOT NULL))[1] AS nota_tecnico,
    (ARRAY_AGG(relevamiento_item_id ORDER BY rn)
       FILTER (WHERE relevamiento_item_id IS NOT NULL))[1] AS relevamiento_item_id,
    (ARRAY_AGG(relevamiento_row_id ORDER BY rn)
       FILTER (WHERE relevamiento_item_id IS NOT NULL))[1] AS relevamiento_row_id,
    (ARRAY_AGG(id ORDER BY rn))[1] AS canonical_id,
    ARRAY_AGG(escaneo_id) AS escaneo_ids,     -- filtro por escaneo (R16)
    jsonb_agg(
      jsonb_build_object(
        'dispositivoId', id,
        'escaneoId', escaneo_id,
        'escaneoEtiqueta', escaneo_etiqueta,
        'escaneoRango', escaneo_rango,
        'escaneoEstado', escaneo_estado,
        'vistoAt', visto_at
      ) ORDER BY rn
    ) AS ocurrencias                          -- R10
  FROM oc
  GROUP BY identidad
)
SELECT * FROM consolidado
WHERE TRUE
  ${filtros.tipo      ? sql`AND tipo = ${filtros.tipo}` : sql``}
  ${filtros.revision  ? sql`AND revision = ${filtros.revision}` : sql``}
  ${filtros.escaneoId ? sql`AND ${filtros.escaneoId}::uuid = ANY(escaneo_ids)` : sql``}
ORDER BY (revision = 'sin_revisar') DESC, ip ASC, identidad ASC
LIMIT ${limit} OFFSET ${offset}
-- + SELECT count(*) del mismo CTE filtrado (patrón listarDispositivos de #59)
```

Reglas:

- **Entran todos los escaneos de la auditoría que tengan dispositivos**, sin
  filtro de estado (un `pendiente` no puede tener dispositivos — R4 de #59;
  uno `fallido`/`cancelado` puede tener datos parciales legítimos). La
  provenance muestra el estado del escaneo (R10). Ver OQ3.
- **Orden de lista**: `sin_revisar` primero (cola de trabajo del técnico),
  luego `ip` (orden nativo `inet`) e `identidad` como desempate
  determinístico.
- **`raw` NO se agrega** en la lista (peso); se expone por ocurrencia en el
  detalle (R19).
- Volumen esperado: cientos de ocurrencias por auditoría (PyME, N VLANs de
  /24) — el `GROUP BY` con agregados ordenados es trivial para Postgres.

### Firmas

```ts
export async function listarConsolidado(
  empresaId: string,
  auditId: string,
  filtros?: FiltrosConsolidado
): Promise<{ items: DispositivoConsolidado[]; total: number }>;

export async function contadoresRevisionConsolidado(
  empresaId: string,
  auditId: string
): Promise<RevisionMetricas>; // tipo de #59: Record<DispositivoRevision, number>

export type VinculoResuelto = {
  itemId: string;
  rowId: string;
  itemLabel: string;
  resumenFila: string; // "Tipo: Servidor · Modelo: HP DL380" (celdas no vacías)
  vivo: boolean;       // false si la fila ya no existe en value.rows (R25)
};

export type DispositivoConsolidadoDetalle = DispositivoConsolidado & {
  software: { nombre: string; version: string | null; publisher: string | null }[];
  servicios: {
    puerto: number; protocolo: string; estadoPuerto: string;
    servicio: string | null; producto: string | null; version: string | null;
  }[];
  ocurrenciasRaw: {
    dispositivoId: string; escaneoId: string;
    escaneoEtiqueta: string | null; vistoAt: Date | null;
    raw: Record<string, unknown>;
  }[];
  vinculo: VinculoResuelto | null;
};

export async function obtenerDispositivoConsolidado(
  empresaId: string,
  auditId: string,
  identidad: string
): Promise<DispositivoConsolidadoDetalle>; // EscaneoNotFoundError('Dispositivo no encontrado') si no existe

export type FilaInventarioManual = {
  itemId: string;
  itemLabel: string;
  sectionTitle: string;
  rowId: string;
  resumen: string;
};

export async function listarFilasInventarioManual(
  empresaId: string,
  auditId: string
): Promise<FilaInventarioManual[]>;

export type EscaneoParaUi = EscaneoRow & {
  tokenActivo: boolean;
  tokenExpiresAt: Date | null;
};

export async function listarEscaneosParaUi(
  empresaId: string,
  auditId: string
): Promise<EscaneoParaUi[]>;
```

### Detalle: resolución de software/servicios, raw y vínculo

- **Software y servicios**: solo de la ocurrencia `canonicalId` (la más
  reciente), identificando el escaneo de origen (R18). Unir entre escaneos
  es dedup con reglas de equivalencia — eso es diff (#64), no revisión.
- **Raw por ocurrencia** (R19): `SELECT id, escaneo_id, ..., raw FROM oc
  ORDER BY rn` — sin transformación (R14 de #59).
- **Vínculo** (R25): si `relevamiento_item_id` no es null, resolver contra
  la response de ESTA auditoría:

```sql
SELECT ti.label, ti.options, ar.value
FROM template_item ti
JOIN section s ON s.id = ti.section_id
JOIN audit a ON s.template_id = ANY(a.template_ids) AND a.id = ${auditId}
LEFT JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
WHERE ti.id = ${itemId}
```

  `vivo = EXISTS (SELECT 1 FROM jsonb_array_elements(value->'rows') r
  WHERE r->>'row_id' = ${rowId})` (evaluable en TS sobre el `value`
  ya traído). `resumenFila` se construye en TS: primeras 3 celdas no vacías
  como `"<label columna>: <valor>"`, usando `options.columns` para los
  labels (formato `tableOptionsSchema` de `field-schemas.ts`).

### Filas del relevamiento manual (selector de fusión)

```sql
SELECT
  ti.id AS item_id, ti.label AS item_label, ti.options,
  s.title AS section_title,
  fila.ord,
  fila.row
FROM audit a
JOIN section s       ON s.template_id = ANY(a.template_ids)
JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
CROSS JOIN LATERAL jsonb_array_elements(ar.value->'rows')
  WITH ORDINALITY AS fila(row, ord)
WHERE a.id = ${auditId}
  AND a.empresa_id = ${empresaId}
ORDER BY s.sort_order, ti.sort_order, fila.ord
```

Sin filtro de dominio IT/ERP: se listan todos los ítems-tabla de la
plantilla de la auditoría agrupados por sección (el técnico elige; restringir
por `template_code` acoplaría la UI a la convención de dominios del informe).
`resumen` en TS, mismo formato que `VinculoResuelto`.

### Escaneos para la UI (R8 + estado de token)

`listarEscaneosParaUi` = `listarEscaneosDeAuditoria` (#59) enriquecido con
un join a `escaneo_token` (tabla de #60, migración 031):

```sql
SELECT e.*,
  (t.id IS NOT NULL) AS token_activo,
  t.expires_at       AS token_expires_at
FROM escaneo e
JOIN audit a ON a.id = e.audit_id
LEFT JOIN escaneo_token t
  ON t.escaneo_id = e.id AND t.revoked_at IS NULL AND t.expires_at > now()
WHERE e.audit_id = ${auditId}
  AND a.empresa_id = ${empresaId}
ORDER BY e.created_at DESC
```

(Lectura nueva en módulo propio: no modifica #60, que está in_progress.)

## Mutaciones — `src/lib/server/escaneos/revision.ts`

**Regla estructural** (R27/R28): `empresaId` primer parámetro, aplicado en la
misma query vía join `escaneo → audit`. Todas resuelven el grupo por
`(auditId, identidad)` y devuelven la cantidad de filas actualizadas; 0 filas
→ `EscaneoNotFoundError('Dispositivo no encontrado')` (reuso de #59).

```ts
/** R20/R26. revision 'fusionado' se rechaza: usar fusionarDispositivo. */
export async function marcarRevisionGrupo(
  empresaId: string,
  auditId: string,
  identidad: string,
  revision: Exclude<DispositivoRevision, 'fusionado'>,
  usuarioId: string,
  nota?: string | null
): Promise<number>;

/** R21/R22. Valida ítem-tabla de la plantilla + fila existente, misma tx. */
export async function fusionarDispositivo(
  empresaId: string,
  auditId: string,
  identidad: string,
  itemId: string,
  rowId: string,
  usuarioId: string,
  nota?: string | null
): Promise<number>;

/** R24. Limpia vínculo y vuelve a sin_revisar las ocurrencias vinculadas. */
export async function desvincularDispositivo(
  empresaId: string,
  auditId: string,
  identidad: string
): Promise<number>;
```

`marcarRevisionGrupo` (misma semántica de `marcarRevision` de #59, aplicada
al grupo; una revisión no-fusión **limpia el vínculo** para sostener la
invariante fusión⟺vínculo):

```sql
UPDATE escaneo_dispositivo d SET
  revision = ${revision},
  revisado_por = CASE WHEN ${revision} = 'sin_revisar' THEN NULL
                      ELSE ${usuarioId}::uuid END,
  revisado_at  = CASE WHEN ${revision} = 'sin_revisar' THEN NULL
                      ELSE now() END,
  nota_tecnico = CASE WHEN ${nota !== undefined} THEN ${nota ?? null}
                      ELSE d.nota_tecnico END,
  relevamiento_item_id = NULL,   -- coherencia fusión⟺vínculo
  relevamiento_row_id  = NULL,
  updated_at = now()
WHERE d.identidad = ${identidad}
  AND EXISTS (
    SELECT 1
    FROM escaneo e
    JOIN audit a ON a.id = e.audit_id
    WHERE e.id = d.escaneo_id
      AND e.audit_id = ${auditId}
      AND a.empresa_id = ${empresaId}
  )
```

`fusionarDispositivo` (tx):

1. Validación del destino (R22), misma query con scope empresa:

```sql
SELECT 1
FROM audit a
JOIN section s       ON s.template_id = ANY(a.template_ids)
JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
WHERE a.id = ${auditId}
  AND a.empresa_id = ${empresaId}
  AND ti.id = ${itemId}
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(ar.value->'rows') r
    WHERE r->>'row_id' = ${rowId}
  )
```

   Sin fila → `VinculoRelevamientoInvalidoError` (nuevo, ver §Errores).
2. `UPDATE` del grupo: `revision='fusionado'`, `revisado_por/at`, `nota`
   opcional, `relevamiento_item_id`, `relevamiento_row_id`, `updated_at`.
3. **Nunca** se escribe `audit_response` (R23): la fusión es un puntero
   desde el dispositivo hacia la fila, no una copia.

`desvincularDispositivo`:

```sql
UPDATE escaneo_dispositivo d SET
  relevamiento_item_id = NULL,
  relevamiento_row_id  = NULL,
  revision      = 'sin_revisar',
  revisado_por  = NULL,
  revisado_at   = NULL,
  updated_at    = now()
WHERE d.identidad = ${identidad}
  AND d.relevamiento_item_id IS NOT NULL
  AND EXISTS ( ... mismo scope ... )
```

`marcarRevision` por fila de #59 **queda sin consumidor de UI** (la UI opera
por grupo); se mantiene como API de repo testeada.

## Schemas Zod nuevos — agregados en `escaneos/schemas.ts`

```ts
export const filtrosConsolidadoInput = z.object({
  tipo: dispositivoTipo.optional(),
  revision: dispositivoRevision.optional(),
  escaneo: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export const crearEscaneoUiInput = z.object({
  etiqueta: z.string().max(200).nullish(),
  rangoObjetivo: z.string().min(1).max(200)
});

export const marcarRevisionGrupoInput = z.object({
  identidad: z.string().min(1).max(300),
  revision: z.enum(['confirmado', 'descartado', 'sin_revisar']),
  nota: z.string().max(2000).nullish()
});

export const fusionarDispositivoInput = z.object({
  identidad: z.string().min(1).max(300),
  itemId: z.string().uuid(),
  // row_id es UUID en filas nuevas (crypto.randomUUID) pero el canónico lo
  // tipa string (#45): se acepta string para no romper filas históricas
  rowId: z.string().min(1).max(100),
  nota: z.string().max(2000).nullish()
});
```

`AGENTE_VERSION_INICIAL = '1.0.0'` (constante exportada en `schemas.ts`):
la creación desde UI precarga la versión vigente del agente; el agente la
corrige al conectarse (R21 de #60). Major alineado con
`AGENTE_MAJOR_SOPORTADO` de #60.

## Errores — agregado en `escaneos/errors.ts`

| Error | code | Cuándo |
|---|---|---|
| `VinculoRelevamientoInvalidoError` | `VINCULO_RELEVAMIENTO_INVALIDO` | Fusión con ítem/fila inexistente, ítem no-tabla, o de otra plantilla/auditoría (R22) |

Reuso de #59: `EscaneoNotFoundError` (dispositivo/escaneo inexistente o de
otra empresa), `ValidationError` (de backoffice, para `revision='fusionado'`
en `marcarRevisionGrupo`). En las páginas, `failFromError` mapea a
`fail(status, { error })` sin stack (R29); auditoría cerrada en actions →
`fail(409, { error: 'La auditoría está cerrada...' })` directo (patrón
`fail(400)` de `copyBriefingLink`).

## Rutas y páginas

### `GET /auditorias/[id]/escaneos`

`+page.server.ts`:

```ts
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const user = requireStaff(locals);
  const audit = await getAuditById(params.id, user);
  if (!audit) error(404, 'Auditoría no encontrada');
  if (user.role !== 'admin' && !(await techIsAssigned(audit.id, user.id))) {
    error(403, 'No tenés permiso para ver los escaneos de esta auditoría'); // R3
  }
  const readonly = audit.status === 'cerrada'; // R4
  const filtros = filtrosConsolidadoInput.parse({
    tipo: url.searchParams.get('tipo') ?? undefined,
    revision: url.searchParams.get('revision') ?? undefined,
    escaneo: url.searchParams.get('escaneo') ?? undefined,
    page: url.searchParams.get('page') ?? undefined
  });
  const empresaId = audit.clientId;
  const limit = 100;
  const [escaneos, consolidado, contadores] = await Promise.all([
    listarEscaneosParaUi(empresaId, audit.id),
    listarConsolidado(empresaId, audit.id, {
      ...filtros, escaneoId: filtros.escaneo, limit, offset: (filtros.page - 1) * limit
    }),
    contadoresRevisionConsolidado(empresaId, audit.id)
  ]);
  return { /* fechas serializadas ISO, patrón de la página madre */ };
};
```

Actions (todas: `requireStaff` + `assertAdminOrAssigned` + guard `cerrada`
→ `fail(409)` + `failFromError`):

| Action | Cuerpo | Efecto | R |
|---|---|---|---|
| `crearEscaneo` | `etiqueta?`, `rangoObjetivo` | `crearEscaneo(empresaId, user.id, { ...input, auditId, agenteVersion: AGENTE_VERSION_INICIAL })` | R5 |
| `emitirToken` | `escaneoId` | `resolverAmbitoEscaneo` (#60) + `emitirTokenEscaneo` → `{ success, token, expiresAt }` (una sola vez) | R6 |
| `revocarToken` | `escaneoId` | `revocarTokenEscaneo` (#60) | R7 |
| `marcar` | `identidad`, `revision` (`confirmado`/`descartado`) | `marcarRevisionGrupo` — acción rápida de lista, sin nota | R20 |

`+page.svelte`:

- Header con título "Escaneos de red", empresa y link de vuelta al detalle.
- **Sección Escaneos** (R8): cards mobile / tabla desktop con estado
  (`escaneo-estado-badge`), etiqueta/rango, `dispositivos_detectados`,
  fechas; form "Nuevo escaneo" (rango + etiqueta); por escaneo: "Emitir
  token" o, si `tokenActivo`, "Rotar token" / "Revocar" + expiración. Tras
  emitir, `escaneo-token-panel` muestra el claro una vez con botón copiar
  (patrón `CopyLinkButton`) y aviso de única muestra (R6).
- **Sección Dispositivos** (R9–R17, R30, R31): `ChipFilters` de revisión con
  contadores (R17), selects de tipo y escaneo de origen, navegación por
  query string (patrón CRM `buildUrl`), cards `lg:hidden` / tabla
  `hidden lg:block` (`consolidado-cards` / `consolidado-tabla`), acciones
  rápidas confirmar/descartar por ítem, badge de identidad débil cuando
  `identidadPorIp` (R15), provenance como chips (`provenance-chips`, R10),
  paginación server-side (R16). Estados vacíos explícitos ("Sin escaneos
  todavía — creá el primero", "Sin dispositivos para los filtros").

### `GET /auditorias/[id]/escaneos/dispositivos/[identidad]`

`+page.server.ts` — load: mismos guards; `obtenerDispositivoConsolidado`
(404 si no existe); `listarFilasInventarioManual` (para el panel de fusión);
`readonly` por `cerrada`. Actions: `confirmar`, `descartar`,
`volverASinRevisar` (→ `marcarRevisionGrupo` con nota opcional, R20/R26),
`fusionar` (→ `fusionarDispositivo`, R21/R22), `desvincular` (→
`desvincularDispositivo`, R24).

`+page.svelte`:

- Datos consolidados (campos normalizados, R18) con badges de tipo y
  revisión efectiva (quién/cuándo, R13).
- Provenance completa (R10) con `raw-json-details` por ocurrencia (R19).
- Software y servicios de la ocurrencia canónica, con el escaneo de origen
  identificado (R18).
- Bloque de vínculo: si `fusionado`, ítem + resumen de fila + estado
  vivo/roto (R25); roto → acciones re-vincular (abre `fusionar-panel`) o
  desvincular.
- `fusionar-panel`: buscador client-side sobre las filas ya cargadas
  (volumen chico), radio por fila (ítem + resumen), nota opcional,
  confirmar. Modal fijo patrón `briefing-email` de la página madre.
- Cada acción con `textarea` de nota opcional y confirmación
  (`onsubmit confirm()` para descartar/desvincular, patrón `archive`).

### Enlace desde el detalle (R1)

En `auditorias/[id]/+page.svelte`, junto a "Abrir relevamiento técnico":
`<a href="/auditorias/{id}/escaneos">Escaneos de red</a>` visible para
staff autorizado (misma condición que los otros links de la página).

## View-file y componentes

`src/lib/escaneos/escaneo-view.ts` (patrón `$lib/crm/empresa-view.ts`):

```ts
export const ESCANEO_ESTADO_LABELS: Record<EscaneoEstado, string> = {
  pendiente: 'Pendiente', en_curso: 'En curso', sincronizando: 'Sincronizando',
  completado: 'Completado', fallido: 'Fallido', cancelado: 'Cancelado'
};
export const ESCANEO_ESTADO_BADGE: Record<EscaneoEstado, string> = { /* tokens --sys-* */ };
export const DISPOSITIVO_TIPO_LABELS: Record<DispositivoTipo, string> = {
  servidor: 'Servidor', workstation: 'Workstation', notebook: 'Notebook',
  switch: 'Switch', router: 'Router', firewall: 'Firewall',
  impresora: 'Impresora', camara: 'Cámara', nas: 'NAS', ups: 'UPS',
  telefonia: 'Telefonía', movil: 'Móvil', virtual: 'Virtual',
  desconocido: 'Desconocido'
};
export const REVISION_LABELS: Record<DispositivoRevision, string> = {
  sin_revisar: 'Sin revisar', confirmado: 'Confirmado',
  descartado: 'Descartado', fusionado: 'Fusionado'
};
export const REVISION_BADGE: Record<DispositivoRevision, string> = { /* tokens --sys-* */ };
/** 'aabbccddeeff' → 'aa:bb:cc:dd:ee:ff' */
export function formatMac(mac: string): string;
```

Componentes `<200 líneas` (convención), props tipadas, sin lógica de DB.
Targets táctiles `min-h-[var(--sys-touch-min)]` en toda acción (R31), mismo
patrón que `field-table.svelte`.

## Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| **Vista SQL (`CREATE VIEW escaneo_dispositivo_consolidado`)** | El repo accede a datos vía funciones con `empresaId` en la misma query (R26/R27 de #59); una vista crea un segundo camino de acceso sin ese filtro. El repo no usa vistas de dominio (solo la legacy `client` de compatibilidad). La query en módulo propio es igual de reutilizable por #63/#64 y se testea contra Postgres real. |
| **Tabla derivada / materializada del consolidado** | Exige invalidar en cada chunk de ingesta (write-path de #60) y en cada revisión; el volumen (cientos de filas por auditoría) hace trivial el cálculo en lectura. Complejidad sin beneficio. |
| **Normalizar el relevamiento manual a una tabla `relevamiento_item` (fila por row)** | Refactor grande del form técnico, autosave, merge (#26), canónico e informe (#45) — todos consumen `value.rows` jsonb. El `row_id` ya es un UUID estable: el vínculo `(item_id, row_id)` con validación jsonb cubre la necesidad sin tocar el relevamiento. La migración mínima sana es 032 (dos columnas + CHECK + índice). |
| **FK a `audit_response(id)` en lugar de `template_item(id)`** | La response se reescribe por upsert en cada autosave; el ítem de plantilla es la referencia estable. Ninguna de las dos puede garantizar la existencia del `row_id` dentro del jsonb (se valida en aplicación igual), así que no aporta. |
| **CHECK DB `revision='fusionado' ⇒ vínculo presente`** | Choca con `ON DELETE SET NULL` de la FK (borrar un ítem violaría el CHECK) y con la llegada de ocurrencias nuevas a grupos ya fusionados. La invariante la garantizan los dos únicos caminos de escritura (`fusionarDispositivo` / `desvincularDispositivo` / limpieza en `marcarRevisionGrupo`) + tests. |
| **Revisión por ocurrencia (exponer `marcarRevision` de #59 a la UI)** | La decisión humana es sobre el dispositivo físico (identidad); revisar N ocurrencias del mismo equipo duplica trabajo y permite estados contradictorios dentro del mismo consolidado. |
| **Precedencia «la fila más reciente gana entera»** | En multi-VLAN con credenciales desiguales, el escaneo más reciente puede ser el más pobre (ARP sin credenciales). El COALESCE por campo conserva lo más completo con la misma semántica R18 de #59, sin reglas nuevas. |
| **Copiar datos escaneados a la fila manual al fusionar** | Prohibido por el acceptance (nunca sobrescribir el dato manual, R23). La copia asistida queda como OQ1. |
| **Endpoints JSON `/api/...` para la revisión** | La única consumidora es la UI; las páginas de auditoría usan form actions (convención). #63/#64 leerán el repo server-side. |
| **Restringir el selector de fusión a ítems de dominio IT** | El dominio se resuelve por `template_code` en el pipeline de informe; acoplar la UI a esa convención agrega fragilidad. Se listan todos los ítems-tabla de la plantilla agrupados por sección. |
| **Detalle en modal sobre la lista** | La página propia es deep-linkable, más simple en mobile y sigue el patrón CRM (`/crm/[id]`). |

## Preguntas abiertas para la puerta humana

- **OQ1 — Copia asistida hacia el relevamiento manual.**
  Opción A (propuesta): la fusión solo vincula; si el técnico quiere
  incorporar datos del escaneo a la fila manual, los tipea en el form (la
  UI de detalle los muestra lado a lado). Opción B: botón "precargar en
  relevamiento" que abre el form con la fila en edición y valores sugeridos
  del escaneo (toca el form técnico; agranda el alcance). **Propuesta: A**;
  B puede ser una feature futura si el flujo real lo pide.
- **OQ2 — Revisión con auditoría cerrada.**
  Opción A (propuesta): `cerrada` = solo lectura (R4); para revisar se
  reabre la auditoría (flujo #39 existente). Opción B: permitir revisar
  post-cierre y que #63 recomputé scoring al cerrar de nuevo. **Propuesta:
  A** — coherente con todo el detalle de auditoría y evita invalidar
  scoring ya computado.
- **OQ3 — Escaneos que entran al consolidado.**
  Opción A (propuesta): todos los que tengan dispositivos, mostrando el
  estado del escaneo en la provenance (un `fallido` puede tener la única
  copia de los datos). Opción B: solo `en_curso`/`sincronizando`/
  `completado`. **Propuesta: A** — no esconde datos al técnico; el estado
  queda visible.

## Tests

Contra Postgres real (test DB), fixtures empresa + audit + técnico +
template con ítem-tabla (patrón `tests/escaneos.test.ts` de #59 y
`tests/api/closure-page.test.ts` para loads/actions).

### `tests/escaneos-consolidado.test.ts`

| Caso | R |
|---|---|
| Misma MAC en 2 escaneos de la auditoría → 1 dispositivo con 2 ocurrencias y provenance ordenada | R9, R10 |
| Misma MAC, datos distintos: campo presente solo en la ocurrencia vieja se conserva; presente en ambas gana la reciente | R11 |
| Tipo `desconocido` reciente + `servidor` anterior → consolidado `servidor` | R12 |
| Revisión efectiva: `confirmado` viejo + ocurrencia nueva `sin_revisar` → efectiva `confirmado` con quién/cuándo | R13, R14 |
| Grupo sin MAC (identidad por IP) → `identidadPorIp = true` | R15 |
| Filtros por tipo, revisión efectiva y escaneo de origen + paginación (limit/offset y total) | R16 |
| Contadores por revisión sobre el consolidado (dedup aplicado) | R17 |
| Misma MAC en otra auditoría → NO se deduplica entre auditorías | R9 |
| `empresaId` ajeno → lista vacía / not found, cero escrituras | R27, R28 |
| Detalle: software/servicios de la ocurrencia canónica; raw por ocurrencia sin transformación | R18, R19 |

### `tests/escaneos-revision.test.ts`

| Caso | R |
|---|---|
| `marcarRevisionGrupo` confirmado → todas las ocurrencias con quién/cuándo y nota | R20 |
| `fusionarDispositivo` → vínculo + `fusionado` en todas las ocurrencias | R21 |
| Fusión con fila inexistente, ítem no-tabla o de otra plantilla/auditoría → `VINCULO_RELEVAMIENTO_INVALIDO`, cero escrituras | R22, R28 |
| Fusión no modifica `audit_response` (value idéntico antes/después) | R23 |
| `desvincularDispositivo` → vínculo NULL y `sin_revisar` sin revisor/fecha | R24 |
| Vínculo roto: se borra la fila del jsonb (update directo de `audit_response`) → detalle resuelve `vivo = false` | R25 |
| Revertir a `sin_revisar` limpia revisor y fecha en el grupo | R26 |
| `marcarRevisionGrupo` con `fusionado` → `ValidationError` | R21 |
| Revisión no-fusión sobre dispositivo fusionado → limpia el vínculo | R20 |
| CHECK de paridad: `relevamiento_row_id` sin `item_id` imposible a nivel DB | R21 |

### `tests/escaneos-revision-routes.test.ts`

| Caso | R |
|---|---|
| Load sin sesión → redirect /login; técnico no asignado → 403; admin y asignado → 200 | R2, R3 |
| Auditoría `cerrada`: load expone `readonly`; actions de revisión/creación/token → `fail(409)` | R4 |
| Action `crearEscaneo` → escaneo `pendiente` con técnico de la sesión | R5 |
| Action `emitirToken` → respuesta con claro + expiración; DB guarda solo hash (con #60 mergeado) | R6 |
| Action `revocarToken` → el token deja de resolver (con #60 mergeado) | R7 |
| Load lista escaneos con estado, rango, conteo y token activo | R8 |
| Action `marcar` desde la lista aplica al grupo | R20 |
| Error de dominio en action → `fail` con mensaje, sin stack | R29 |
| Markup: cards `lg:hidden` + tabla `hidden lg:block`; targets `--sys-touch-min` | R30, R31 |
| Detalle de auditoría contiene el enlace a `/escaneos` | R1 |

### `e2e/escaneos-revision.spec.ts`

Flujo feliz con seed: login admin → auditoría con escaneo y dispositivos →
abrir "Escaneos de red" → confirmar un dispositivo (badge cambia) → abrir
detalle → fusionar con una fila del inventario manual seed → vínculo
visible. Cubre R1, R20, R21 a nivel flujo.

## Gates

`pnpm test -- tests/escaneos-*.test.ts` · `pnpm exec playwright test
e2e/escaneos-revision.spec.ts` · `pnpm run check` · `pnpm run build` ·
`./init.sh`
