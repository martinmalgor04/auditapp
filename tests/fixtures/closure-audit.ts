import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { completeRelevamiento } from '../../src/lib/server/form/complete';
import { findUserByEmail } from '../helpers/auth';
import { insertAuditResponse, insertTestAuditRow } from '../helpers/backoffice';
import { seedAuditFormFixture } from './audit-form';

export async function seedClosureAuditFixture(
  sql: postgres.Sql,
  opts?: {
    types?: string[];
    status?: 'en_relevamiento' | 'en_cierre' | 'cerrada';
    assignedTechEmail?: string;
    publicToken?: string;
  }
): Promise<{ auditId: string; clientId: string }> {
  setSqlForTests(sql);
  const { auditId, clientId } = await seedAuditFormFixture(sql, {
    status: 'en_relevamiento',
    assignedTechEmail: opts?.assignedTechEmail ?? 'facu@serviciosysistemas.com.ar',
    publicToken: opts?.publicToken ?? 'closure-fixture-token'
  });

  if (opts?.types && opts.types.length > 1) {
    const types = opts.types;
    const templateIds = await Promise.all(
      types.map(async (t) => {
        const [row] = await sql<{ id: string }[]>`
          SELECT id FROM template WHERE code = ${t} AND status = 'active' LIMIT 1
        `;
        return row.id;
      })
    );
    await sql`
      UPDATE audit SET types = ${types}, template_ids = ${templateIds}::uuid[] WHERE id = ${auditId}
    `;
  }

  const tech = await findUserByEmail(sql, opts?.assignedTechEmail ?? 'facu@serviciosysistemas.com.ar');
  if (!tech) throw new Error('tech not found');

  if (opts?.status === 'en_cierre' || opts?.status === 'cerrada') {
    await completeRelevamiento(auditId, tech);
  }

  if (opts?.status === 'cerrada') {
    const { confirmClosure } = await import('../../src/lib/server/scoring/persist');
    await confirmClosure(auditId, tech);
  }

  return { auditId, clientId };
}

export async function seedMinimalScoringAudit(
  sql: postgres.Sql
): Promise<{ auditId: string; selectItemId: string; sectionId: string }> {
  setSqlForTests(sql);
  const { auditId } = await seedAuditFormFixture(sql, { status: 'en_relevamiento' });

  const [item] = await sql<
    { id: string; section_id: string; options: { score_map?: Record<string, number> } }[]
  >`
    SELECT ti.id, ti.section_id, ti.options
    FROM audit a
    JOIN template_item ti ON ti.section_id IN (
      SELECT s.id FROM section s WHERE s.template_id = ANY(a.template_ids)
    )
    JOIN section s ON s.id = ti.section_id
    WHERE a.id = ${auditId}
      AND ti.field_type = 'select'
      AND ti.scores = true
      AND ti.filled_by = 'tecnico'
      AND s.code != 'CAB'
      AND ti.options ? 'score_map'
    LIMIT 1
  `;

  if (item) {
    const choice = Object.keys(item.options.score_map ?? {})[0] ?? 'Controlado';
    await insertAuditResponse(sql, auditId, item.id, choice);
  }

  return { auditId, selectItemId: item?.id ?? '', sectionId: item?.section_id ?? '' };
}
