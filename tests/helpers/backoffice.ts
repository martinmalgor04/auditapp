import type postgres from 'postgres';
import type { AuditStatus } from '../../src/lib/server/db/audit-status';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { insertTestEmpresa } from './empresa';
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

  const clientId = await insertTestEmpresa(sql, { razonSocial: opts.razonSocial });

  const [audit] = await sql<{ id: string }[]>`
    INSERT INTO audit (
      empresa_id, name, types, template_ids, segment, status,
      assigned_tech_id, scheduled_at, public_token, archived_at
    )
    VALUES (
      ${clientId},
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

  // #32: el acceso al form se decide por `audit_assignment` (una fila por tipo).
  // La migración 020 sólo hace backfill de filas preexistentes; las auditorías
  // que seedean los tests nacen después, así que replicamos el backfill acá para
  // que el técnico asignado quede efectivamente asignado por área. Idempotente y
  // guardado por existencia de tabla (compat. con DBs sin la 020).
  if (techId) {
    const [{ exists: hasAssignmentTable }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'audit_assignment'
      ) AS exists
    `;
    if (hasAssignmentTable) {
      for (const t of types) {
        await sql`
          INSERT INTO audit_assignment (audit_id, audit_type, tech_id)
          VALUES (${audit.id}, ${t}, ${techId})
          ON CONFLICT (audit_id, audit_type) DO UPDATE SET tech_id = EXCLUDED.tech_id
        `;
      }
    }
  }

  return { auditId: audit.id, clientId };
}

/** Auditoría legacy multi-tipo (IT+ERP) vía INSERT directo (#32, #41). */
export async function insertTestMixedAudit(
  sql: postgres.Sql,
  opts: {
    razonSocial: string;
    itTechEmail?: string;
    erpTechEmail?: string;
    status?: AuditStatus;
  }
): Promise<string> {
  const itTechEmail = opts.itTechEmail ?? 'facu@serviciosysistemas.com.ar';
  const erpTechEmail = opts.erpTechEmail ?? 'simon@serviciosysistemas.com.ar';
  const itTechId = await findUserIdByEmail(sql, itTechEmail);
  const erpTechId = await findUserIdByEmail(sql, erpTechEmail);

  const { auditId } = await insertTestAuditRow(sql, {
    razonSocial: opts.razonSocial,
    types: ['it', 'erp-tango'],
    assignedTechEmail: itTechEmail,
    status: opts.status ?? 'borrador'
  });

  await sql`
    UPDATE audit_assignment
    SET tech_id = ${erpTechId}
    WHERE audit_id = ${auditId} AND audit_type = 'erp-tango'
  `;
  await sql`UPDATE audit SET assigned_tech_id = ${itTechId} WHERE id = ${auditId}`;

  return auditId;
}

/** Legacy multi-tipo con ambos templates y created_by (#32). */
export async function insertLegacyMixedAuditRow(
  sql: postgres.Sql,
  opts: {
    razonSocial: string;
    itTechId: string;
    erpTechId: string;
    createdBy: string;
    status?: AuditStatus;
  }
): Promise<{ auditId: string; clientId: string }> {
  setSqlForTests(sql);
  const tplIt = await getTemplateIdByCode(sql, 'it');
  const tplErp = await getTemplateIdByCode(sql, 'erp-tango');
  const clientId = await insertTestEmpresa(sql, { razonSocial: opts.razonSocial });

  const [audit] = await sql<{ id: string }[]>`
    INSERT INTO audit (
      empresa_id, name, types, template_ids, segment, status,
      assigned_tech_id, scheduled_at, created_by
    )
    VALUES (
      ${clientId},
      ${'Auditoría ' + opts.razonSocial},
      ${['it', 'erp-tango']},
      ${[tplIt, tplErp]}::uuid[],
      'A',
      ${opts.status ?? 'borrador'},
      ${opts.itTechId},
      ${new Date('2026-06-15')},
      ${opts.createdBy}
    )
    RETURNING id
  `;

  for (const [auditType, techId] of [
    ['it', opts.itTechId],
    ['erp-tango', opts.erpTechId]
  ] as const) {
    await sql`
      INSERT INTO audit_assignment (audit_id, audit_type, tech_id)
      VALUES (${audit.id}, ${auditType}, ${techId})
      ON CONFLICT (audit_id, audit_type) DO UPDATE SET tech_id = EXCLUDED.tech_id
    `;
  }

  return { auditId: audit.id, clientId };
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
