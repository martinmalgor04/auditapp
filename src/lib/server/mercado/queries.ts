import { getSql } from '$lib/server/db/client';
import { estadoSelectSql } from '$lib/server/db/empresa';
import type { MercadoFilters } from './filters';

type SqlFilters = {
  segment: string | null;
  rubro: string | null;
  provincia: string | null;
  from: Date | null;
  to: Date | null;
};

function toSqlFilters(filters: MercadoFilters): SqlFilters {
  return {
    segment: filters.segment ?? null,
    rubro: filters.rubro ?? null,
    provincia: filters.provincia ?? null,
    from: filters.from ?? null,
    to: filters.to
      ? new Date(
          Date.UTC(
            filters.to.getUTCFullYear(),
            filters.to.getUTCMonth(),
            filters.to.getUTCDate(),
            23,
            59,
            59,
            999
          )
        )
      : null
  };
}

/**
 * Predicado base del universo (#18 + #43): auditorías `cerrada` con `empresa` unida (`c`), filtradas
 * por segmento/rubro/fechas y, nuevo en #43, por `provincia` normalizada (trim + colapso de espacios
 * + case-insensitive). Cada predicado es no-op cuando el filtro está ausente (`::text IS NULL`).
 * Fuente única del WHERE para mantener todos los bloques sobre el mismo denominador (R2, R4).
 */
function baseAuditWhere(sql: ReturnType<typeof getSql>, f: SqlFilters) {
  return sql`
    a.status = 'cerrada'
    AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
    AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
    AND (
      ${f.provincia}::text IS NULL
      OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
         = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
    )
    AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
    AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
  `;
}

export type UniverseRow = { n: number };

export type ErpDistributionRow = { key: string; n: number };

export type ModuloRow = { key: string; n: number };

export type IndexGlobalRow = {
  n_it: number;
  n_erp: number;
  avg_it: number | null;
  avg_erp: number | null;
};

export type IndexGroupRow = {
  key: string;
  n: number;
  avg_it: number | null;
  avg_erp: number | null;
};

export type IndexRawRow = {
  indice_it: number | null;
  indice_erp: number | null;
};

export type MonthlyRow = {
  month: Date;
  n: number;
  avg_it: number | null;
  avg_erp: number | null;
};

export type UpsellRow = {
  total: number;
  audits_with_findings: number;
  universe_n: number;
};

export async function fetchUniverseCount(filters: MercadoFilters): Promise<number> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  const [row] = await sql<UniverseRow[]>`
    SELECT COUNT(*)::int AS n
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
      AND (
        ${f.provincia}::text IS NULL
        OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
           = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
      )
      AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
      AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
  `;
  return row?.n ?? 0;
}

export async function fetchErpDistribution(filters: MercadoFilters): Promise<ErpDistributionRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<ErpDistributionRow[]>`
    WITH base AS (
      SELECT a.id, c.erp_actual
      FROM audit a
      JOIN empresa c ON c.id = a.empresa_id
      WHERE a.status = 'cerrada'
        AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
        AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
        AND (
          ${f.provincia}::text IS NULL
          OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
             = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
        )
        AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
        AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
    )
    SELECT
      CASE
        WHEN erp_actual IS NULL OR btrim(erp_actual) = '' THEN 'Sin dato'
        ELSE btrim(erp_actual)
      END AS key,
      COUNT(*)::int AS n
    FROM base
    GROUP BY 1
    ORDER BY n DESC, key ASC
  `;
}

export async function fetchModulosTango(filters: MercadoFilters): Promise<ModuloRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<ModuloRow[]>`
    WITH base AS (
      SELECT a.id, a.template_ids
      FROM audit a
      JOIN empresa c ON c.id = a.empresa_id
      WHERE a.status = 'cerrada'
        AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
        AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
        AND (
          ${f.provincia}::text IS NULL
          OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
             = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
        )
        AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
        AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
    ),
    modulos AS (
      SELECT jsonb_array_elements_text(ar.value) AS modulo
      FROM base b
      JOIN template_item ti ON ti.section_id IN (
        SELECT s.id FROM section s WHERE s.template_id = ANY(b.template_ids)
      )
      JOIN section s ON s.id = ti.section_id
      JOIN audit_response ar ON ar.audit_id = b.id AND ar.item_id = ti.id
      WHERE s.code = 'CAB'
        AND ti.options->>'item_code' = 'cab_modulos_tango'
        AND jsonb_typeof(ar.value) = 'array'
    )
    SELECT modulo AS key, COUNT(*)::int AS n
    FROM modulos
    GROUP BY modulo
    ORDER BY n DESC, key ASC
  `;
}

