import { getSql } from '$lib/server/db/client';
import type { FieldType } from '$lib/server/db/field-schemas';
import type { AuditStatus } from '$lib/server/db/audit-status';
import type {
  AuditResponseRow,
  SectionRow,
  SectionWeight,
  TemplateItemRow
} from './types';
import type { FrozenTemplate } from './score-audit';

export type ScoringAuditContext = {
  auditId: string;
  status: AuditStatus;
  types: string[];
  assignedTechId: string | null;
  scheduledAt: Date | null;
  razonSocial: string;
  cuit: string | null;
  templates: FrozenTemplate[];
  sections: SectionRow[];
  items: TemplateItemRow[];
  responses: AuditResponseRow[];
};

export async function loadScoringContext(auditId: string): Promise<ScoringAuditContext | null> {
  const sql = getSql();

  const [audit] = await sql<
    {
      id: string;
      status: AuditStatus;
      types: string[];
      assigned_tech_id: string | null;
      scheduled_at: Date | null;
      template_ids: string[];
      razon_social: string;
      cuit: string | null;
    }[]
  >`
    SELECT a.id, a.status, a.types, a.assigned_tech_id, a.scheduled_at, a.template_ids,
           c.razon_social, c.cuit
    FROM audit a
    JOIN client c ON c.id = a.client_id
    WHERE a.id = ${auditId}
      AND a.archived_at IS NULL
    LIMIT 1
  `;

  if (!audit) return null;

  const templateRows = await sql<{ id: string; code: string }[]>`
    SELECT id, code FROM template WHERE id = ANY(${audit.template_ids}::uuid[])
  `;

  const sections = await sql<
    {
      id: string;
      template_id: string;
      code: string;
      title: string;
      weight: SectionWeight;
      has_score: boolean;
    }[]
  >`
    SELECT id, template_id, code, title, weight, has_score
    FROM section
    WHERE template_id = ANY(${audit.template_ids}::uuid[])
    ORDER BY sort_order
  `;

  const items = await sql<
    {
      id: string;
      section_id: string;
      field_type: FieldType;
      options: Record<string, unknown>;
      scores: boolean;
      required: boolean;
      item_weight: string;
    }[]
  >`
    SELECT ti.id, ti.section_id, ti.field_type, ti.options, ti.scores, ti.required, ti.item_weight
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ANY(${audit.template_ids}::uuid[])
      AND ti.filled_by IN ('tecnico', 'admin')
    ORDER BY ti.sort_order
  `;

  const responses = await sql<{ item_id: string; value: unknown; na: boolean }[]>`
    SELECT item_id, value, na FROM audit_response WHERE audit_id = ${auditId}
  `;

  return {
    auditId: audit.id,
    status: audit.status,
    types: audit.types,
    assignedTechId: audit.assigned_tech_id,
    scheduledAt: audit.scheduled_at,
    razonSocial: audit.razon_social,
    cuit: audit.cuit,
    templates: templateRows.map((t) => ({ id: t.id, code: t.code })),
    sections: sections.map((s) => ({
      id: s.id,
      templateId: s.template_id,
      code: s.code,
      title: s.title,
      weight: s.weight,
      hasScore: s.has_score
    })),
    items: items.map((i) => ({
      id: i.id,
      sectionId: i.section_id,
      fieldType: i.field_type,
      options: i.options,
      scores: i.scores,
      required: i.required,
      itemWeight: Number(i.item_weight)
    })),
    responses: responses.map((r) => ({
      itemId: r.item_id,
      value: r.value,
      na: r.na
    }))
  };
}
