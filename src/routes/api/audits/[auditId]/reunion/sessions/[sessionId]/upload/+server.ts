import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/require-staff';
import { getReunionSessionById, updateReunionSessionStatus } from '$lib/server/db/reunion-sessions';
import { upsertReunionTranscript } from '$lib/server/db/reunion-transcripts';
import { assertReunionAccess, assertReunionEditableStatus } from '$lib/server/reunion/guards';
import { ReunionSessionNotFoundError, ReunionConsentRequiredError } from '$lib/server/reunion/errors';
import { getSttAdapter } from '$lib/server/reunion/pipeline/stt';
import { enqueueReunionProcessing } from '$lib/server/reunion/pipeline/worker';
import { insertAttachment } from '$lib/server/db/attachments';

const REUNION_MAX_BYTES = parseInt(process.env.REUNION_MAX_AUDIO_BYTES ?? '104857600');
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a', 'audio/ogg'];

/**
 * POST /api/audits/[auditId]/reunion/sessions/[sessionId]/upload
 * Recibe el audio directamente (sin pasar por R2), lo transcribe con Whisper
 * y guarda solo el texto. Sin CORS: el browser habla con nuestro propio servidor.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = requireStaffApi(locals);
  if (user instanceof Response) return user;

  const { auditId, sessionId } = params;
  if (!auditId || !sessionId) return apiError('Parámetros inválidos', 400);

  try {
    const audit = await assertReunionAccess(auditId, user);
    assertReunionEditableStatus(audit.status);

    const session = await getReunionSessionById(sessionId);
    if (!session || session.audit_id !== auditId) throw new ReunionSessionNotFoundError();
    if (!session.consent_recorded_at) throw new ReunionConsentRequiredError();

    // Leer body
    let body: ArrayBuffer;
    try {
      body = await request.arrayBuffer();
    } catch {
      return apiError('Error leyendo el audio', 400);
    }

    if (body.byteLength === 0) return apiError('El audio está vacío', 400);
    if (body.byteLength > REUNION_MAX_BYTES) return apiError('Audio demasiado grande (máx 100 MB)', 413);

    const contentType = request.headers.get('content-type')?.split(';')[0]?.trim() ?? 'audio/webm';
    if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
      return apiError(`Formato no soportado: ${contentType}`, 400);
    }

    const filename = request.headers.get('x-filename') ?? `reunion.${contentType.split('/')[1] ?? 'webm'}`;

    // Marcar sesión como procesando
    await updateReunionSessionStatus(sessionId, 'processing');

    // Registrar attachment mínimo (sin r2_key — texto es suficiente)
    const attachmentId = await insertAttachment({
      auditId,
      itemId: null,
      r2Key: `audits/${auditId}/_reunion/${sessionId}.${contentType.split('/')[1] ?? 'webm'}`,
      filename,
      contentType,
      sizeBytes: body.byteLength,
      kind: 'recording',
      uploadedBy: user.id
    });

    // Transcribir directamente (sin R2)
    const stt = getSttAdapter();
    let transcriptText: string;
    try {
      const result = await stt.transcribeBuffer(body, contentType, filename);
      transcriptText = result.full_text;
      await upsertReunionTranscript({
        reunionSessionId: sessionId,
        status: 'ready',
        fullText: result.full_text,
        sttProvider: result.provider,
        language: result.language,
        segments: result.segments
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error STT';
      console.error('[reunion/upload] STT error', msg);
      await upsertReunionTranscript({
        reunionSessionId: sessionId,
        status: 'error',
        errorMessage: msg
      });
      await updateReunionSessionStatus(sessionId, 'error', msg);
      return apiError(`Error al transcribir: ${msg}`, 500);
    }

    // Encolar extracción IA de propuestas
    enqueueReunionProcessing(sessionId, { skipStt: true }).catch((e) =>
      console.error('[reunion] enqueue error', e)
    );

    return apiSuccess({ attachment_id: attachmentId, transcript_preview: transcriptText.slice(0, 200) });
  } catch (err) {
    if (err instanceof ReunionSessionNotFoundError) return apiError('Sesión no encontrada', 404);
    if (err instanceof ReunionConsentRequiredError) return apiError('Consentimiento requerido', 400);
    console.error('[reunion/upload]', err);
    return apiError('Error interno', 500);
  }
};
