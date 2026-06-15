import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import {
  processWebhookCallback,
  verifyWebhookSignature,
  type WebhookCallbackPayload
} from '$lib/server/reunion/pipeline/webhook';

export const POST: RequestHandler = async ({ request }) => {
  const secret = process.env.REUNION_CALLBACK_SECRET;

  const rawBody = await request.text();

  // Verificar firma HMAC si el secret está configurado
  if (secret) {
    const signature = request.headers.get('x-reunion-signature') ?? '';
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return json({ success: false, error: 'Firma inválida' }, { status: 401 });
    }
  }

  let payload: WebhookCallbackPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookCallbackPayload;
  } catch {
    return json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }

  if (!payload.reunion_session_id || !payload.transcript?.full_text) {
    return json(
      { success: false, error: 'Payload inválido: falta reunion_session_id o transcript' },
      { status: 400 }
    );
  }

  try {
    await processWebhookCallback(payload);
    return json({ success: true, data: null, error: null });
  } catch (err) {
    console.error('[reunion/callback]', err);
    return json(
      { success: false, error: 'Error procesando callback' },
      { status: 500 }
    );
  }
};
