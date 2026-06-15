import { getSql } from './client';
import type { AuditStatus } from './audit-status';
import type { FieldType } from './field-schemas';

export const FORM_EDITABLE_STATUSES: AuditStatus[] = [
  'briefing_completo',
  'en_relevamiento',
  'en_cierre'
];

export type AuditFormHeaderRow = {
  id: string;
  client_id: string;
  name: string;
  status: AuditStatus;
  assigned_tech_id: string;
  razon_social: string;
  types: string[];
  segment: string;
  archived_at: Date | null;
};

export type FormSectionRow = {
  id: string;
  code: string;
  title: string;
  sort_order: number;
  has_score: boolean;
};

export type FormItemRow = {
  id: string;
  section_id: string;
  label: string;
  help_text: string | null;
  field_type: FieldType;
  options: Record<string, unknown>;
  method: string[];
  required: boolean;
  allow_na: boolean;
  filled_by: 'tecnico' | 'admin' | 'cliente';
  scores: boolean;
  sort_order: number;
};

export type FormResponseRow = {
  item_id: string;
  value: unknown;
  na: boolean;
  observations: string | null;
  source: 'admin' | 'cliente' | 'tecnico' | 'reunion_ia';
  updated_by: string | null;
  updated_at: Date;
};

export async function getAuditFormHeader(auditId: string): Promise<AuditFormHeaderRow | null> {
  const sql = getSql();
  const [row] = await sql<AuditFormHeaderRow[]>`
    SELECT
      a.id,
      a.client_id,
      a.name,
      a.status,
      a.assigned_tech_id,
      c.razon_social,
      a.types,
      a.segment,
      a.archived_at
    FROM audit a
    JOIN client c ON c.id = a.client_id
    WHERE a.id = ${auditId}
      AND a.archived_at IS NULL
    LIMIT 1
  `;
  return row ?? null;
}

export async function listFormSections(auditId: string): Promise<FormSectionRow[]> {
  const sql = getSql();
  return sql<FormSectionRow[]>`
    SELECT
      s.id,
      s.code,
      s.title,
      s.sort_order,
      s.has_score
    FROM audit a
    JOIN section s ON s.template_id = ANY(a.template_ids)
    WHERE a.id = ${auditId}
      AND EXISTS (
        SELECT 1
        FROM template_item ti
        WHERE ti.section_id = s.id
          AND ti.filled_by IN ('tecnico', 'admin')
      )
    ORDER BY s.sort_order ASC, s.code ASC
  `;
}

export async function listFormItems(auditId: string): Promise<FormItemRow[]> {
  const sql = getSql();
  return sql<FormItemRow[]>`
    SELECT
      ti.id,
      ti.section_id,
      ti.label,
      ti.help_text,
      ti.field_type,
      ti.options,
      ti.method,
      ti.required,
      ti.allow_na,
      ti.filled_by,
      ti.scores,
      ti.sort_order
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s2.id FROM section s2 WHERE s2.template_id = ANY(a.template_ids)
    )
    WHERE a.id = ${auditId}
      AND ti.filled_by IN ('tecnico', 'admin')
    ORDER BY ti.section_id, ti.sort_order
  `;
}

export async function getFormItemForAudit(
  auditId: string,
  itemId: string
): Promise<(FormItemRow & { section_code: string }) | null> {
  const sql = getSql();
  const [row] = await sql<(FormItemRow & { section_code: string })[]>`
    SELECT
      ti.id,
      ti.section_id,
      ti.label,
      ti.help_text,
      ti.field_type,
      ti.options,
      ti.method,
      ti.required,
      ti.allow_na,
      ti.filled_by,
      ti.scores,
      ti.sort_order,
      s.code AS section_code
    FROM audit a
    JOIN template_item ti ON ti.id = ${itemId}
    JOIN section s ON s.id = ti.section_id
    WHERE a.id = ${auditId}
      AND s.template_id = ANY(a.template_ids)
      AND ti.filled_by IN ('tecnico', 'admin')
    LIMIT 1
  `;
  return row ?? null;
}

export async function listFormResponses(auditId: string): Promise<FormResponseRow[]> {
  const sql = getSql();
  return sql<FormResponseRow[]>`
    SELECT item_id, value, na, observations, source, updated_by, updated_at
    FROM audit_response
    WHERE audit_id = ${auditId}
  `;
}

export async function upsertFormResponse(
  auditId: string,
  itemId: string,
  value: unknown,
  na: boolean,
  observations: string | null,
  userId: string
): Promise<{ updatedAt: string }> {
  const sql = getSql();
  const [row] = await sql<{ updated_at: Date }[]>`
    INSERT INTO audit_response (audit_id, item_id, value, na, observations, source, updated_by)
    VALUES (
      ${auditId},
      ${itemId},
      ${sql.json(value as never)},
      ${na},
      ${observations},
      'tecnico',
      ${userId}
    )
    ON CONFLICT (audit_id, item_id) DO UPDATE SET
      value = EXCLUDED.value,
      na = EXCLUDED.na,
      observations = COALESCE(EXCLUDED.observations, audit_response.observations),
      source = 'tecnico',
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING updated_at
  `;
  return { updatedAt: row.updated_at.toISOString() };
}

export async function batchUpsertFormResponses(
  auditId: string,
  userId: string,
  rows: Array<{ itemId: string; value: unknown; na: boolean; notes?: string | null }>
): Promise<void> {
  const sql = getSql();
  for (const row of rows) {
    await upsertFormResponse(
      auditId,
      row.itemId,
      row.value,
      row.na,
      row.notes ?? null,
      userId
    );
  }
}

export async function setAuditStatus(auditId: string, status: AuditStatus): Promise<void> {
  const sql = getSql();
  await sql`UPDATE audit SET status = ${status} WHERE id = ${auditId}`;
}

export async function listPendingRequiredItems(
  auditId: string
): Promise<Array<{ id: string; label: string }>> {
  const sql = getSql();
  return sql<Array<{ id: string; label: string }>>`
    SELECT ti.id, ti.label
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s2.id FROM section s2 WHERE s2.template_id = ANY(a.template_ids)
    )
    LEFT JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
    WHERE a.id = ${auditId}
      AND ti.filled_by IN ('tecnico', 'admin')
      AND ti.required = true
      AND (ar.id IS NULL OR (ar.na = false AND (ar.value IS NULL OR ar.value = 'null'::jsonb)))
  `;
}
