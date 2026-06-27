/**
 * Tests para #51 — marca "informe enviado" derivada de email_log (R7).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { listInformeEnvios } from '../src/lib/server/informe/enviar';
import { resetMailTransportForTests, setMailTransportForTests } from '../src/lib/server/email/transport';

describe('listInformeEnvios — marca derivada de email_log (R7)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    resetMailTransportForTests();
    setMailTransportForTests({ sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) });
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('devuelve destinatario + fecha cuando hay filas (R7)', async () => {
    const toEmail = `enviado-${Date.now()}@cliente.com`;
    const sentAt = new Date();
    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES (${toEmail}, 'envio_informe_cliente', 'enviado', null, ${sentAt})
    `;

    const envios = await listInformeEnvios('any-report', toEmail);
    expect(envios.length).toBeGreaterThanOrEqual(1);
    const envio = envios[0];
    expect(envio.toEmail).toBe(toEmail);
    expect(envio.status).toBe('enviado');
    expect(typeof envio.at).toBe('string');
    // ISO format
    expect(() => new Date(envio.at)).not.toThrow();
  });

  it('reenvío agrega fila extra — marca muestra dos envíos (R7)', async () => {
    const toEmail = `doble-${Date.now()}@cliente.com`;
    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES
        (${toEmail}, 'envio_informe_cliente', 'enviado', null, now()),
        (${toEmail}, 'envio_informe_cliente', 'enviado', null, now() + interval '5 seconds')
    `;

    const envios = await listInformeEnvios('report-456', toEmail);
    expect(envios.length).toBeGreaterThanOrEqual(2);
    expect(envios.every((e) => e.toEmail === toEmail)).toBe(true);
  });

  it('no devuelve registros de otras plantillas', async () => {
    const toEmail = `otra-plantilla-${Date.now()}@cliente.com`;
    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES (${toEmail}, 'aviso_informe_aprobado', 'enviado', null, now())
    `;

    const envios = await listInformeEnvios('report-789', toEmail);
    expect(envios.length).toBe(0);
  });

  it('devuelve [] cuando empresaEmail es null', async () => {
    const envios = await listInformeEnvios('report-null', null);
    expect(envios).toEqual([]);
  });
});
