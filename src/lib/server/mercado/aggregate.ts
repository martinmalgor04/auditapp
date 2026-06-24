import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import {
  classifyErp,
  classifyFinding,
  normalizeProvincia,
  type ErpGroup,
  type FindingCategory
} from './classify';
import type { MercadoFilters } from './filters';
import {
  fetchCountsByRubro,
  fetchCountsBySegment,
  fetchErpDistribution,
  fetchErpRawForGrouping,
  fetchFindingsTexts,
  fetchIndicesByRubro,
  fetchIndicesBySegment,
  fetchIndicesGlobal,
  fetchIndicesRaw,
  fetchModulosTango,
  fetchMonthlySeries,
  fetchProvinciaDistribution,
  fetchRiskRetention,
  fetchTangoInstalledBase,
  fetchTangoModuleAdoption,
  fetchTangoModuleCatalog,
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

// ── #43 — tipos de los 5 bloques accionables ──────────────────────────────────

export type ErpGroupCount = { group: ErpGroup; n: number; pct: number };

export type MarketGroupCut = {
  key: string;
  n: number;
  groups: Record<ErpGroup, number> | null;
  suppressed: boolean;
};

export type CountBucket = { key: string; n: number };

export type ProvinciaBucket = { key: string; n: number; is_nea: boolean };

export type ModuleAdoption = {
  key: string;
  adopted: number;
  missing: number;
  adoption_pct: number;
};

export type FindingCount = { category: FindingCategory; n: number };

export type TangoOpportunity = {
  overall: ErpGroupCount[];
  by_rubro: MarketGroupCut[];
  by_segment: MarketGroupCut[];
};

export type NeaMap = {
  by_provincia: ProvinciaBucket[];
  by_rubro: CountBucket[];
  by_segment: CountBucket[];
};

export type InstalledBase = {
  tango_users_n: number;
  avg_erp: number | null;
  suppressed: boolean;
  modules: ModuleAdoption[];
};

export type RecurringFindings = {
  internal: true;
  top_risks: FindingCount[];
  quick_wins: FindingCount[];
  total_risks: number;
  total_quick_wins: number;
};

export type RiskRetention = {
  internal: true;
  universe_empresas: number;
  ex_cliente: number | null;
  inactiva: number | null;
  at_risk: number | null;
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
  // ── bloques #43 (aditivos, R20) ──
  tango_opportunity: TangoOpportunity;
  nea_map: NeaMap;
  installed_base: InstalledBase;
  recurring_findings: RecurringFindings;
  risk_retention: RiskRetention;
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

const ERP_GROUPS: readonly ErpGroup[] = ['tango', 'competidor', 'sin_erp'];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyGroupCounts(): Record<ErpGroup, number> {
  return { tango: 0, competidor: 0, sin_erp: 0 };
}

/** R6 — distribución agrupada de ERP sobre el universo, con % sin división por cero. */
function buildErpOverall(rows: Array<{ erp_actual: string | null }>): ErpGroupCount[] {
  const counts = emptyGroupCounts();
  for (const row of rows) {
    counts[classifyErp(row.erp_actual)] += 1;
  }
  const total = rows.length;
  return ERP_GROUPS.map((group) => ({
    group,
    n: counts[group],
    pct: total === 0 ? 0 : round1((counts[group] / total) * 100)
  }));
}

/** R7 — cruce ERP × dimensión (rubro/segmento) con supresión n<3 del desglose por grupo. */
function buildErpCuts(
  rows: Array<{ erp_actual: string | null; rubro: string | null; segment: string | null }>,
  dimension: 'rubro' | 'segment'
): MarketGroupCut[] {
  const buckets = new Map<string, { erp_actual: string | null }[]>();
  for (const row of rows) {
    const key =
      dimension === 'rubro'
        ? (row.rubro?.trim() ? row.rubro.trim() : 'Sin rubro')
        : (row.segment ?? 'Sin segmento');
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const cuts: MarketGroupCut[] = [];
  for (const [key, bucketRows] of buckets) {
    const n = bucketRows.length;
    const suppressed = n < MIN_GROUP_N;
    if (suppressed) {
      cuts.push({ key, n, groups: null, suppressed: true });
      continue;
    }
    const groups = emptyGroupCounts();
    for (const row of bucketRows) {
      groups[classifyErp(row.erp_actual)] += 1;
    }
    cuts.push({ key, n, groups, suppressed: false });
  }
  return cuts.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/** R8 — distribución por provincia normalizada (variantes colapsan por `key`), flag NEA. */
function buildProvinciaBuckets(rows: Array<{ provincia: string | null; n: number }>): ProvinciaBucket[] {
  const buckets = new Map<string, ProvinciaBucket>();
  for (const row of rows) {
    const { key, is_nea } = normalizeProvincia(row.provincia);
    const existing = buckets.get(key);
    if (existing) existing.n += row.n;
    else buckets.set(key, { key, n: row.n, is_nea });
  }
  return [...buckets.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/** R11 — ranking de módulos por adopción ascendente (menos adoptados = más oportunidad). */
function buildModuleAdoption(
  catalog: string[],
  adoption: Array<{ modulo: string; n: number }>,
  nTango: number
): ModuleAdoption[] {
  const adoptedByModule = new Map<string, number>();
  for (const row of adoption) {
    adoptedByModule.set(row.modulo, row.n);
  }
  return catalog
    .map((modulo) => {
      const adopted = adoptedByModule.get(modulo) ?? 0;
      return {
        key: modulo,
        adopted,
        missing: nTango - adopted,
        adoption_pct: nTango === 0 ? 0 : round1((adopted / nTango) * 100)
      };
    })
    .sort((a, b) => a.adopted - b.adopted || a.key.localeCompare(b.key));
}

/** R12 — agrega textos por categoría keyword (ranking desc); nunca emite el texto crudo (R13). */
function buildFindingCounts(texts: string[]): { ranking: FindingCount[]; total: number } {
  const counts = new Map<FindingCategory, number>();
  for (const text of texts) {
    const category = classifyFinding(text);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const ranking = [...counts.entries()]
    .map(([category, n]) => ({ category, n }))
    .sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));
  return { ranking, total: texts.length };
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
    upsellRow,
    erpRaw,
    provinciaRows,
    countsRubro,
    countsSegment,
    tangoBase,
    moduleCatalog,
    moduleAdoption,
    findingsTexts,
    riskRow
  ] = await Promise.all([
    fetchUniverseCount(filters),
    fetchErpDistribution(filters),
    fetchModulosTango(filters),
    fetchIndicesGlobal(filters),
    fetchIndicesBySegment(filters),
    fetchIndicesByRubro(filters),
    fetchIndicesRaw(filters),
    fetchMonthlySeries(filters),
    fetchUpsellAggregate(filters),
    fetchErpRawForGrouping(filters),
    fetchProvinciaDistribution(filters),
    fetchCountsByRubro(filters),
    fetchCountsBySegment(filters),
    fetchTangoInstalledBase(filters),
    fetchTangoModuleCatalog(filters),
    fetchTangoModuleAdoption(filters),
    fetchFindingsTexts(filters),
    fetchRiskRetention(filters)
  ]);

  const semaforos = classifySemaforos(indicesRaw);

  const tangoUsersN = tangoBase.n;
  const installedSuppressed = tangoUsersN < MIN_GROUP_N;
  const risks = buildFindingCounts(findingsTexts.topRisks);
  const quickWins = buildFindingCounts(findingsTexts.quickWins);
  const riskSuppressed = riskRow.universe_empresas < MIN_GROUP_N;

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
    },
    tango_opportunity: {
      overall: buildErpOverall(erpRaw),
      by_rubro: buildErpCuts(erpRaw, 'rubro'),
      by_segment: buildErpCuts(erpRaw, 'segment')
    },
    nea_map: {
      by_provincia: buildProvinciaBuckets(provinciaRows),
      by_rubro: countsRubro,
      by_segment: countsSegment
    },
    installed_base: {
      tango_users_n: tangoUsersN,
      avg_erp: installedSuppressed ? null : tangoBase.avg_erp,
      suppressed: installedSuppressed,
      modules: installedSuppressed
        ? []
        : buildModuleAdoption(moduleCatalog, moduleAdoption, tangoUsersN)
    },
    recurring_findings: {
      internal: true,
      top_risks: risks.ranking,
      quick_wins: quickWins.ranking,
      total_risks: risks.total,
      total_quick_wins: quickWins.total
    },
    risk_retention: {
      internal: true,
      universe_empresas: riskRow.universe_empresas,
      ex_cliente: riskSuppressed ? null : riskRow.ex_cliente,
      inactiva: riskSuppressed ? null : riskRow.inactiva,
      at_risk: riskSuppressed ? null : riskRow.at_risk,
      suppressed: riskSuppressed
    }
  };
}
