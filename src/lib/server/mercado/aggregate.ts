import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import type { MercadoFilters } from './filters';
import {
  fetchErpDistribution,
  fetchIndicesByRubro,
  fetchIndicesBySegment,
  fetchIndicesGlobal,
  fetchIndicesRaw,
  fetchModulosTango,
  fetchMonthlySeries,
  fetchUniverseCount,
  fetchUpsellAggregate
} from './queries';

export const MIN_GROUP_N = 3;

export type GroupStat = {
  key: string;
  n: number;
  avg_it: number | null;
  avg_erp: number | null;
  suppressed: boolean;
};

export type MercadoDashboard = {
  universe: { n: number; from: string | null; to: string | null };
  erp_distribution: Array<{ key: string; n: number; pct: number }>;
  modulos_tango: Array<{ key: string; n: number }>;
  indices_global: {
    n_it: number;
    n_erp: number;
    avg_it: number | null;
    avg_erp: number | null;
  };
  indices_by_segment: GroupStat[];
  indices_by_rubro: GroupStat[];
  semaforos: {
    it: { verde: number; amarillo: number; rojo: number; sin_dato: number };
    erp: { verde: number; amarillo: number; rojo: number; sin_dato: number };
  };
  monthly: Array<{ month: string; n: number; avg_it: number | null; avg_erp: number | null }>;
  upsell_internal: {
    total: number;
    avg_per_audit: number | null;
    audits_with_findings: number;
  };
};

type SemaphoreCounts = {
  verde: number;
  amarillo: number;
  rojo: number;
  sin_dato: number;
};

function emptySemaforos(): SemaphoreCounts {
  return { verde: 0, amarillo: 0, rojo: 0, sin_dato: 0 };
}

function classifySemaforos(rows: Array<{ indice_it: number | null; indice_erp: number | null }>): {
  it: SemaphoreCounts;
  erp: SemaphoreCounts;
} {
  const it = emptySemaforos();
  const erp = emptySemaforos();

  for (const row of rows) {
    if (row.indice_it === null) {
      it.sin_dato += 1;
    } else {
      const s = indexToSemaphore(row.indice_it);
      if (s === 'green') it.verde += 1;
      else if (s === 'amber') it.amarillo += 1;
      else it.rojo += 1;
    }

    if (row.indice_erp === null) {
      erp.sin_dato += 1;
    } else {
      const s = indexToSemaphore(row.indice_erp);
      if (s === 'green') erp.verde += 1;
      else if (s === 'amber') erp.amarillo += 1;
      else erp.rojo += 1;
    }
  }

  return { it, erp };
}

function applyGroupSuppression(
  rows: Array<{ key: string; n: number; avg_it: number | null; avg_erp: number | null }>
): GroupStat[] {
  return rows.map((row) => {
    const suppressed = row.n < MIN_GROUP_N;
    return {
      key: row.key,
      n: row.n,
      avg_it: suppressed ? null : row.avg_it,
      avg_erp: suppressed ? null : row.avg_erp,
      suppressed
    };
  });
}

function withPctDistribution(rows: Array<{ key: string; n: number }>, total: number) {
  return rows.map((row) => ({
    key: row.key,
    n: row.n,
    pct: total === 0 ? 0 : Math.round((row.n / total) * 1000) / 10
  }));
}

function formatMonth(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatFilterDate(d: Date | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export async function buildMercadoDashboard(filters: MercadoFilters): Promise<MercadoDashboard> {
  const [
    universeN,
    erpRows,
    modulosRows,
    indicesGlobal,
    indicesSegment,
    indicesRubro,
    indicesRaw,
    monthlyRows,
    upsellRow
  ] = await Promise.all([
    fetchUniverseCount(filters),
    fetchErpDistribution(filters),
    fetchModulosTango(filters),
    fetchIndicesGlobal(filters),
    fetchIndicesBySegment(filters),
    fetchIndicesByRubro(filters),
    fetchIndicesRaw(filters),
    fetchMonthlySeries(filters),
    fetchUpsellAggregate(filters)
  ]);

  const semaforos = classifySemaforos(indicesRaw);

  return {
    universe: {
      n: universeN,
      from: formatFilterDate(filters.from),
      to: formatFilterDate(filters.to)
    },
    erp_distribution: withPctDistribution(erpRows, universeN),
    modulos_tango: modulosRows,
    indices_global: indicesGlobal,
    indices_by_segment: applyGroupSuppression(indicesSegment),
    indices_by_rubro: applyGroupSuppression(indicesRubro),
    semaforos,
    monthly: monthlyRows.map((row) => ({
      month: formatMonth(row.month),
      n: row.n,
      avg_it: row.avg_it,
      avg_erp: row.avg_erp
    })),
    upsell_internal: {
      total: upsellRow.total,
      avg_per_audit:
        upsellRow.universe_n === 0 ? null : upsellRow.total / upsellRow.universe_n,
      audits_with_findings: upsellRow.audits_with_findings
    }
  };
}
