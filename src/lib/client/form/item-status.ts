export type ItemStatus = 'pendiente' | 'respondido' | 'con_observacion';

/**
 * Determina el estado visual de un ítem del form.
 * Pura: sin efectos, sin I/O. Cubre R1–R4.
 */
export function itemStatus(params: {
  value: unknown;
  na: boolean;
  notes?: string | null;
}): ItemStatus {
  const answered = isAnswered(params.value, params.na);
  if (answered && params.notes && params.notes.trim() !== '') {
    return 'con_observacion';
  }
  if (answered) return 'respondido';
  return 'pendiente';
}

function isAnswered(value: unknown, na: boolean): boolean {
  if (na) return true;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (
    typeof value === 'object' &&
    'rows' in (value as object) &&
    Array.isArray((value as { rows: unknown[] }).rows) &&
    (value as { rows: unknown[] }).rows.length === 0
  )
    return false;
  return true;
}

/**
 * Conteo de progreso por sección. Cubre R18–R19.
 */
export function sectionProgress(
  items: Array<{ value: unknown; na: boolean; notes?: string | null }>
): { answered: number; total: number } {
  const answered = items.filter((it) => itemStatus(it) !== 'pendiente').length;
  return { answered, total: items.length };
}
