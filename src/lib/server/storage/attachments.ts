import type { AuditStatus } from '../db/audit-status';
import { deleteAttachmentById, getAttachmentById, insertAttachment } from '../db/attachments';
import { getFormItemForAudit } from '../db/audit-form';
import { getTemplateItemSectionCode, removeAttachmentFromResponse, upsertFileRefResponse } from '../db/audit-responses';
import { getSql } from '../db/client';
import {
  AttachmentConflictError,
  AttachmentNotFoundError,
  AuditNotFoundError,
  StorageValidationError
} from './errors';
import { logger } from '$lib/server/logger';
import { buildR2Key, isR2KeyForAudit, sanitizeSectionCode } from './r2-keys';
import { getAwsClient } from './r2-client';
import { getR2Env } from './r2-config';
import { presignGet, presignPut, type PresignGetResult, type PresignPutResult } from './presign';

const EDITABLE_ATTACHMENT_STATUSES: AuditStatus[] = [
  'briefing_completo',
  'en_relevamiento',
  'en_cierre'
];

async function getAuditForStorage(auditId: string): Promise<{ id: string; status: AuditStatus }> {
  const sql = getSql();
  const [row] = await sql<{ id: string; status: AuditStatus }[]>`
    SELECT id, status FROM audit WHERE id = ${auditId} LIMIT 1
  `;
  if (!row) {
    throw new AuditNotFoundError();
  }
  return row;
}

function assertAuditEditable(status: AuditStatus): void {
  if (!EDITABLE_ATTACHMENT_STATUSES.includes(status)) {
    throw new StorageValidationError('La auditoría no admite adjuntos en este estado');
  }
}

export async function requestPresignedUpload(input: {
  auditId: string;
  itemId: string | null;
  sectionCode: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  kind: 'photo' | 'export';
  userId: string;
}): Promise<PresignPutResult> {
  const audit = await getAuditForStorage(input.auditId);
  assertAuditEditable(audit.status);

  let r2Key: string;

  if (input.itemId) {
    const sectionFromDb = await getTemplateItemSectionCode(input.auditId, input.itemId);
    if (!sectionFromDb) {
      throw new StorageValidationError('Ítem no pertenece a la plantilla de la auditoría');
    }
    if (input.sectionCode && sanitizeSectionCode(input.sectionCode) !== sectionFromDb) {
      throw new StorageValidationError('section_code no coincide con el ítem');
    }
    r2Key = buildR2Key({ auditId: input.auditId, sectionCode: sectionFromDb });
  } else {
    r2Key = buildR2Key({ auditId: input.auditId, general: true });
  }

  return presignPut({
    r2Key,
    contentType: input.contentType
  });
}

export async function confirmUpload(input: {
  auditId: string;
  itemId: string | null;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  kind: 'photo' | 'export';
  userId: string;
}): Promise<{ attachmentId: string }> {
  const audit = await getAuditForStorage(input.auditId);
  assertAuditEditable(audit.status);

  if (!isR2KeyForAudit(input.r2Key, input.auditId)) {
    throw new StorageValidationError('r2_key no corresponde a la auditoría');
  }

  if (input.itemId) {
    const sectionFromDb = await getTemplateItemSectionCode(input.auditId, input.itemId);
    if (!sectionFromDb) {
      throw new StorageValidationError('Ítem no pertenece a la plantilla de la auditoría');
    }
    const expectedPrefix = `audits/${input.auditId}/${sectionFromDb}/`;
    if (!input.r2Key.startsWith(expectedPrefix)) {
      throw new StorageValidationError('r2_key no coincide con la sección del ítem');
    }
  } else if (!input.r2Key.includes('/_general/')) {
    throw new StorageValidationError('r2_key debe usar _general sin item_id');
  }

  try {
    const attachmentId = await insertAttachment({
      auditId: input.auditId,
      itemId: input.itemId,
      r2Key: input.r2Key,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      kind: input.kind,
      uploadedBy: input.userId
    });

    // Solo file_ref: el value es { attachment_ids }. En table el link va en la fila
    // (mergedValue del cliente); upsertFileRefResponse pisaba { rows } → data loss.
    if (input.itemId) {
      const item = await getFormItemForAudit(input.auditId, input.itemId);
      if (item?.field_type === 'file_ref') {
        await upsertFileRefResponse(input.auditId, input.itemId, attachmentId, input.userId);
      }
    }

    return { attachmentId };
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      throw new AttachmentConflictError();
    }
    throw err;
  }
}

