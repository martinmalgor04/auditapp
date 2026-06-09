import type { AuditProgress } from '$lib/backoffice/progress-types';

export type { AuditProgress };

export type ProgressItem = { id: string; field_type: string };
export type ProgressResponse = { item_id: string; value: unknown; na: boolean };

function isValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/** Ítem completado si na=true o value no vacío según field_type. */
export function isItemCompleted(
  _fieldType: string,
  value: unknown,
  na: boolean
): boolean {
  if (na) {
    return true;
  }
  return !isValueEmpty(value);
}

/** Calcula progreso de una auditoría a partir de ítems y respuestas. */
export function computeAuditProgress(
  items: ProgressItem[],
  responses: ProgressResponse[]
): AuditProgress {
  const responseMap = new Map(responses.map((r) => [r.item_id, r]));
  const total = items.length;

  if (total === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }

  let completed = 0;
  for (const item of items) {
    const response = responseMap.get(item.id);
    if (response && isItemCompleted(item.field_type, response.value, response.na)) {
      completed++;
    }
  }

  const percent = Math.round((completed / total) * 100);
  return { completed, total, percent };
}
