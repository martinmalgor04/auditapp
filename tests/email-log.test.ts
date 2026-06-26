import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { listEmailLogByTemplate } from '../src/lib/server/db/email-log';
import { getTestSql } from './helpers/db';
import { sendEmail } from '../src/lib/server/email/index';
import { resetMailTransportForTests, setMailTransportForTests } from '../src/lib/server/email/transport';

const payload = {
  auditRef: 'ACME-IT-0001',
  clienteNombre: 'Acme SA',
  auditUrl: 'http://localhost:5173/auditorias/1'
};

describe('email_log (#49 R7)', () => {
  beforeEach(async () => {
    const sql = getTestSql();
    setSqlForTests(sql);
    await sql`TRUNCATE email_log RESTART IDENTITY`;
    resetMailTransportForTests();
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
  });

  afterEach(() => {
    resetMailTransportForTests();
  });

  it('dry-run inserta fila dry_run sin error ni sent_at', async () => {
    const result = await sendEmail('aviso_briefing_completado', 'a@example.com', payload);
    expect(result.status).toBe('dry_run');

    const rows = await listEmailLogByTemplate('aviso_briefing_completado');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('dry_run');
    expect(rows[0].error).toBeNull();
    expect(rows[0].sentAt).toBeNull();
    expect(rows[0].toEmail).toBe('a@example.com');
  });

  it('envío fallido inserta fallido con error', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.test.local';
    setMailTransportForTests({
      sendMail: vi.fn().mockRejectedValue(new Error('smtp down'))
    });

    const result = await sendEmail('aviso_briefing_completado', 'fail@example.com', payload);
    expect(result.status).toBe('fallido');

    const rows = await listEmailLogByTemplate('aviso_briefing_completado');
    expect(rows[0].status).toBe('fallido');
    expect(rows[0].error).toContain('smtp down');
    expect(rows[0].sentAt).toBeNull();
  });

  it('envío exitoso inserta enviado con sent_at', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.test.local';
    setMailTransportForTests({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'ok' })
    });

    const result = await sendEmail('aviso_briefing_completado', 'ok@example.com', payload);
    expect(result.status).toBe('enviado');

    const rows = await listEmailLogByTemplate('aviso_briefing_completado');
    expect(rows[0].status).toBe('enviado');
    expect(rows[0].sentAt).not.toBeNull();
  });

  it('N destinatarios insertan N filas', async () => {
    const result = await sendEmail('aviso_briefing_completado', ['a@x.com', 'b@x.com'], payload);
    expect(result.logIds).toHaveLength(2);

    const rows = await listEmailLogByTemplate('aviso_briefing_completado');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.toEmail).sort()).toEqual(['a@x.com', 'b@x.com']);
  });
});
