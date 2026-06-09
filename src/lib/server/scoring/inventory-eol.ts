import {
  EOL_STATUS_SCORES,
  INFRA_AGE_THRESHOLDS,
  INFRA_EQUIPMENT_TYPES,
  PC_AGE_THRESHOLDS,
  PC_EQUIPMENT_TYPES
} from './constants';
import type { ScorePoints } from './types';

const EOL_KEYS = ['estado_eol', 'soporte', 'eol_status'] as const;
const TYPE_KEYS = ['tipo', 'categoria', 'type'] as const;
const AGE_KEYS = ['antiguedad', 'fecha_compra', 'anio', 'year'] as const;

function normalizeRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value as Array<Record<string, unknown>>;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)) {
    return ((value as { rows: Array<Record<string, unknown>> }).rows ?? []).map((row) =>
      row.cells && typeof row.cells === 'object' ? (row.cells as Record<string, unknown>) : row
    );
  }
  return [];
}

function pickField(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return undefined;
}

function normalizeEquipmentFamily(raw: unknown): 'pc' | 'infra' | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (PC_EQUIPMENT_TYPES.has(key)) return 'pc';
  if (INFRA_EQUIPMENT_TYPES.has(key)) return 'infra';
  if (key.includes('servidor') || key.includes('switch') || key.includes('firewall')) {
    return 'infra';
  }
  if (key.includes('notebook') || key.includes('laptop') || key.includes('pc')) {
    return 'pc';
  }
  return null;
}

function scoreFromEolStatus(raw: unknown): ScorePoints {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (key in EOL_STATUS_SCORES) {
    return EOL_STATUS_SCORES[key as keyof typeof EOL_STATUS_SCORES];
  }
  return null;
}

function computeAgeYears(raw: unknown, referenceDate: Date): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1900 && raw < 2100) {
      return referenceDate.getFullYear() - raw;
    }
    return raw;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const asYear = Number(trimmed);
    if (Number.isFinite(asYear) && asYear > 1900 && asYear < 2100) {
      return referenceDate.getFullYear() - asYear;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      const diffMs = referenceDate.getTime() - parsed;
      return diffMs / (365.25 * 24 * 60 * 60 * 1000);
    }
  }

  return null;
}

function scoreFromAge(ageYears: number, family: 'pc' | 'infra'): ScorePoints {
  const thresholds = family === 'pc' ? PC_AGE_THRESHOLDS : INFRA_AGE_THRESHOLDS;
  if (ageYears < thresholds.freshMax) return 100;
  if (ageYears <= thresholds.extendedMax) return 50;
  return 0;
}

export function scoreInventoryRow(
  row: Record<string, unknown>,
  referenceDate: Date
): { points: ScorePoints; rule: string } {
  const eolRaw = pickField(row, EOL_KEYS);
  const eolScore = scoreFromEolStatus(eolRaw);
  if (eolScore !== null) {
    return { points: eolScore, rule: `eol:${String(eolRaw)}→${eolScore}` };
  }

  const typeRaw = pickField(row, TYPE_KEYS);
  const family = normalizeEquipmentFamily(typeRaw) ?? 'pc';
  const ageRaw = pickField(row, AGE_KEYS);
  const ageYears = computeAgeYears(ageRaw, referenceDate);

  if (ageYears === null) {
    return { points: null, rule: 'eol:no-data' };
  }

  const points = scoreFromAge(ageYears, family);
  return { points, rule: `age:${family}:${ageYears.toFixed(1)}a→${points}` };
}

export function scoreInventoryTable(
  value: unknown,
  referenceDate: Date
): { points: ScorePoints; rule: string } {
  const rows = normalizeRows(value);
  if (rows.length === 0) {
    return { points: null, rule: 'table:empty' };
  }

  const rowScores: number[] = [];
  const rules: string[] = [];

  for (const row of rows) {
    const result = scoreInventoryRow(row, referenceDate);
    if (result.points !== null) {
      rowScores.push(result.points);
      rules.push(result.rule);
    }
  }

  if (rowScores.length === 0) {
    return { points: null, rule: 'table:no-scoring-rows' };
  }

  const avg = Math.round(rowScores.reduce((a, b) => a + b, 0) / rowScores.length);
  const points = (avg <= 0 ? 0 : avg >= 100 ? 100 : avg <= 25 ? 0 : avg <= 75 ? 50 : 100) as
    | 0
    | 50
    | 100;

  return { points, rule: `table:avg(${rules.join(';')})→${points}` };
}