export async function requestPresignedDownload(input: {
  attachmentId: string;
  userId: string;
}): Promise<PresignGetResult> {
  const attachment = await getAttachmentById(input.attachmentId);
  if (!attachment) {
    throw new AttachmentNotFoundError();
  }

  await getAuditForStorage(attachment.audit_id);

  return presignGet({ r2Key: attachment.r2_key });
}

async function deleteObjectFromR2(r2Key: string): Promise<void> {
  const env = getR2Env();
  const base = env.R2_ENDPOINT.replace(/\/$/, '');
  const url = `${base}/${env.R2_BUCKET}/${r2Key}`;
  const client = getAwsClient();
  const res = await client.fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    logger.warn('r2_delete_failed', { status: res.status, r2Key });
  }
}

export async function deleteAttachment(input: {
  auditId: string;
  attachmentId: string;
  itemId: string;
  rowId?: string;
  userId: string;
}): Promise<void> {
  const audit = await getAuditForStorage(input.auditId);
  assertAuditEditable(audit.status);

  const attachment = await getAttachmentById(input.attachmentId);
  if (!attachment || attachment.audit_id !== input.auditId) {
    throw new AttachmentNotFoundError();
  }

  const item = await getFormItemForAudit(input.auditId, input.itemId);
  if (!item) {
    throw new StorageValidationError('Ítem no pertenece a la plantilla de la auditoría');
  }

  if (item.field_type !== 'file_ref' && item.field_type !== 'table') {
    throw new StorageValidationError('Este ítem no admite fotos adjuntas');
  }

  if (input.rowId && item.field_type !== 'table') {
    throw new StorageValidationError('row_id solo aplica a campos tabla');
  }

  if (item.field_type === 'table' && !input.rowId) {
    throw new StorageValidationError('row_id requerido para borrar foto de una fila');
  }

  try {
    await removeAttachmentFromResponse({
      auditId: input.auditId,
      itemId: input.itemId,
      attachmentId: input.attachmentId,
      userId: input.userId,
      rowId: input.rowId,
      fieldType: item.field_type
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo desvincular la foto';
    throw new StorageValidationError(message);
  }

  const r2Key = await deleteAttachmentById(input.auditId, input.attachmentId);
  if (!r2Key) {
    throw new AttachmentNotFoundError();
  }

  await deleteObjectFromR2(r2Key);
}

/** Sube bytes a R2 desde el servidor (evita CORS del bucket en uploads del navegador). */
export async function uploadObjectToR2(input: {
  auditId: string;
  r2Key: string;
  contentType: string;
  body: ArrayBuffer | Blob;
}): Promise<void> {
  if (!isR2KeyForAudit(input.r2Key, input.auditId)) {
    throw new StorageValidationError('r2_key no corresponde a la auditoría');
  }

  const { uploadUrl, headers } = await presignPut({
    r2Key: input.r2Key,
    contentType: input.contentType
  });

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: input.body
  });

  if (!res.ok) {
    const r2Body = (await res.text()).slice(0, 200);
    logger.warn('r2_server_put_failed', {
      status: res.status,
      r2Key: input.r2Key,
      r2Body: r2Body || undefined
    });
    throw new StorageValidationError(`Falló la subida a R2 (HTTP ${res.status})`);
  }
}