export async function fetchIndicesGlobal(filters: MercadoFilters): Promise<IndexGlobalRow> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  const [row] = await sql<IndexGlobalRow[]>`
    SELECT
      COUNT(ac.indice_it)::int AS n_it,
      COUNT(ac.indice_erp)::int AS n_erp,
      ROUND(AVG(ac.indice_it))::int AS avg_it,
      ROUND(AVG(ac.indice_erp))::int AS avg_erp
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
      AND (
        ${f.provincia}::text IS NULL
        OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
           = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
      )
      AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
      AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
  `;
  return row ?? { n_it: 0, n_erp: 0, avg_it: null, avg_erp: null };
}

export async function fetchIndicesBySegment(filters: MercadoFilters): Promise<IndexGroupRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<IndexGroupRow[]>`
    SELECT
      a.segment AS key,
      COUNT(*)::int AS n,
      ROUND(AVG(ac.indice_it))::int AS avg_it,
      ROUND(AVG(ac.indice_erp))::int AS avg_erp
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
      AND (
        ${f.provincia}::text IS NULL
        OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
           = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
      )
      AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
      AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
    GROUP BY a.segment
    ORDER BY a.segment
  `;
}

export async function fetchIndicesByRubro(filters: MercadoFilters): Promise<IndexGroupRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<IndexGroupRow[]>`
    SELECT
      COALESCE(NULLIF(btrim(c.rubro), ''), 'Sin rubro') AS key,
      COUNT(*)::int AS n,
      ROUND(AVG(ac.indice_it))::int AS avg_it,
      ROUND(AVG(ac.indice_erp))::int AS avg_erp
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
      AND (
        ${f.provincia}::text IS NULL
        OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
           = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
      )
      AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
      AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
    GROUP BY 1
    ORDER BY n DESC, key ASC
  `;
}

export async function fetchIndicesRaw(filters: MercadoFilters): Promise<IndexRawRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<IndexRawRow[]>`
    SELECT ac.indice_it, ac.indice_erp
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
      AND (
        ${f.provincia}::text IS NULL
        OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
           = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
      )
      AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
      AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
  `;
}

export async function fetchMonthlySeries(filters: MercadoFilters): Promise<MonthlyRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<MonthlyRow[]>`
    SELECT
      date_trunc('month', a.closed_at) AS month,
      COUNT(*)::int AS n,
      ROUND(AVG(ac.indice_it))::int AS avg_it,
      ROUND(AVG(ac.indice_erp))::int AS avg_erp
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND a.closed_at IS NOT NULL
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
      AND (
        ${f.provincia}::text IS NULL
        OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
           = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
      )
      AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
      AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
    GROUP BY 1
    ORDER BY 1
  `;
}

export async function fetchUpsellAggregate(filters: MercadoFilters): Promise<UpsellRow> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  const [row] = await sql<UpsellRow[]>`
    SELECT
      COALESCE(SUM(jsonb_array_length(ac.upsell_findings)), 0)::int AS total,
      COUNT(*) FILTER (WHERE jsonb_array_length(ac.upsell_findings) > 0)::int AS audits_with_findings,
      COUNT(*)::int AS universe_n
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
      AND (
        ${f.provincia}::text IS NULL
        OR lower(btrim(regexp_replace(c.provincia, '[[:space:]]+', ' ', 'g')))
           = lower(btrim(regexp_replace(${f.provincia}, '[[:space:]]+', ' ', 'g')))
      )
      AND (${f.from}::timestamptz IS NULL OR a.closed_at >= ${f.from})
      AND (${f.to}::timestamptz IS NULL OR a.closed_at <= ${f.to})
  `;
  return row ?? { total: 0, audits_with_findings: 0, universe_n: 0 };
}

export async function listMercadoRubros(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<{ rubro: string }[]>`
    SELECT DISTINCT btrim(c.rubro) AS rubro
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE a.status = 'cerrada'
      AND c.rubro IS NOT NULL
      AND btrim(c.rubro) <> ''
    ORDER BY rubro
  `;
  return rows.map((r) => r.rubro);
}

// ── #43 — Queries de los 5 bloques accionables ────────────────────────────────

