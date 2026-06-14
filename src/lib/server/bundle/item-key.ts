import type { ItemKey } from './schema';

/**
 * Construye la clave natural estable de un `template_item` (R4, OQ-1).
 *
 * `template_item` no tiene columna `code`; se identifica por la tupla
 * `{section_code, field_type, sort_order, label}` dentro de su sección. `section_code`
 * localiza la sección; `sort_order` es el discriminador primario; `field_type` y `label`
 * agregan robustez y permiten detectar drift (mismo sort_order pero distinto field_type).
 */
export function resolveItemKey(item: {
  section_code: string;
  field_type: string;
  sort_order: number;
  label: string;
}): ItemKey {
  return {
    section_code: item.section_code,
    field_type: item.field_type,
    sort_order: item.sort_order,
    label: item.label
  };
}

/**
 * Serializa la clave de ítem a un string canónico para usar como key de Map.
 * Las cuatro partes participan: dos ítems con igual sort_order pero distinto field_type
 * producen strings distintos (detección de drift, OQ-1).
 */
export function itemKeyString(key: ItemKey): string {
  return JSON.stringify([key.section_code, key.field_type, key.sort_order, key.label]);
}
