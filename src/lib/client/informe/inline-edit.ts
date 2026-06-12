/**
 * Edición inline por bloque (R30): mapeo data-field ↔ path del client_draft,
 * serialización a texto plano y debounce del autosave.
 */

/** textContent del bloque: descarta cualquier HTML pegado (texto plano). */
export function serializeBlockText(el: { textContent: string | null }): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Devuelve una copia profunda del draft con el path (`a.b.0.c`) seteado a `text`. */
export function setFieldOnDraft<T>(draft: T, path: string, text: string): T {
  const clone = structuredClone(draft) as unknown;
  const parts = path.split('.');
  let node: unknown = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (node === null || typeof node !== 'object') {
      throw new Error(`Path inválido en draft: ${path}`);
    }
    node = (node as Record<string, unknown>)[key];
  }
  const last = parts[parts.length - 1];
  if (node === null || typeof node !== 'object') {
    throw new Error(`Path inválido en draft: ${path}`);
  }
  (node as Record<string, unknown>)[last] = text;
  return clone as T;
}

/** Lee el valor actual de un path del draft (para revertir ante error). */
export function getFieldFromDraft(draft: unknown, path: string): unknown {
  let node: unknown = draft;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Debounce simple (autosave 1 s, R31). */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const INLINE_AUTOSAVE_DEBOUNCE_MS = 1000;
