import { getSql } from './client';

export type AttachmentRow = {
  id: string;
  audit_id: string;
  item_id: string | null;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  kind: 'photo' | 'export';
  uploaded_by: string | null;
  created_at: Date;
};

export async function insertAttachment(input: {
  auditId: string;
  itemId: string | null;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  kind: 'photo' | 'export';
  uploadedBy: string;
}): Promise<string> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO attachment (
      audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by
    )
    VALUES (
      ${input.auditId},
      ${input.itemId},
      ${input.r2Key},
      ${input.filename},
      ${input.contentType},
      ${input.sizeBytes},
      ${input.kind},
      ${input.uploadedBy}
    )
    RETURNING id
  `;
  return row.id;
}

export async function getAttachmentById(attachmentId: string): Promise<AttachmentRow | null> {
  const sql = getSql();
  const [row] = await sql<AttachmentRow[]>`
    SELECT
      id, audit_id, item_id, r2_key, filename, content_type,
      size_bytes, kind, uploaded_by, created_at
    FROM attachment
    WHERE id = ${attachmentId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function deleteAttachmentById(
  auditId: string,
  attachmentId: string
): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql<{ r2_key: string }[]>`
    DELETE FROM attachment
    WHERE id = ${attachmentId} AND audit_id = ${auditId}
    RETURNING r2_key
  `;
  return row?.r2_key ?? null;
}
