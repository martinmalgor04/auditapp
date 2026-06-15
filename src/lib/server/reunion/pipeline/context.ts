import { getSql } from '$lib/server/db/client';

/** field_types soportados en MVP de extracción (R12). */
export const REUNION_EXTRACTABLE_FIELD_TYPES = new Set([
  'text', 'tri', 'select', 'number', 'bool', 'date'
]);

export type TemplateContextItem = {
  item_id: string;
  label: string;
  field_type: string;
  options: unknown;
  filled_by: string;
  current_value: unknown | null;
};

export type TemplateContext = {
  items: TemplateContextItem[];
};

/**
 * Construye el contexto de la plantilla para enviar al LLM.
 * Solo incluye ítems con field_type ∈ MVP list y filled_by ∈ {cliente, tecnico}.
 */
export async function buildTemplateContextForExtraction(
  auditId: string
): Promise<TemplateContext> {
  const sql = getSql();

  const rows = await sql<{
    item_id: string;
    label: string;
    field_type: string;
    options: unknown;
    filled_by: string;
    current_value: unknown | null;
  }[]>`
    SELECT
      ti.id         AS item_id,
      ti.label,
      ti.field_type,
      ti.options,
      ti.filled_by,
      ar.value      AS current_value
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    LEFT JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
    WHERE a.id = ${auditId}
      AND ti.filled_by IN ('cliente', 'tecnico')
      AND ti.field_type IN ('text', 'tri', 'select', 'number', 'bool', 'date')
    ORDER BY ti.section_id, ti.sort_order
  `;

  return { items: rows };
}