export type ErpRawRow = {
  erp_actual: string | null;
  rubro: string | null;
  segment: string | null;
};

export type ProvinciaRow = { provincia: string | null; n: number };

export type CountRow = { key: string; n: number };

export type TangoInstalledRow = { n: number; avg_erp: number | null };

export type ModuleAdoptionRow = { modulo: string; n: number };

/** #43 — Provincias normalizadas presentes en el universo de cerradas, para poblar el filtro (R4). */
export async function listMercadoProvincias(): Promise<Array<{ provincia: string }>> {
  const sql = getSql();
  return sql<{ provincia: string }[]>`
    SELECT DISTINCT btrim(c.provincia) AS provincia
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE a.status = 'cerrada'
      AND c.provincia IS NOT NULL
      AND btrim(c.provincia) <> ''
    ORDER BY provincia
  `;
}

/** #43 — Filas crudas (erp/rubro/segment) por auditoría cerrada; agrupación en TS (R6, R7). */
export async function fetchErpRawForGrouping(filters: MercadoFilters): Promise<ErpRawRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<ErpRawRow[]>`
    SELECT c.erp_actual, c.rubro, a.segment
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE ${baseAuditWhere(sql, f)}
  `;
}

/** #43 — Distribución por provincia cruda; normalización/bucket `Sin dato` en TS (R8). */
export async function fetchProvinciaDistribution(
  filters: MercadoFilters
): Promise<ProvinciaRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<ProvinciaRow[]>`
    SELECT btrim(c.provincia) AS provincia, COUNT(*)::int AS n
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE ${baseAuditWhere(sql, f)}
    GROUP BY btrim(c.provincia)
  `;
}

/** #43 — Conteo por rubro con bucket `Sin rubro` (R9). */
export async function fetchCountsByRubro(filters: MercadoFilters): Promise<CountRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<CountRow[]>`
    SELECT COALESCE(NULLIF(btrim(c.rubro), ''), 'Sin rubro') AS key, COUNT(*)::int AS n
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE ${baseAuditWhere(sql, f)}
    GROUP BY 1
    ORDER BY n DESC, key ASC
  `;
}

/** #43 — Conteo por segmento (R9). */
export async function fetchCountsBySegment(filters: MercadoFilters): Promise<CountRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<CountRow[]>`
    SELECT a.segment AS key, COUNT(*)::int AS n
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE ${baseAuditWhere(sql, f)}
    GROUP BY a.segment
    ORDER BY a.segment
  `;
}

/**
 * #43 — Base instalada Tango (R10): nº de auditorías cerradas de usuarios Tango (`erp_actual` con
 * keyword `tango`, mismo criterio que `classifyErp`) y promedio de `indice_erp` (NULLs excluidos por
 * AVG). La supresión n<3 se aplica en TS.
 */
export async function fetchTangoInstalledBase(
  filters: MercadoFilters
): Promise<TangoInstalledRow> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  const [row] = await sql<TangoInstalledRow[]>`
    SELECT COUNT(*)::int AS n, ROUND(AVG(ac.indice_erp))::int AS avg_erp
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE ${baseAuditWhere(sql, f)}
      AND c.erp_actual IS NOT NULL
      AND lower(c.erp_actual) LIKE '%tango%'
  `;
  return row ?? { n: 0, avg_erp: null };
}

/**
 * #43 — Catálogo de módulos Tango (R11): `choices` del `template_item` `cab_modulos_tango`,
 * restringido a los templates presentes en las auditorías Tango del universo, para que aparezcan
 * también los módulos nunca adoptados (faltantes = cross-sell).
 */
export async function fetchTangoModuleCatalog(filters: MercadoFilters): Promise<string[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  const rows = await sql<{ modulo: string }[]>`
    WITH base AS (
      SELECT a.template_ids
      FROM audit a
      JOIN empresa c ON c.id = a.empresa_id
      WHERE ${baseAuditWhere(sql, f)}
        AND c.erp_actual IS NOT NULL
        AND lower(c.erp_actual) LIKE '%tango%'
    ),
    tpl AS (
      SELECT DISTINCT unnest(template_ids) AS template_id FROM base
    )
    SELECT DISTINCT jsonb_array_elements_text(ti.options->'choices') AS modulo
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    JOIN tpl ON tpl.template_id = s.template_id
    WHERE ti.options->>'item_code' = 'cab_modulos_tango'
  `;
  return rows.map((r) => r.modulo);
}

