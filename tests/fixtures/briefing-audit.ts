import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { getTemplateIdByCode, insertTestAuditRow } from '../helpers/backoffice';

export const BRIEFING_FIXTURE_TOKEN = 'briefing-fixture-token-test';

export async function seedBriefingAuditFixture(
  sql: postgres.Sql,
  opts?: { razonSocial?: string; status?: 'briefing_enviado' | 'briefing_completo'; token?: string }
): Promise<{ auditId: string; clientId: string; templateId: string }> {
  setSqlForTests(sql);
  const templateId = await getTemplateIdByCode(sql, 'it');
  const { auditId, clientId } = await insertTestAuditRow(sql, {
    razonSocial: opts?.razonSocial ?? 'Fixture Briefing SA',
    types: ['it'],
    status: opts?.status ?? 'briefing_enviado',
    publicToken: opts?.token ?? BRIEFING_FIXTURE_TOKEN
  });

  return { auditId, clientId, templateId };
}

export async function listClienteItemIds(sql: postgres.Sql, auditId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    WHERE a.id = ${auditId} AND ti.filled_by = 'cliente'
    ORDER BY ti.sort_order
  `;
  return rows.map((r) => r.id);
}

export async function listTecnicoItemId(sql: postgres.Sql, auditId: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    WHERE a.id = ${auditId} AND ti.filled_by = 'tecnico'
    LIMIT 1
  `;
  return row?.id ?? null;
}
