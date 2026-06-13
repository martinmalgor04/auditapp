import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { columnNames, indexNames, setupTestDb, tableExists, teardownTestDb } from './helpers/db';

describe('crm schema', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('creates crm_lead with expected columns (R1)', async () => {
    expect(await tableExists(sql, 'crm_lead')).toBe(true);
    const cols = await columnNames(sql, 'crm_lead');
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'email',
        'empresa',
        'contacto',
        'telefono',
        'source',
        'status',
        'notas',
        'proxima_accion',
        'proxima_accion_fecha',
        'client_id',
        'audit_id',
        'presupuesto_ref',
        'descartado_at',
        'created_at',
        'updated_at'
      ])
    );
    const indexes = await indexNames(sql, 'crm_lead');
    expect(indexes).toContain('crm_lead_email_key');
    expect(indexes).toContain('crm_lead_status_idx');
  });

  it('creates crm_lead_event (R8)', async () => {
    expect(await tableExists(sql, 'crm_lead_event')).toBe(true);
    const cols = await columnNames(sql, 'crm_lead_event');
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'lead_id', 'from_status', 'to_status', 'changed_by', 'created_at'])
    );
  });

  it('rejects invalid source and status CHECK (R1)', async () => {
    await expect(
      sql`
        INSERT INTO crm_lead (email, empresa, source)
        VALUES ('a@b.com', 'Test', 'spam')
      `
    ).rejects.toThrow();

    await expect(
      sql`
        INSERT INTO crm_lead (email, empresa, source, status)
        VALUES ('b@b.com', 'Test', 'manual', 'ganado')
      `
    ).rejects.toThrow();
  });

  it('enforces case-insensitive email uniqueness (R1)', async () => {
    const base = `unique-${randomUUID()}@x.com`;
    await sql`
      INSERT INTO crm_lead (email, empresa, source)
      VALUES (${base}, 'Empresa', 'manual')
    `;
    await expect(
      sql`
        INSERT INTO crm_lead (email, empresa, source)
        VALUES (${base.toUpperCase()}, 'Otra', 'manual')
      `
    ).rejects.toThrow();
  });
});