/** #43 — Adopción de módulos entre las auditorías Tango del universo (R11). */
export async function fetchTangoModuleAdoption(
  filters: MercadoFilters
): Promise<ModuleAdoptionRow[]> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  return sql<ModuleAdoptionRow[]>`
    WITH base AS (
      SELECT a.id, a.template_ids
      FROM audit a
      JOIN empresa c ON c.id = a.empresa_id
      WHERE ${baseAuditWhere(sql, f)}
        AND c.erp_actual IS NOT NULL
        AND lower(c.erp_actual) LIKE '%tango%'
    ),
    modulos AS (
      SELECT jsonb_array_elements_text(ar.value) AS modulo
      FROM base b
      JOIN section s ON s.template_id = ANY(b.template_ids)
      JOIN template_item ti ON ti.section_id = s.id
      JOIN audit_response ar ON ar.audit_id = b.id AND ar.item_id = ti.id
      WHERE s.code = 'CAB'
        AND ti.options->>'item_code' = 'cab_modulos_tango'
        AND jsonb_typeof(ar.value) = 'array'
    )
    SELECT modulo, COUNT(*)::int AS n
    FROM modulos
    GROUP BY modulo
  `;
}

/**
 * #43 — Textos de hallazgos del universo (R12). Devuelve solo los strings para clasificarlos en TS
 * (`classifyFinding`); **nunca** se incluyen en el payload (R13, frontera en `aggregate.ts`).
 */
export async function fetchFindingsTexts(
  filters: MercadoFilters
): Promise<{ topRisks: string[]; quickWins: string[] }> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  const [risks, wins] = await Promise.all([
    sql<{ text: string | null }[]>`
      SELECT (jsonb_array_elements(ac.top_risks)->>'text') AS text
      FROM audit a
      JOIN empresa c ON c.id = a.empresa_id
      JOIN audit_closure ac ON ac.audit_id = a.id
      WHERE ${baseAuditWhere(sql, f)}
        AND jsonb_typeof(ac.top_risks) = 'array'
    `,
    sql<{ text: string | null }[]>`
      SELECT jsonb_array_elements_text(ac.quick_wins) AS text
      FROM audit a
      JOIN empresa c ON c.id = a.empresa_id
      JOIN audit_closure ac ON ac.audit_id = a.id
      WHERE ${baseAuditWhere(sql, f)}
        AND jsonb_typeof(ac.quick_wins) = 'array'
    `
  ]);
  const clean = (rows: { text: string | null }[]) =>
    rows
      .map((r) => (r.text ?? '').trim())
      .filter((t) => t.length > 0);
  return { topRisks: clean(risks), quickWins: clean(wins) };
}

export type RiskRetentionRow = {
  universe_empresas: number;
  ex_cliente: number;
  inactiva: number;
  at_risk: number;
};

/**
 * #43 — Riesgo / retención (R14, R15): sobre las empresas distintas con ≥1 auditoría cerrada en el
 * universo filtrado, cuenta ex_cliente, estado efectivo `inactiva` y la unión (at_risk). El estado
 * efectivo se deriva reutilizando `estadoSelectSql` (fuente única, sin un tercer `CASE`).
 */
export async function fetchRiskRetention(filters: MercadoFilters): Promise<RiskRetentionRow> {
  const sql = getSql();
  const f = toSqlFilters(filters);
  const [row] = await sql<RiskRetentionRow[]>`
    WITH universo AS (
      SELECT DISTINCT a.empresa_id
      FROM audit a
      JOIN empresa c ON c.id = a.empresa_id
      WHERE ${baseAuditWhere(sql, f)}
    ),
    est AS (${estadoSelectSql(sql)})
    SELECT
      COUNT(DISTINCT e.id)::int AS universe_empresas,
      COUNT(DISTINCT e.id) FILTER (WHERE e.relacion = 'ex_cliente')::int AS ex_cliente,
      COUNT(DISTINCT e.id) FILTER (WHERE est.estado = 'inactiva')::int AS inactiva,
      COUNT(DISTINCT e.id) FILTER (
        WHERE e.relacion = 'ex_cliente' OR est.estado = 'inactiva'
      )::int AS at_risk
    FROM empresa e
    JOIN universo u ON u.empresa_id = e.id
    JOIN est ON est.id = e.id
  `;
  return row ?? { universe_empresas: 0, ex_cliente: 0, inactiva: 0, at_risk: 0 };
}
