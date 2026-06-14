import { getSql } from '$lib/server/db/client';
import type { MercadoFilters } from './filters';

type SqlFilters = {
  segment: string | null;
  rubro: string | null;
  from: Date | null;
  to: Date | null;
};

function toSqlFilters(filters: MercadoFilters): SqlFilters {
  return {
    segment: filters.segment ?? null,
    rubro: filters.rubro ?? null,
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
    JOIN client c ON c.id = a.client_id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
      JOIN client c ON c.id = a.client_id
      WHERE a.status = 'cerrada'
        AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
        AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
      JOIN client c ON c.id = a.client_id
      WHERE a.status = 'cerrada'
        AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
        AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
    JOIN client c ON c.id = a.client_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
    JOIN client c ON c.id = a.client_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
    JOIN client c ON c.id = a.client_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
    JOIN client c ON c.id = a.client_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
    JOIN client c ON c.id = a.client_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND a.closed_at IS NOT NULL
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
    JOIN client c ON c.id = a.client_id
    JOIN audit_closure ac ON ac.audit_id = a.id
    WHERE a.status = 'cerrada'
      AND (${f.segment}::text IS NULL OR a.segment = ${f.segment})
      AND (${f.rubro}::text IS NULL OR c.rubro = ${f.rubro})
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
    JOIN client c ON c.id = a.client_id
    WHERE a.status = 'cerrada'
      AND c.rubro IS NOT NULL
      AND btrim(c.rubro) <> ''
    ORDER BY rubro
  `;
  return rows.map((r) => r.rubro);
}
