import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import {
  processWebhookCallback,
  verifyWebhookSignature,
  type WebhookCallbackPayload
} from '$lib/server/reunion/pipeline/webhook';

export const POST: RequestHandler = async ({ request }) => {
  const secret = process.env.REUNION_CALLBACK_SECRET;

  // Fail-closed: sin secret configurado NO se acepta ningún callback. De lo
  // contrario el endpoint quedaría abierto y permitiría inyectar transcript y
  // propuestas en cualquier sesión de auditoría sin autenticar.
  if (!secret) {
    console.error('[reunion/callback] REUNION_CALLBACK_SECRET no configurado — callback rechazado');
    return json(
      { success: false, error: 'Webhook no configurado' },
      { status: 503 }
    );
  }

  const rawBody = await request.text();

  // Verificar firma HMAC (siempre, el secret está garantizado arriba)
  const signature = request.headers.get('x-reunion-signature') ?? '';
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return json({ success: false, error: 'Firma inválida' }, { status: 401 });
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
