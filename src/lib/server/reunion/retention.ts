import { logger } from '$lib/server/logger';
import {
  archiveReunionSession,
  listExpiredReunionSessions
} from '$lib/server/db/reunion-sessions';
import { getAttachmentById } from '$lib/server/db/attachments';
import { getSql } from '$lib/server/db/client';
import { getAwsClient } from '$lib/server/storage/r2-client';
import { getR2Env } from '$lib/server/storage/r2-config';

function getRetentionDays(): number {
  const raw = process.env.REUNION_AUDIO_RETENTION_DAYS;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 365;
}

async function deleteR2Object(r2Key: string): Promise<void> {
  const env = getR2Env();
  const base = env.R2_ENDPOINT?.replace(/\/$/, '');
  if (!base) return;

  const url = `${base}/${env.R2_BUCKET}/${r2Key}`;
  const client = getAwsClient();
  const res = await client.fetch(url, { method: 'DELETE' });

  if (!res.ok && res.status !== 404) {
    logger.warn('reunion_r2_delete_failed', { status: res.status, r2Key });
  }
}

/**
 * Archiva sesiones de reunión con audio vencido y encola borrado R2.
 * NO borra reunion_transcript ni reunion_proposal (R22).
 */
export async function runReunionRetention(): Promise<{
  archived: number;
  r2Deleted: number;
}> {
  const retentionDays = getRetentionDays();
  const sessions = await listExpiredReunionSessions(retentionDays);

  let archived = 0;
  let r2Deleted = 0;

  for (const session of sessions) {
    try {
      // Archivar la sesión
      await archiveReunionSession(session.id);
      archived++;

      // Borrar audio de R2 si existe
      if (session.attachment_id) {
        const attachment = await getAttachmentById(session.attachment_id);
        if (attachment?.r2_key) {
          await deleteR2Object(attachment.r2_key);
          r2Deleted++;
        }
      }

      logger.info('reunion_retention_archived', {
        sessionId: session.id,
        auditId: session.audit_id
      });
    } catch (err) {
      logger.error('reunion_retention_error', {
        sessionId: session.id,
        error: String(err)
      });
    }
  }

  return { archived, r2Deleted };
}

/**
 * Devuelve la política de retención actual (días configurados).
 */
export function getReunionRetentionPolicy(): { retentionDays: number } {
  return { retentionDays: getRetentionDays() };
}
