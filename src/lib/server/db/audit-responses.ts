import { getSql } from './client';
import { fileRefValueSchema } from '../storage/schemas';

export async function upsertFileRefResponse(
  auditId: string,
  itemId: string,
  attachmentId: string,
  userId: string
): Promise<void> {
  const sql = getSql();

  const [existing] = await sql<{ value: { attachment_ids?: string[] } }[]>`
    SELECT value FROM audit_response
    WHERE audit_id = ${auditId} AND item_id = ${itemId}
    LIMIT 1
  `;

  let attachmentIds: string[];
  if (existing?.value && typeof existing.value === 'object') {
    const parsed = fileRefValueSchema.safeParse(existing.value);
    if (parsed.success) {
      attachmentIds = parsed.data.attachment_ids.includes(attachmentId)
        ? parsed.data.attachment_ids
        : [...parsed.data.attachment_ids, attachmentId];
    } else {
      attachmentIds = [attachmentId];
    }
  } else {
    attachmentIds = [attachmentId];
  }

  const value = { attachment_ids: attachmentIds };

  await sql`
    INSERT INTO audit_response (audit_id, item_id, value, source, updated_by)
    VALUES (${auditId}, ${itemId}, ${sql.json(value)}, 'tecnico', ${userId})
    ON CONFLICT (audit_id, item_id) DO UPDATE SET
      value = EXCLUDED.value,
      source = EXCLUDED.source,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  `;
}

export async function getTemplateItemSectionCode(
  auditId: string,
  itemId: string
): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql<{ code: string }[]>`
    SELECT s.code
    FROM audit a
    JOIN template_item ti ON ti.id = ${itemId}
    JOIN section s ON s.id = ti.section_id
    WHERE a.id = ${auditId}
      AND s.template_id = ANY(a.template_ids)
    LIMIT 1
  `;
  return row?.code ?? null;
}
