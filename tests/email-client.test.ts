import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { getTestSql } from './helpers/db';
import { sendEmail } from '../src/lib/server/email/index';
import {
  EMAIL_MAX_ATTEMPTS,
  resetMailTransportForTests,
  setMailTransportForTests
} from '../src/lib/server/email/transport';
import { logger } from '../src/lib/server/logger';

const ORIGINAL_ENV = { ...process.env };

const validPayload = {
  auditRef: 'ACME-IT-0001',
  clienteNombre: 'Acme SA',
  auditUrl: 'http://localhost:5173/auditorias/00000000-0000-4000-8000-000000000001'
};

describe('email client (#49 R2, R3, R4, R14)', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp',
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-secret-min-32-characters-long!!',
      PUBLIC_APP_URL: 'http://localhost:5173',
      NODE_ENV: 'test'
    };
    delete process.env.SMTP_HOST;
    setSqlForTests(getTestSql());
    resetMailTransportForTests();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetMailTransportForTests();
    vi.restoreAllMocks();
  });

  it('dry-run sin SMTP no instancia transport ni envía real (R2)', async () => {
    const sendMail = vi.fn();
    setMailTransportForTests({ sendMail });

    const result = await sendEmail('aviso_briefing_completado', 'tech@example.com', validPayload);

    expect(result.status).toBe('dry_run');
    expect(sendMail).not.toHaveBeenCalled();
    expect(result.rendered?.subject).toContain('Briefing completado');
    expect(result.rendered?.html).toContain('Servicios y Sistemas');
    expect(result.rendered?.text).toContain(validPayload.auditRef);
  });

  it('producción con SMTP mockeado envía y devuelve enviado (R3)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.test.local';
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'mock-1' });
    setMailTransportForTests({ sendMail });

    const result = await sendEmail('aviso_briefing_completado', 'tech@example.com', validPayload);

    expect(result.status).toBe('enviado');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'auditorias@serviciosysistemas.com.ar',
        to: 'tech@example.com',
        subject: expect.stringContaining('Briefing completado'),
        html: expect.stringContaining('Servicios y Sistemas'),
        text: expect.stringContaining(validPayload.auditRef)
      })
    );
  });

  it('reintenta errores transitorios y termina en enviado (R4)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.test.local';
    const sendMail = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue({ messageId: 'mock-2' });
    setMailTransportForTests({ sendMail });

    const result = await sendEmail('aviso_briefing_completado', 'tech@example.com', validPayload);

    expect(result.status).toBe('enviado');
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  it('falla tras EMAIL_MAX_ATTEMPTS intentos (R4)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.test.local';
    const sendMail = vi.fn().mockRejectedValue(new Error('timeout'));
    setMailTransportForTests({ sendMail });

    const result = await sendEmail('aviso_briefing_completado', 'tech@example.com', validPayload);

    expect(result.status).toBe('fallido');
    expect(sendMail).toHaveBeenCalledTimes(EMAIL_MAX_ATTEMPTS);
    expect(result.error).toContain('timeout');
  });

  it('logs no exponen SMTP_PASS (R14)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.test.local';
    process.env.SMTP_PASS = 'super-secret-smtp-pass-xyz';
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'mock-3' });
    setMailTransportForTests({ sendMail });

    const infoSpy = vi.spyOn(logger, 'info');
    await sendEmail('aviso_briefing_completado', 'tech@example.com', validPayload);

    const logged = infoSpy.mock.calls.flatMap((c) => JSON.stringify(c));
    expect(logged.join('\n')).not.toContain('super-secret-smtp-pass-xyz');
  });
});
