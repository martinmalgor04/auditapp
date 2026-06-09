import type { ScoringFieldType } from './types';

export type ScoreValue = 0 | 50 | 100;

const TRI_DEFAULT: Record<string, ScoreValue> = {
  si: 100,
  parcial: 50,
  no: 0
};

type Threshold = { min: number; max: number; score: ScoreValue };

function asThresholds(raw: unknown): Threshold[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is Threshold =>
      typeof t === 'object' &&
      t !== null &&
      typeof (t as Threshold).min === 'number' &&
      typeof (t as Threshold).max === 'number' &&
      [0, 50, 100].includes((t as Threshold).score)
  );
}

function scoreFromThresholds(value: number, thresholds: Threshold[]): ScoreValue | null {
  for (const t of thresholds) {
    if (value >= t.min && value <= t.max) {
      return t.score;
    }
  }
  return null;
}

function normalizeTableRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value as Array<Record<string, unknown>>;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)) {
    return ((value as { rows: Array<{ cells?: Record<string, unknown> } & Record<string, unknown>> })
      .rows ?? []).map((row) => (row.cells ? row.cells : row));
  }
  return [];
}

/** Puntaje 0/50/100 de un ítem según rúbrica en options. null = no aplica (sin valor). */
export function computeItemScore(input: {
  fieldType: ScoringFieldType;
  options: unknown;
  value: unknown;
}): ScoreValue | null {
  const opts = (input.options ?? {}) as Record<string, unknown>;
  const { fieldType, value } = input;

  if (value === null || value === undefined || value === '') {
    return null;
  }

  switch (fieldType) {
    case 'select': {
      const scoreMap = opts.score_map as Record<string, ScoreValue> | undefined;
      if (!scoreMap) return null;
      const key = String(value);
      return scoreMap[key] ?? null;
    }
    case 'multiselect': {
      const scoreMap = opts.score_map as Record<string, ScoreValue> | undefined;
      if (!scoreMap || !Array.isArray(value) || value.length === 0) return null;
      const scores = (value as string[])
        .map((v) => scoreMap[v])
        .filter((s): s is ScoreValue => s === 0 || s === 50 || s === 100);
      if (scores.length === 0) return null;
      const avg = scores.reduce((a: number, b) => a + b, 0) / scores.length;
      const rounded = Math.round(avg);
      if (rounded <= 0) return 0;
      if (rounded >= 100) return 100;
      if (rounded <= 25) return 0;
      if (rounded <= 75) return 50;
      return 100;
    }
    case 'tri': {
      const scoreMap = (opts.score_map as Record<string, ScoreValue> | undefined) ?? TRI_DEFAULT;
      const key = String(value);
      return scoreMap[key] ?? null;
    }
    case 'bool':
      return value === true ? 100 : 0;
    case 'number':
    case 'money': {
      const thresholds = asThresholds(opts.thresholds);
      if (thresholds.length === 0 || typeof value !== 'number') return null;
      return scoreFromThresholds(value, thresholds);
    }
    case 'table': {
      const eolRules = opts.eol_rules as Record<string, ScoreValue> | undefined;
      if (!eolRules) return null;
      const rows = normalizeTableRows(value);
      if (rows.length === 0) return null;
      const eolKey = 'estado_eol';
      const rowScores: ScoreValue[] = [];
      for (const row of rows) {
        const estado = row[eolKey];
        if (typeof estado === 'string' && estado in eolRules) {
          rowScores.push(eolRules[estado]!);
        }
      }
      if (rowScores.length === 0) return null;
      const avg = rowScores.reduce((a: number, b) => a + b, 0) / rowScores.length;
      const rounded = Math.round(avg);
      if (rounded <= 0) return 0;
      if (rounded >= 100) return 100;
      if (rounded <= 25) return 0;
      if (rounded <= 75) return 50;
      return 100;
    }
    default:
      return null;
  }
}
