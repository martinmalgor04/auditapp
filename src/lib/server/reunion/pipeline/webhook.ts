import { createHmac } from 'node:crypto';
import { logger } from '$lib/server/logger';
import { getReunionSessionById } from '$lib/server/db/reunion-sessions';
import { getAttachmentById } from '$lib/server/db/attachments';
import { upsertReunionTranscript } from '$lib/server/db/reunion-transcripts';
import { insertReunionProposals } from '$lib/server/db/reunion-proposals';
import { updateReunionSessionStatus } from '$lib/server/db/reunion-sessions';
import { buildTemplateContextForExtraction } from './context';
import { reunionProposalSchema } from '../schemas';
import { parseFormValue } from '$lib/server/form/schemas';
import type { FieldType } from '$lib/server/db/field-schemas';

export type WebhookCallbackPayload = {
  reunion_session_id: string;
  transcript: {
    full_text: string;
    segments?: Array<{ start_ms: number; end_ms: number; text: string }>;
  };
  proposals: Array<{
    item_id: string;
    proposed_value: unknown;
    quote: string;
    confidence: number;
  }>;
};

/** Genera firma HMAC-SHA256 del body para header X-Reunion-Signature. */
export function signWebhookBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Verifica firma del callback entrante. */
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = signWebhookBody(body, secret);
  // Comparación constante para evitar timing attacks
  try {
    const buf1 = Buffer.from(expected, 'utf8');
    const buf2 = Buffer.from(signature, 'utf8');
    if (buf1.length !== buf2.length) return false;
    let diff = 0;
    for (let i = 0; i < buf1.length; i++) {
      diff |= buf1[i]! ^ buf2[i]!;
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/** Dispara el webhook n8n con los datos de la sesión. */
export async function dispatchReunionWebhook(sessionId: string): Promise<void> {
  const webhookUrl = process.env.N8N_REUNION_WEBHOOK_URL;
  const callbackBase = process.env.REUNION_CALLBACK_BASE_URL ?? process.env.PUBLIC_APP_URL ?? '';
  const secret = process.env.REUNION_CALLBACK_SECRET;

  if (!webhookUrl) {
    throw new Error('N8N_REUNION_WEBHOOK_URL no configurado');
  }

  const session = await getReunionSessionById(sessionId);
  if (!session) {
    throw new Error(`Sesión ${sessionId} no encontrada`);
  }

  const attachment = session.attachment_id
    ? await getAttachmentById(session.attachment_id)
    : null;

  const context = await buildTemplateContextForExtraction(session.audit_id);
  const callbackUrl = `${callbackBase.replace(/\/$/, '')}/api/internal/reunion/callback`;

  const body = JSON.stringify({
    reunion_session_id: sessionId,
    audit_id: session.audit_id,
    r2_key: attachment?.r2_key ?? null,
    callback_url: callbackUrl,
    template_context: context
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (secret) {
    headers['X-Reunion-Signature'] = signWebhookBody(body, secret);
  }

  const res = await fetch(webhookUrl, { method: 'POST', headers, body });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook error ${res.status}: ${text.slice(0, 200)}`);
  }

  logger.info('reunion_webhook_dispatched', { sessionId, webhookUrl });
}

/** Procesa el callback n8n con transcript y propuestas. */
export async function processWebhookCallback(
  payload: WebhookCallbackPayload
): Promise<void> {
  const { reunion_session_id: sessionId, transcript, proposals: rawProposals } = payload;

  const session = await getReunionSessionById(sessionId);
  if (!session) {
    throw new Error(`Sesión ${sessionId} no encontrada`);
  }

  // Guardar transcript
  await upsertReunionTranscript({
    reunionSessionId: sessionId,
    status: 'ready',
    fullText: transcript.full_text,
    segments: transcript.segments,
    sttProvider: 'n8n'
  });

  // Construir contexto para validar propuestas
  const context = await buildTemplateContextForExtraction(session.audit_id);
  const contextMap = new Map(context.items.map((i) => [i.item_id, i]));

  const validProposals: Array<{
    reunionSessionId: string;
    itemId: string;
    proposedValue: unknown;
    quote: string;
    confidence: number;
  }> = [];

  for (const raw of rawProposals) {
    const validation = reunionProposalSchema.safeParse(raw);
    if (!validation.success) {
      logger.warn('reunion_callback_proposal_invalid', { raw });
      continue;
    }

    const p = validation.data;
    const contextItem = contextMap.get(p.item_id);
    if (!contextItem) {
      logger.warn('reunion_callback_unknown_item', { item_id: p.item_id });
      continue;
    }

    try {
      const validValue = parseFormValue(
        contextItem.field_type as FieldType,
        contextItem.options,
        p.proposed_value,
        false
      );
      validProposals.push({
        reunionSessionId: sessionId,
        itemId: p.item_id,
        proposedValue: validValue,
        quote: p.quote,
        confidence: p.confidence
      });
    } catch {
      logger.warn('reunion_callback_value_invalid', { item_id: p.item_id });
    }
  }

  if (validProposals.length > 0) {
    await insertReunionProposals(validProposals);
  }

  await updateReunionSessionStatus(sessionId, 'ready_for_review');
  logger.info('reunion_callback_processed', { sessionId, proposals: validProposals.length });
}
