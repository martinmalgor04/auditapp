import { getSql } from './client';
import type { AuditStatus } from './audit-status';
import type { FieldType } from './field-schemas';

export type AuditByTokenRow = {
  id: string;
  client_id: string;
  status: AuditStatus;
  public_token: string;
  razon_social: string;
};

export type ClienteItemRow = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: FieldType;
  options: Record<string, unknown>;
  required: boolean;
  allow_na: boolean;
  sort_order: number;
  section_sort_order: number;
};

export type ResponseRow = {
  item_id: string;
  value: unknown;
  na: boolean;
};

export async function findAuditByToken(token: string): Promise<AuditByTokenRow | null> {
  const sql = getSql();
  const [row] = await sql<AuditByTokenRow[]>`
    SELECT a.id, a.empresa_id AS client_id, a.status, a.public_token, c.razon_social
    FROM audit a
    JOIN client c ON c.id = a.empresa_id
    WHERE a.public_token = ${token}
      AND a.archived_at IS NULL
    LIMIT 1
  `;
  return row ?? null;
}

export async function listClienteItems(auditId: string): Promise<ClienteItemRow[]> {
  const sql = getSql();
  return sql<ClienteItemRow[]>`
    SELECT
      ti.id,
      ti.label,
      ti.help_text,
      ti.field_type,
      ti.options,
      ti.required,
      ti.allow_na,
      ti.sort_order,
      s.sort_order AS section_sort_order
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s2.id FROM section s2 WHERE s2.template_id = ANY(a.template_ids)
    )
    JOIN section s ON s.id = ti.section_id
    WHERE a.id = ${auditId}
      AND ti.filled_by = 'cliente'
    ORDER BY s.sort_order, ti.sort_order
  `;
}

export async function getClienteItemForAudit(
  auditId: string,
  itemId: string
): Promise<(ClienteItemRow & { filled_by: string }) | null> {
  const sql = getSql();
  const [row] = await sql<(ClienteItemRow & { filled_by: string })[]>`
    SELECT
      ti.id,
      ti.label,
      ti.help_text,
      ti.field_type,
      ti.options,
      ti.required,
      ti.allow_na,
      ti.sort_order,
      s.sort_order AS section_sort_order,
      ti.filled_by
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s2.id FROM section s2 WHERE s2.template_id = ANY(a.template_ids)
    )
    JOIN section s ON s.id = ti.section_id
    WHERE a.id = ${auditId}
      AND ti.id = ${itemId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function listResponsesForAudit(auditId: string): Promise<ResponseRow[]> {
  const sql = getSql();
  return sql<ResponseRow[]>`
    SELECT item_id, value, na
    FROM audit_response
    WHERE audit_id = ${auditId}
  `;
}

export async function upsertResponse(
  auditId: string,
  itemId: string,
  value: unknown,
  na: boolean
): Promise<{ updatedAt: string }> {
  const sql = getSql();
  const [row] = await sql<{ updated_at: Date }[]>`
    INSERT INTO audit_response (audit_id, item_id, value, na, source, updated_by)
    VALUES (${auditId}, ${itemId}, ${sql.json(value as never)}, ${na}, 'cliente', NULL)
    ON CONFLICT (audit_id, item_id) DO UPDATE SET
      value = EXCLUDED.value,
      na = EXCLUDED.na,
      source = 'cliente',
      updated_by = NULL,
      updated_at = now()
    RETURNING updated_at
  `;
  return { updatedAt: row.updated_at.toISOString() };
}

export async function updateAuditStatus(
  auditId: string,
  status: AuditStatus
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE audit SET status = ${status} WHERE id = ${auditId}
  `;
}
