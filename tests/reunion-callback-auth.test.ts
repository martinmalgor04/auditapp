import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as callbackHandler } from '../src/routes/api/internal/reunion/callback/+server';
import { signWebhookBody } from '../src/lib/server/reunion/pipeline/webhook';

/**
 * Seguridad del webhook interno reunion/callback (S1 / Q4 auditoría):
 * fail-closed cuando no hay secret y verificación de firma HMAC.
 * Los tres casos cubiertos cortan antes de tocar la DB.
 */
describe('reunion callback auth', () => {
  let prevSecret: string | undefined;

  beforeEach(() => {
    prevSecret = process.env.REUNION_CALLBACK_SECRET;
  });

  afterEach(() => {
    if (prevSecret === undefined) {
      delete process.env.REUNION_CALLBACK_SECRET;
    } else {
      process.env.REUNION_CALLBACK_SECRET = prevSecret;
    }
  });

  function post(body: string, signature?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (signature !== undefined) headers['x-reunion-signature'] = signature;
    return callbackHandler({
      request: new Request('http://localhost/api/internal/reunion/callback', {
        method: 'POST',
        headers,
        body
      })
    } as never);
  }

  it('rechaza con 503 si no hay REUNION_CALLBACK_SECRET (fail-closed)', async () => {
    delete process.env.REUNION_CALLBACK_SECRET;
    const res = await post(JSON.stringify({ reunion_session_id: 'x', transcript: { full_text: 'y' } }));
    expect(res.status).toBe(503);
  });

  it('rechaza con 401 si la firma HMAC es inválida', async () => {
    process.env.REUNION_CALLBACK_SECRET = 'secreto-de-prueba';
    const body = JSON.stringify({ reunion_session_id: 'x', transcript: { full_text: 'y' } });
    const res = await post(body, 'firma-incorrecta');
    expect(res.status).toBe(401);
  });

  it('con firma válida pasa el gate de auth y llega al parseo (400 si JSON inválido)', async () => {
    const secret = 'secreto-de-prueba';
    process.env.REUNION_CALLBACK_SECRET = secret;
    const body = 'esto no es json';
    const res = await post(body, signWebhookBody(body, secret));
    expect(res.status).toBe(400);
  });
});
