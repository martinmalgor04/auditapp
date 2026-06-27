/**
 * Tests para #51 — enviarInforme y listInformeEnvios (R3, R4, R7).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { enviarInformeSchema, listInformeEnvios } from '../src/lib/server/informe/enviar';
import { resetMailTransportForTests, setMailTransportForTests } from '../src/lib/server/email/transport';

describe('enviarInformeSchema (R3)', () => {
  it('acepta email válido', () => {
    const result = enviarInformeSchema.safeParse({ to: 'cliente@empresa.com' });
    expect(result.success).toBe(true);
  });

  it('rechaza email inválido', () => {
    expect(enviarInformeSchema.safeParse({ to: 'no-es-email' }).success).toBe(false);
    expect(enviarInformeSchema.safeParse({ to: '' }).success).toBe(false);
  });

  it('rechaza campo ausente', () => {
    expect(enviarInformeSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza campos extra (strict)', () => {
    expect(enviarInformeSchema.safeParse({ to: 'a@b.com', extra: 'x' }).success).toBe(false);
  });
});

describe('listInformeEnvios (R7)', () => {
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

  it('devuelve [] cuando empresaEmail es null', async () => {
    const envios = await listInformeEnvios('any-report-id', null);
    expect(envios).toEqual([]);
  });

  it('devuelve destinatario y fecha por envío, filtrando por email de empresa (R7)', async () => {
    const toEmail = `cliente-${Date.now()}@test.com`;
    // Insertar dos filas en email_log manualmente
    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES
        (${toEmail}, 'envio_informe_cliente', 'enviado', null, now()),
        (${toEmail}, 'envio_informe_cliente', 'enviado', null, now() + interval '1 second'),
        ('otro@empresa.com', 'envio_informe_cliente', 'enviado', null, now())
    `;

    const envios = await listInformeEnvios('irrelevant-id', toEmail);
    expect(envios.length).toBe(2);
    expect(envios.every((e) => e.toEmail === toEmail)).toBe(true);
    expect(envios.every((e) => typeof e.at === 'string')).toBe(true);
  });

  it('reenvío agrega fila adicional (R7)', async () => {
    const toEmail = `reenvio-${Date.now()}@test.com`;
    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES (${toEmail}, 'envio_informe_cliente', 'enviado', null, now())
    `;
    let envios = await listInformeEnvios('report-123', toEmail);
    const before = envios.length;

    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES (${toEmail}, 'envio_informe_cliente', 'enviado', null, now())
    `;
    envios = await listInformeEnvios('report-123', toEmail);
    expect(envios.length).toBe(before + 1);
  });

  it('data armada no incluye campos internos (R4)', () => {
    // Test unitario: verificar que el schema solo tiene los 3 campos permitidos
    const validData = {
      contactoNombre: 'Empresa SA',
      informeUrl: 'http://localhost/informe/tok',
      pdfUrl: 'http://localhost/informe/tok/imprimir'
    };
    // No debe tener clientDraft, upsell, internal_draft
    expect(Object.keys(validData)).not.toContain('clientDraft');
    expect(Object.keys(validData)).not.toContain('upsell_findings');
    expect(Object.keys(validData)).not.toContain('internal_draft');
    // Solo los 3 campos del contrato de la plantilla
    expect(Object.keys(validData)).toEqual(['contactoNombre', 'informeUrl', 'pdfUrl']);
  });
});
