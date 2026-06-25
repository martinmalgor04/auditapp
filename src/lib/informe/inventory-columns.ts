/**
 * #45 — Identificación de columnas e ítems de inventario IT.
 *
 * Helper puro reutilizado por el modelo de render (`server/informe/model.ts`).
 * Mapea las columnas de un ítem `table` a los roles tipo/modelo/antigüedad/EOL
 * usando las mismas listas de keys que el motor de scoring
 * (`server/scoring/inventory-eol.ts`), sin tocar dicho motor.
 */
import { AGE_KEYS, EOL_KEYS, TYPE_KEYS } from '$lib/server/scoring/inventory-eol';

export type InventoryColumn = { key: string; label: string; type: string };

export type ResolvedInventoryColumns = {
  tipoKey?: string;
  modeloKey?: string;
  antiguedadKey?: string;
  eolKey?: string;
};

const MODELO_KEYS = ['modelo', 'model', 'categoria_modelo', 'descripcion', 'equipo'] as const;

function matchKey(
  columns: InventoryColumn[],
  keys: readonly string[]
): string | undefined {
  // 1) match exacto por key
  for (const k of keys) {
    const col = columns.find((c) => c.key.trim().toLowerCase() === k);
    if (col) return col.key;
  }
  // 2) heurística por label (contiene)
  for (const k of keys) {
    const col = columns.find((c) => c.label.trim().toLowerCase().includes(k));
    if (col) return col.key;
  }
  return undefined;
}

/**
 * Dado `options.columns` de un ítem table, resuelve qué columna cumple cada rol
 * de inventario. `eolRules` (cuando está presente) confirma que el ítem maneja
 * EOL aunque la columna no matchee por nombre.
 */
export function resolveInventoryColumns(
  columns: InventoryColumn[],
  eolRules?: unknown
): ResolvedInventoryColumns {
  const tipoKey = matchKey(columns, TYPE_KEYS);
  const antiguedadKey = matchKey(columns, AGE_KEYS);
  let eolKey = matchKey(columns, EOL_KEYS);
  const modeloKey = matchKey(columns, MODELO_KEYS);

  // Si el ítem declara eol_rules pero ninguna columna matcheó EOL por nombre,
  // intentamos la primera columna de tipo 'select' como portadora del estado.
  if (!eolKey && eolRules && typeof eolRules === 'object') {
    const sel = columns.find((c) => c.type === 'select');
    if (sel) eolKey = sel.key;
  }

  return { tipoKey, modeloKey, antiguedadKey, eolKey };
}

/**
 * Predicado §(b) del design: un ítem `table` es inventario si pertenece al
 * dominio IT y sus columnas permiten mapear al menos tipo y (antigüedad o EOL).
 */
export function isInventoryTableItem(
  item: { field_type: string; value?: unknown; options?: unknown },
  sectionDomain: 'it' | 'erp'
): boolean {
  if (item.field_type !== 'table') return false;
  if (sectionDomain !== 'it') return false;

  const columns = extractColumns(item.options);
  if (columns.length === 0) return false;

  const eolRules = extractEolRules(item.options);
  const resolved = resolveInventoryColumns(columns, eolRules);
  if (!resolved.tipoKey) return false;
  return Boolean(resolved.antiguedadKey || resolved.eolKey);
}

export function extractColumns(options: unknown): InventoryColumn[] {
  if (!options || typeof options !== 'object') return [];
  const cols = (options as { columns?: unknown }).columns;
  if (!Array.isArray(cols)) return [];
  return cols.filter(
    (c): c is InventoryColumn =>
      Boolean(c) &&
      typeof c === 'object' &&
      typeof (c as InventoryColumn).key === 'string' &&
      typeof (c as InventoryColumn).label === 'string' &&
      typeof (c as InventoryColumn).type === 'string'
  );
}

export function extractEolRules(options: unknown): unknown {
  if (!options || typeof options !== 'object') return undefined;
  return (options as { eol_rules?: unknown }).eol_rules;
}
