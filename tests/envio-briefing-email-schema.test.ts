/**
 * #52 T9 — R11: verificación de que la marca de "briefing enviado" se deriva de email_log
 * sin migración nueva (no hay columna audit_id en email_log).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { resetMailTransportForTests, setMailTransportForTests } from '../src/lib/server/email/transport';

describe('marca briefing derivada de email_log sin migración (#52 R11)', () => {
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

  it('email_log NO tiene columna audit_id (sin migración de #52)', async () => {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'email_log'
        AND column_name = 'audit_id'
    `;
    // R11 decidió no añadir migración; audit_id no debe existir
    expect(rows.length).toBe(0);
  });

  it('email_log tiene las columnas base de #49: to_email, template, status, created_at, sent_at', async () => {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'email_log'
      ORDER BY column_name
    `;
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('to_email');
    expect(cols).toContain('template');
    expect(cols).toContain('status');
    expect(cols).toContain('created_at');
    expect(cols).toContain('sent_at');
  });

  it('la marca se puede derivar de email_log filtrando por template y to_email', async () => {
    const email = `schema-test-${Date.now()}@empresa.com`;
    const sentAt = new Date();

    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES (${email}, 'envio_briefing_cliente', 'dry_run', null, ${sentAt})
    `;

    // Derivar la marca directamente desde la DB
    const [mark] = await sql<{ to_email: string; sent_at: Date }[]>`
      SELECT to_email, COALESCE(sent_at, created_at) AS sent_at
      FROM email_log
      WHERE template = 'envio_briefing_cliente'
        AND to_email = ${email}
        AND status <> 'fallido'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    expect(mark).toBeDefined();
    expect(mark.to_email).toBe(email);
    expect(mark.sent_at).toBeInstanceOf(Date);
  });

  it('registros fallidos no aparecen en la marca', async () => {
    const email = `schema-fallido-${Date.now()}@empresa.com`;

    await sql`
      INSERT INTO email_log (to_email, template, status, error, sent_at)
      VALUES (${email}, 'envio_briefing_cliente', 'fallido', 'SMTP error', null)
    `;

    const rows = await sql<{ id: string }[]>`
      SELECT id FROM email_log
      WHERE template = 'envio_briefing_cliente'
        AND to_email = ${email}
        AND status <> 'fallido'
    `;
    expect(rows.length).toBe(0);
  });
});
