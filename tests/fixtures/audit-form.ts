import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { getTemplateIdByCode, insertTestAuditRow } from '../helpers/backoffice';

export const FORM_FIXTURE_TOKEN = 'form-fixture-token-test';

export async function seedAuditFormFixture(
  sql: postgres.Sql,
  opts?: {
    razonSocial?: string;
    status?: 'briefing_completo' | 'en_relevamiento' | 'en_cierre';
    assignedTechEmail?: string;
    publicToken?: string | null;
  }
): Promise<{ auditId: string; clientId: string; templateId: string }> {
  setSqlForTests(sql);
  const templateId = await getTemplateIdByCode(sql, 'it');
  const token = opts?.publicToken ?? `form-${randomUUID()}`;
  const { auditId, clientId } = await insertTestAuditRow(sql, {
    razonSocial: opts?.razonSocial ?? 'Fixture Form Técnico SA',
    types: ['it'],
    status: opts?.status ?? 'briefing_completo',
    publicToken: token,
    assignedTechEmail: opts?.assignedTechEmail ?? 'facu@serviciosysistemas.com.ar'
  });

  const clienteItems = await sql<{ id: string; field_type: string }[]>`
    SELECT ti.id, ti.field_type
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    WHERE a.id = ${auditId} AND ti.filled_by = 'cliente'
    ORDER BY ti.sort_order
    LIMIT 3
  `;

  for (const item of clienteItems) {
    let value: unknown = 'Valor briefing';
    if (item.field_type === 'bool') value = true;
    if (item.field_type === 'number' || item.field_type === 'money') value = 42;
    if (item.field_type === 'tri') value = 'si';
    if (item.field_type === 'multiselect') value = [];
    if (item.field_type === 'list') value = ['item1'];

    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, source)
      VALUES (${auditId}, ${item.id}, ${sql.json(value as never)}, 'cliente')
      ON CONFLICT (audit_id, item_id) DO NOTHING
    `;
  }

  const [tecnicoItem] = await sql<{ id: string; field_type: string }[]>`
    SELECT ti.id, ti.field_type
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    WHERE a.id = ${auditId} AND ti.filled_by = 'tecnico' AND ti.field_type = 'tri'
    ORDER BY ti.sort_order
    LIMIT 1
  `;

  if (tecnicoItem) {
    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, source)
      VALUES (${auditId}, ${tecnicoItem.id}, ${sql.json('si' as never)}, 'cliente')
      ON CONFLICT (audit_id, item_id) DO UPDATE SET
        value = EXCLUDED.value,
        source = 'cliente'
    `;
  }

  return { auditId, clientId, templateId };
}

export async function listTecnicoItemsByFieldType(
  sql: postgres.Sql,
  auditId: string
): Promise<Map<string, string>> {
  const rows = await sql<{ id: string; field_type: string }[]>`
    SELECT ti.id, ti.field_type
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    WHERE a.id = ${auditId} AND ti.filled_by = 'tecnico'
  `;
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!map.has(r.field_type)) {
      map.set(r.field_type, r.id);
    }
  }
  return map;
}

export async function listFormSectionsForAudit(
  sql: postgres.Sql,
  auditId: string
): Promise<Array<{ id: string; code: string }>> {
  const rows = await sql<{ id: string; code: string }[]>`
    SELECT DISTINCT s.id, s.code
    FROM audit a
    JOIN section s ON s.template_id = ANY(a.template_ids)
    JOIN template_item ti ON ti.section_id = s.id
    WHERE a.id = ${auditId} AND ti.filled_by IN ('tecnico', 'admin')
    ORDER BY s.code
  `;
  return rows;
}

export async function getScoredSelectItem(
  sql: postgres.Sql,
  auditId: string
): Promise<{ itemId: string; sectionId: string; choices: string[]; scoreMap: Record<string, number> } | null> {
  const rows = await sql<
    { id: string; section_id: string; options: { choices?: string[]; score_map?: Record<string, number> } }[]
  >`
    SELECT ti.id, ti.section_id, ti.options
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    WHERE a.id = ${auditId}
      AND ti.filled_by = 'tecnico'
      AND ti.field_type = 'select'
      AND ti.scores = true
  `;

  for (const row of rows) {
    if (row.options?.score_map && Object.keys(row.options.score_map).length > 0) {
      return {
        itemId: row.id,
        sectionId: row.section_id,
        choices: row.options.choices ?? [],
        scoreMap: row.options.score_map ?? {}
      };
    }
  }
  return null;
}

export const FIELD_TYPES_FOR_FIXTURE = [
  'text',
  'number',
  'bool',
  'tri',
  'select',
  'multiselect',
  'date',
  'datetime',
  'list',
  'table',
  'file_ref',
  'money'
] as const;
