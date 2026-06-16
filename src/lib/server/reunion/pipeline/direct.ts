import { logger } from '$lib/server/logger';
import { getAttachmentById } from '$lib/server/db/attachments';
import { getReunionSessionById, updateReunionSessionStatus } from '$lib/server/db/reunion-sessions';
import { upsertReunionTranscript } from '$lib/server/db/reunion-transcripts';
import { insertReunionProposals } from '$lib/server/db/reunion-proposals';
import { presignGet } from '$lib/server/storage/presign';
import { buildTemplateContextForExtraction } from './context';
import { getSttAdapter } from './stt';
import { extractProposals } from './extract';

/**
 * Pipeline directo: STT + LLM in-process.
 * Corre en background tras confirm del audio (R9, R11, R15, R21).
 */
/**
 * @param skipStt Si true, el transcript ya existe (upload directo) — saltar STT y solo extraer propuestas.
 */
export async function processReunionJobDirect(sessionId: string, skipStt = false): Promise<void> {
  const session = await getReunionSessionById(sessionId);
  if (!session) throw new Error(`Sesión ${sessionId} no encontrada`);

  let transcriptText: string;

  if (skipStt) {
    // El transcript ya fue insertado por la ruta /upload — solo leerlo
    const { getReunionTranscriptBySession } = await import('$lib/server/db/reunion-transcripts');
    const transcript = await getReunionTranscriptBySession(sessionId);
    if (!transcript?.full_text) {
      await updateReunionSessionStatus(sessionId, 'error', 'Transcript no disponible');
      return;
    }
    transcriptText = transcript.full_text;
  } else {
    if (!session.attachment_id) throw new Error(`Sesión ${sessionId} no tiene audio confirmado`);
    const attachment = await getAttachmentById(session.attachment_id);
    if (!attachment) throw new Error(`Attachment ${session.attachment_id} no encontrado`);

    await upsertReunionTranscript({
      reunionSessionId: sessionId,
      status: 'processing',
      sttProvider: process.env.REUNION_STT_PROVIDER ?? 'openai'
    });

    try {
      const { downloadUrl } = await presignGet({ r2Key: attachment.r2_key });
      const stt = getSttAdapter();
      const sttResult = await stt.transcribe(downloadUrl, attachment.content_type);

      await upsertReunionTranscript({
        reunionSessionId: sessionId,
        status: 'ready',
        fullText: sttResult.full_text,
        segments: sttResult.segments,
        sttProvider: sttResult.provider,
        language: sttResult.language
      });

      transcriptText = sttResult.full_text;
      logger.info('reunion_stt_done', { sessionId, chars: transcriptText.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('reunion_stt_error', { sessionId, error: msg });
      await upsertReunionTranscript({ reunionSessionId: sessionId, status: 'error', errorMessage: msg });
      await updateReunionSessionStatus(sessionId, 'error', msg);
      return;
    }
  }

  try {
    // 3. Extracción IA
    const context = await buildTemplateContextForExtraction(session.audit_id);
    const proposals = await extractProposals(transcriptText, context);

    // 4. Persistir propuestas (R15: NUNCA tocar audit_response aquí)
    if (proposals.length > 0) {
      await insertReunionProposals(
        proposals.map((p) => ({
          reunionSessionId: sessionId,
          itemId: p.item_id,
          proposedValue: p.proposed_value,
          quote: p.quote,
          confidence: p.confidence
        }))
      );
    }

    // 5. Sesión lista para revisión
    await updateReunionSessionStatus(sessionId, 'ready_for_review');
    logger.info('reunion_pipeline_done', { sessionId, proposals: proposals.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('reunion_extract_error', { sessionId, error: msg });
    await updateReunionSessionStatus(sessionId, 'error', msg);
  }
}
