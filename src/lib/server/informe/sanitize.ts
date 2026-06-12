/**
 * Sanitización de la edición inline (R30): el contenido editado se serializa
 * como texto plano — cualquier HTML embebido se descarta también server-side.
 */

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHtmlDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return stripHtml(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripHtmlDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = stripHtmlDeep(v);
    }
    return out as T;
  }
  return value;
}
