import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { findUserIdByEmail } from '../helpers/auth';
import { getTemplateIdByCode } from '../helpers/backoffice';

export type BundleFixtureResult = {
  auditId: string;
  clientId: string;
  fileRefItemId: string;
  fileRefAttachmentId: string;
  tableItemId: string;
  tableAttachmentId: string;
  unlinkedAttachmentId: string;
  sectionCode: string;
};

/**
 * Crea una auditoría rica para los tests de bundle: cliente con CUIT, técnico asignado,
 * respuestas (incluyendo `file_ref` y `table` con attachment_ids embebidos), un score de
 * sección, cierre y adjuntos (uno ligado a ítem, otro sin ítem).
 */
export async function seedBundleAuditFixture(
  sql: postgres.Sql,
  opts?: {
    status?:
      | 'borrador'
      | 'briefing_enviado'
      | 'briefing_completo'
      | 'en_relevamiento'
      | 'en_cierre'
      | 'cerrada';
    razonSocial?: string;
    cuit?: string;
    withClosure?: boolean;
  }
): Promise<BundleFixtureResult> {
  setSqlForTests(sql);
  const status = opts?.status ?? 'en_relevamiento';
  const razonSocial = opts?.razonSocial ?? 'Bundle Fixture SA';
  const cuit = opts?.cuit ?? '30-99887766-5';

  const templateId = await getTemplateIdByCode(sql, 'it');
  const techId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
  const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');

  // client.cuit es UNIQUE parcial desde migración 013; limpiar fila previa SIN auditoría
  // dependiente con el mismo CUIT para que re-seedeos del fixture sean idempotentes sin
  // romper FKs de auditorías ya creadas en el mismo test.
  if (cuit) {
    await sql`
      DELETE FROM client c
      WHERE c.cuit = ${cuit}
        AND NOT EXISTS (SELECT 1 FROM audit a WHERE a.empresa_id = c.id)
    `;
  }

  const [client] = await sql<{ id: string }[]>`
    INSERT INTO client (razon_social, cuit, rubro, provincia)
    VALUES (${razonSocial}, ${cuit}, 'agro', 'Chaco')
    RETURNING id
  `;

  const closedAt =
    status === 'cerrada' ? new Date('2026-06-10T12:00:00.000Z') : null;

  const [audit] = await sql<{ id: string }[]>`
    INSERT INTO audit (
      empresa_id, name, types, template_ids, segment, status,
      assigned_tech_id, created_by, scheduled_at, public_token, closed_at
    )
    VALUES (
      ${client.id},
      ${'Auditoría ' + razonSocial},
      ARRAY['it']::text[],
      ARRAY[${templateId}]::uuid[],
      'B',
      ${status},
      ${techId},
      ${adminId},
      ${new Date('2026-06-20T13:00:00.000Z')},
      ${'bundle-fixture-' + randomUUID()},
      ${closedAt}
    )
    RETURNING id
  `;
  const auditId = audit.id;

  // Ítem file_ref
  const [fileRefItem] = await sql<{ id: string; section_code: string }[]>`
    SELECT ti.id, s.code AS section_code
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateId} AND ti.field_type = 'file_ref' AND s.code != 'CAB'
    ORDER BY s.sort_order, ti.sort_order
    LIMIT 1
  `;
  if (!fileRefItem) {
    throw new Error('No file_ref item en template it');
  }

  // Ítem table (puede no existir en el seed; usamos un select scored si falta)
  const [tableItem] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateId} AND ti.field_type = 'table' AND s.code != 'CAB'
    ORDER BY s.sort_order, ti.sort_order
    LIMIT 1
  `;

  // Ítem text simple para una respuesta básica
  const [textItem] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateId} AND ti.field_type = 'text' AND s.code != 'CAB'
    ORDER BY s.sort_order, ti.sort_order
    LIMIT 1
  `;

  // Adjunto ligado al file_ref
  const [fileRefAtt] = await sql<{ id: string }[]>`
    INSERT INTO attachment (audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by)
    VALUES (${auditId}, ${fileRefItem.id}, ${'audits/' + auditId + '/fileref.jpg'},
            'fileref.jpg', 'image/jpeg', 2048, 'photo', ${techId})
    RETURNING id
  `;

  // Adjunto sin ítem (export)
  const [unlinkedAtt] = await sql<{ id: string }[]>`
    INSERT INTO attachment (audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by)
    VALUES (${auditId}, NULL, ${'audits/' + auditId + '/export.csv'},
            'export.csv', 'text/csv', 512, 'export', ${techId})
    RETURNING id
  `;

  // Respuesta file_ref con attachment_ids embebidos (UUID de origen)
  await sql`
    INSERT INTO audit_response (audit_id, item_id, value, na, source, updated_by)
    VALUES (${auditId}, ${fileRefItem.id}, ${sql.json({ attachment_ids: [fileRefAtt.id] })},
            false, 'tecnico', ${techId})
  `;

  if (textItem) {
    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, na, source, updated_by)
      VALUES (${auditId}, ${textItem.id}, ${sql.json('Observación de prueba')},
              false, 'tecnico', ${techId})
    `;
  }

  // Respuesta table con attachment_ids por fila
  let tableAttId = '';
  let tableItemId = '';
  if (tableItem) {
    const [tableAtt] = await sql<{ id: string }[]>`
      INSERT INTO attachment (audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by)
      VALUES (${auditId}, ${tableItem.id}, ${'audits/' + auditId + '/table.jpg'},
              'table.jpg', 'image/jpeg', 1024, 'photo', ${techId})
      RETURNING id
    `;
    tableAttId = tableAtt.id;
    tableItemId = tableItem.id;
    const rowId = randomUUID();
    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, na, source, updated_by)
      VALUES (${auditId}, ${tableItem.id},
              ${sql.json({ rows: [{ row_id: rowId, cells: { c1: 'v1' }, attachment_ids: [tableAtt.id] }] })},
              false, 'tecnico', ${techId})
    `;
  }

  // Score de sección
  const [scoredSection] = await sql<{ id: string }[]>`
    SELECT id FROM section
    WHERE template_id = ${templateId} AND code != 'CAB' AND has_score = true
    ORDER BY sort_order
    LIMIT 1
  `;
  if (scoredSection) {
    await sql`
      INSERT INTO audit_section_score (audit_id, section_id, score, score_breakdown, observations)
      VALUES (${auditId}, ${scoredSection.id}, 75,
              ${sql.json([{ itemId: 'local-calc-1', points: 100 }])}, 'Observación score')
      ON CONFLICT (audit_id, section_id) DO NOTHING
    `;
  }

  if (opts?.withClosure ?? status === 'cerrada') {
    await sql`
      INSERT INTO audit_closure (
        audit_id, indice_it, indice_erp, top_risks, quick_wins, upsell_findings, next_step, closed_by, closed_at
      )
      VALUES (
        ${auditId}, 70, NULL,
        ${sql.json([{ titulo: 'Riesgo', severidad: 'alta' }])},
        ${sql.json(['Quick win'])},
        ${sql.json(['Upsell'])},
        'Próximo paso',
        ${techId},
        ${closedAt ?? new Date('2026-06-10T12:00:00.000Z')}
      )
      ON CONFLICT (audit_id) DO NOTHING
    `;
  }

  return {
    auditId,
    clientId: client.id,
    fileRefItemId: fileRefItem.id,
    fileRefAttachmentId: fileRefAtt.id,
    tableItemId,
    tableAttachmentId: tableAttId,
    unlinkedAttachmentId: unlinkedAtt.id,
    sectionCode: fileRefItem.section_code
  };
}
