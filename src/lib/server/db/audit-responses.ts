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

  if (
    existing?.value &&
    typeof existing.value === 'object' &&
    Array.isArray((existing.value as { rows?: unknown }).rows)
  ) {
    // Red de seguridad: nunca convertir una tabla en file_ref.
    return;
  }

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

type TableRowValue = {
  row_id: string;
  cells: Record<string, unknown>;
  attachment_ids: string[];
};

function isTableValue(v: unknown): v is { rows: TableRowValue[] } {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as { rows?: unknown }).rows)
  );
}

/** Quita un attachment_id del value guardado (file_ref o fila de tabla). */
export async function removeAttachmentFromResponse(input: {
  auditId: string;
  itemId: string;
  attachmentId: string;
  userId: string;
  rowId?: string;
  fieldType: 'file_ref' | 'table';
}): Promise<void> {
  const sql = getSql();

  const [existing] = await sql<{ value: unknown }[]>`
    SELECT value FROM audit_response
    WHERE audit_id = ${input.auditId} AND item_id = ${input.itemId}
    LIMIT 1
  `;

  if (input.fieldType === 'table') {
    if (!input.rowId) {
      throw new Error('row_id requerido para borrar foto de tabla');
    }
    if (!isTableValue(existing?.value)) {
      throw new Error('El ítem no tiene filas guardadas');
    }

    let found = false;
    const rows = existing.value.rows.map((row) => {
      if (row.row_id !== input.rowId) return row;
      const ids = Array.isArray(row.attachment_ids) ? row.attachment_ids : [];
      if (!ids.includes(input.attachmentId)) return row;
      found = true;
      return {
        ...row,
        attachment_ids: ids.filter((id) => id !== input.attachmentId)
      };
    });

    if (!found) {
      throw new Error('La foto no está asociada a esa fila');
    }

    await sql`
      UPDATE audit_response
      SET value = ${sql.json({ rows })},
          source = 'tecnico',
          updated_by = ${input.userId},
          updated_at = now()
      WHERE audit_id = ${input.auditId} AND item_id = ${input.itemId}
    `;
    return;
  }

  let attachmentIds: string[] = [];
  if (existing?.value && typeof existing.value === 'object') {
    const parsed = fileRefValueSchema.safeParse(existing.value);
    if (parsed.success) {
      attachmentIds = parsed.data.attachment_ids;
    }
  }

  if (!attachmentIds.includes(input.attachmentId)) {
    throw new Error('La foto no está asociada a este ítem');
  }

  const value = {
    attachment_ids: attachmentIds.filter((id) => id !== input.attachmentId)
  };

  await sql`
    UPDATE audit_response
    SET value = ${sql.json(value)},
        source = 'tecnico',
        updated_by = ${input.userId},
        updated_at = now()
    WHERE audit_id = ${input.auditId} AND item_id = ${input.itemId}
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
