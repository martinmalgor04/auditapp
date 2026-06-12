import type postgres from 'postgres';
import type { AuditStatus } from '../../src/lib/server/db/audit-status';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { findUserIdByEmail } from './auth';

export async function getTemplateIdByCode(
  sql: postgres.Sql,
  code: string
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM template WHERE code = ${code} AND status = 'active' LIMIT 1
  `;
  if (!row) {
    throw new Error(`Template not found: ${code}`);
  }
  return row.id;
}

export async function insertTestAuditRow(
  sql: postgres.Sql,
  opts: {
    razonSocial: string;
    types?: string[];
    status?: AuditStatus;
    publicToken?: string | null;
    scheduledAt?: Date;
    archivedAt?: Date | null;
    assignedTechEmail?: string;
  }
): Promise<{ auditId: string; clientId: string }> {
  setSqlForTests(sql);
  const techId = await findUserIdByEmail(
    sql,
    opts.assignedTechEmail ?? 'facu@serviciosysistemas.com.ar'
  );

  const types = opts.types ?? ['it'];
  const templateIds: string[] = [];
  for (const t of types) {
    templateIds.push(await getTemplateIdByCode(sql, t));
  }

  const [client] = await sql<{ id: string }[]>`
    INSERT INTO client (razon_social)
    VALUES (${opts.razonSocial})
    RETURNING id
  `;

  const [audit] = await sql<{ id: string }[]>`
    INSERT INTO audit (
      client_id, name, types, template_ids, segment, status,
      assigned_tech_id, scheduled_at, public_token, archived_at
    )
    VALUES (
      ${client.id},
      ${'Auditoría ' + opts.razonSocial},
      ${types},
      ${templateIds}::uuid[],
      'A',
      ${opts.status ?? 'borrador'},
      ${techId},
      ${opts.scheduledAt ?? new Date('2026-06-15')},
      ${opts.publicToken ?? null},
      ${opts.archivedAt ?? null}
    )
    RETURNING id
  `;

  return { auditId: audit.id, clientId: client.id };
}

export async function insertAuditResponse(
  sql: postgres.Sql,
  auditId: string,
  itemId: string,
  value: unknown,
  na = false
): Promise<void> {
  await sql`
    INSERT INTO audit_response (audit_id, item_id, value, na, source)
    VALUES (${auditId}, ${itemId}, ${sql.json(value as never)}, ${na}, 'admin')
    ON CONFLICT (audit_id, item_id) DO UPDATE SET value = EXCLUDED.value, na = EXCLUDED.na
  `;
}

export async function getCabItemId(sql: postgres.Sql, templateCode = 'it'): Promise<string> {
  const templateId = await getTemplateIdByCode(sql, templateCode);
  const [row] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateId} AND s.code = 'CAB'
    ORDER BY ti.sort_order
    LIMIT 1
  `;
  if (!row) {
    throw new Error('CAB item not found');
  }
  return row.id;
}

export async function getFirstTemplateItemId(
  sql: postgres.Sql,
  templateCode = 'it'
): Promise<string> {
  const templateId = await getTemplateIdByCode(sql, templateCode);
  const [row] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateId}
    ORDER BY s.sort_order, ti.sort_order
    LIMIT 1
  `;
  if (!row) {
    throw new Error('Template item not found');
  }
  return row.id;
}

export async function getFileRefTemplateItemId(
  sql: postgres.Sql,
  templateCode = 'it'
): Promise<string> {
  const templateId = await getTemplateIdByCode(sql, templateCode);
  const [row] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateId}
      AND ti.field_type = 'file_ref'
    ORDER BY s.sort_order, ti.sort_order
    LIMIT 1
  `;
  if (!row) {
    throw new Error(`file_ref item not found in template: ${templateCode}`);
  }
  return row.id;
}
