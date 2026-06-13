import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { completeRelevamiento } from '../../src/lib/server/form/complete';
import { saveClosureFields } from '../../src/lib/server/scoring/persist';
import { findUserByEmail } from '../helpers/auth';
import { insertAuditResponse } from '../helpers/backoffice';
import { seedAuditFormFixture } from './audit-form';

export async function seedCanonicalAuditFixture(
  sql: postgres.Sql
): Promise<{ auditId: string; clientId: string; attachmentR2Key: string | null }> {
  setSqlForTests(sql);

  const { auditId, clientId } = await seedAuditFormFixture(sql, {
    status: 'en_relevamiento',
    assignedTechEmail: 'facu@serviciosysistemas.com.ar',
    publicToken: `canonical-${randomUUID()}`
  });

  const types = ['it', 'erp-tango'];
  const templateIds = await Promise.all(
    types.map(async (t) => {
      const [row] = await sql<{ id: string }[]>`
        SELECT id FROM template WHERE code = ${t} AND status = 'active' LIMIT 1
      `;
      return row.id;
    })
  );

  await sql`
    UPDATE client
    SET
      erp_actual = 'Tango Gestión',
      empleados = 45,
      puestos = 30,
      sedes = 2,
      proveedor_correo = 'Google Workspace',
      soporte_it_actual = 'Interno',
      rubro = 'Industria'
    WHERE id = ${clientId}
  `;

  await sql`
    UPDATE audit SET types = ${types}, template_ids = ${templateIds}::uuid[] WHERE id = ${auditId}
  `;

  const [modulosItem] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateIds[1]}
      AND s.code = 'CAB'
      AND ti.options->>'item_code' = 'cab_modulos_tango'
    LIMIT 1
  `;

  if (modulosItem) {
    await insertAuditResponse(sql, auditId, modulosItem.id, ['ventas', 'stock']);
  }

  const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
  if (!tech) throw new Error('tech not found');

  const [scoredItem] = await sql<{ id: string; section_id: string }[]>`
    SELECT ti.id, ti.section_id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    JOIN audit a ON s.template_id = ANY(a.template_ids)
    WHERE a.id = ${auditId}
      AND ti.field_type = 'select'
      AND ti.scores = true
      AND ti.filled_by = 'tecnico'
      AND s.code != 'CAB'
    LIMIT 1
  `;

  let attachmentR2Key: string | null = null;

  if (scoredItem) {
    await insertAuditResponse(sql, auditId, scoredItem.id, 'Controlado');

    const [section] = await sql<{ code: string }[]>`
      SELECT code FROM section WHERE id = ${scoredItem.section_id}
    `;
    attachmentR2Key = `audits/${auditId}/${section.code}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
    await sql`
      INSERT INTO attachment (
        audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by
      )
      VALUES (
        ${auditId}, ${scoredItem.id}, ${attachmentR2Key}, 'foto.jpg', 'image/jpeg', 1024, 'photo', ${tech.id}
      )
    `;
  }

  await completeRelevamiento(auditId, tech);

  await saveClosureFields(
    auditId,
    {
      topRisks: [{ text: 'Backup sin probar', severity: 'alta' }],
      quickWins: ['Activar MFA en correo'],
      upsellFindings: ['Renovar servidores EOL'],
      nextStep: 'Revisión trimestral'
    },
    tech
  );

  const { confirmClosure } = await import('../../src/lib/server/scoring/persist');
  await confirmClosure(auditId, tech);

  return { auditId, clientId, attachmentR2Key };
}
