import type { AppUser } from '$lib/server/auth/types';
import { insertAttachment } from '$lib/server/db/attachments';
import {
  getReunionSessionById,
  setReunionSessionAttachment,
  updateReunionSessionStatus
} from '$lib/server/db/reunion-sessions';
import { isR2KeyForAudit } from '$lib/server/storage/r2-keys';
import { buildReunionR2Key } from '$lib/server/storage/r2-keys';
import { presignPut, type PresignPutResult } from '$lib/server/storage/presign';
import {
  ReunionConsentRequiredError,
  ReunionSessionNotFoundError
} from './errors';
import { assertReunionAccess, assertReunionEditableStatus } from './guards';
import { enqueueReunionProcessing } from './pipeline/worker';
import type { ReunionAudioPresignInput, ReunionConfirmInput } from './schemas';

function extFromContentType(contentType: string): 'webm' | 'm4a' | 'mp3' {
  if (contentType === 'audio/webm') return 'webm';
  if (contentType === 'audio/mp4' || contentType === 'audio/x-m4a') return 'm4a';
  return 'mp3';
}

export async function requestReunionAudioUpload(
  auditId: string,
  sessionId: string,
  user: AppUser,
  input: ReunionAudioPresignInput
): Promise<PresignPutResult & { r2Key: string }> {
  const audit = await assertReunionAccess(auditId, user);
  assertReunionEditableStatus(audit.status);

  const session = await getReunionSessionById(sessionId);
  if (!session || session.audit_id !== auditId) {
    throw new ReunionSessionNotFoundError();
  }

  if (!session.consent_recorded_at) {
    throw new ReunionConsentRequiredError();
  }

  const ext = extFromContentType(input.content_type);
  const r2Key = buildReunionR2Key(auditId, ext);

  await updateReunionSessionStatus(sessionId, 'uploading');

  const result = await presignPut({ r2Key, contentType: input.content_type });

  return { ...result, r2Key };
}

export async function confirmReunionAudio(
  auditId: string,
  sessionId: string,
  user: AppUser,
  input: ReunionConfirmInput
): Promise<{ attachmentId: string }> {
  const audit = await assertReunionAccess(auditId, user);
  assertReunionEditableStatus(audit.status);

  const session = await getReunionSessionById(sessionId);
  if (!session || session.audit_id !== auditId) {
    throw new ReunionSessionNotFoundError();
  }

  if (!session.consent_recorded_at) {
    throw new ReunionConsentRequiredError();
  }

  if (!isR2KeyForAudit(input.r2_key, auditId)) {
    throw new Error('r2_key no corresponde a la auditoría');
  }

  if (!input.r2_key.includes('/_reunion/')) {
    throw new Error('r2_key debe ser de tipo _reunion');
  }

  const attachmentId = await insertAttachment({
    auditId,
    itemId: null,
    r2Key: input.r2_key,
    filename: input.filename,
    contentType: input.content_type,
    sizeBytes: input.size_bytes,
    kind: 'recording',
    uploadedBy: user.id
  });

  await setReunionSessionAttachment(sessionId, attachmentId, 'processing');

  // Encolar pipeline async (no bloquea la respuesta HTTP)
  enqueueReunionProcessing(sessionId).catch((err) =>
    console.error('[reunion] enqueue error', err)
  );

  return { attachmentId };
}
