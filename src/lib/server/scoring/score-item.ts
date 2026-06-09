import { scoreInventoryTable } from './inventory-eol';
import type { ItemScoreResult, ScoreItemInput } from './types';

type Threshold = { min: number; max: number; score: 0 | 50 | 100 };

const TRI_DEFAULT: Record<string, 0 | 50 | 100> = {
  si: 100,
  parcial: 50,
  no: 0
};

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

function scoreFromThresholds(value: number, thresholds: Threshold[]): 0 | 50 | 100 | null {
  for (const t of thresholds) {
    if (value >= t.min && value <= t.max) {
      return t.score;
    }
  }
  return null;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function scoreMultiselect(
  value: unknown,
  scoreMap: Record<string, 0 | 50 | 100>
): 0 | 50 | 100 | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const scores = (value as string[])
    .map((v) => scoreMap[v])
    .filter((s): s is 0 | 50 | 100 => s === 0 || s === 50 || s === 100);
  if (scores.length === 0) return null;
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  if (avg <= 0) return 0;
  if (avg >= 100) return 100;
  if (avg <= 25) return 0;
  if (avg <= 75) return 50;
  return 100;
}

export function scoreItem(input: ScoreItemInput): ItemScoreResult {
  if (!input.scores) {
    if (input.required && (input.na || isEmptyValue(input.value))) {
      return { points: 0, rule: 'required:non-scoring→0' };
    }
    return { points: null, rule: 'non-scoring' };
  }

  if (input.na) {
    return { points: null, rule: 'na' };
  }

  if (isEmptyValue(input.value)) {
    if (input.required) {
      return { points: 0, rule: 'required:empty→0' };
    }
    return { points: null, rule: 'empty' };
  }

  const { fieldType, options, value } = input;
  const referenceDate = input.referenceDate ?? new Date();

  switch (fieldType) {
    case 'bool': {
      const points = value === true ? 100 : 0;
      return { points, rule: `bool:${String(value)}→${points}` };
    }
    case 'tri': {
      const scoreMap = (options.score_map as Record<string, 0 | 50 | 100> | undefined) ?? TRI_DEFAULT;
      const key = String(value);
      const points = scoreMap[key] ?? null;
      return points === null
        ? { points: null, rule: 'tri:unknown' }
        : { points, rule: `tri:${key}→${points}` };
    }
    case 'select': {
      const scoreMap = options.score_map as Record<string, 0 | 50 | 100> | undefined;
      if (!scoreMap) return { points: null, rule: 'select:no-map' };
      const key = String(value);
      const points = scoreMap[key] ?? null;
      return points === null
        ? { points: null, rule: 'select:unknown' }
        : { points, rule: `select:${key}→${points}` };
    }
    case 'multiselect': {
      const scoreMap = options.score_map as Record<string, 0 | 50 | 100> | undefined;
      if (!scoreMap) return { points: null, rule: 'multiselect:no-map' };
      const points = scoreMultiselect(value, scoreMap);
      return points === null
        ? { points: null, rule: 'multiselect:empty' }
        : { points, rule: `multiselect→${points}` };
    }
    case 'number':
    case 'money': {
      const thresholds = asThresholds(options.thresholds);
      if (thresholds.length === 0 || typeof value !== 'number') {
        return { points: null, rule: 'thresholds:missing' };
      }
      const points = scoreFromThresholds(value, thresholds);
      return points === null
        ? { points: null, rule: 'thresholds:out-of-range' }
        : { points, rule: `thresholds:${value}→${points}` };
    }
    case 'table': {
      const result = scoreInventoryTable(value, referenceDate);
      return { points: result.points, rule: result.rule };
    }
    default:
      return { points: null, rule: 'informativo' };
  }
}
