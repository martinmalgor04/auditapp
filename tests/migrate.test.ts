import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/lib/server/db/migrate';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

describe('migration runner', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('applies migrations in order', async () => {
    const rows = await sql<{ version: string }[]>`
      SELECT version FROM schema_migration ORDER BY version
    `;
    expect(rows.map((r) => r.version)).toEqual([
      '001_schema',
      '002_backoffice',
      '003_user_audit_types',
      '004_informe_ia',
      '005_client_contactos',
      '006_entrega_informe',
      '007_psys_link',
      '008_crm_leads',
      '009_contexto_ia',
      '010_crm_lead_email_nullable'
    ]);
  });

  it('skips already applied migrations', async () => {
    const first = await runMigrations(sql);
    expect(first.applied).toEqual([]);
    expect(first.skipped).toContain('001_schema');
    expect(first.skipped).toContain('002_backoffice');
    expect(first.skipped).toContain('003_user_audit_types');
    expect(first.skipped).toContain('004_informe_ia');
    expect(first.skipped).toContain('005_client_contactos');
    expect(first.skipped).toContain('006_entrega_informe');
    expect(first.skipped).toContain('007_psys_link');
    expect(first.skipped).toContain('008_crm_leads');
    expect(first.skipped).toContain('009_contexto_ia');
    expect(first.skipped).toContain('010_crm_lead_email_nullable');

    const second = await runMigrations(sql);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain('001_schema');
    expect(second.skipped).toContain('002_backoffice');
    expect(second.skipped).toContain('003_user_audit_types');
  });
});
