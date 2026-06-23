import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { createAuditSchema } from '../../src/lib/server/backoffice/schemas';
import { createAudit, getAuditById } from '../../src/lib/server/backoffice/audits';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

describe('single type en altas (#41 R14–R15)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('schema rechaza 2 tipos', () => {
    const parsed = createAuditSchema.safeParse({
      clientId: '00000000-0000-4000-8000-000000000001',
      types: ['it', 'erp-tango'],
      segment: 'A',
      techByType: { it: tecnicoId, 'erp-tango': tecnicoId },
      scheduledAt: '2026-08-01'
    });
    expect(parsed.success).toBe(false);
  });

  it('schema acepta 1 tipo', () => {
    const parsed = createAuditSchema.safeParse({
      clientId: '00000000-0000-4000-8000-000000000001',
      types: ['it'],
      segment: 'A',
      techByType: { it: tecnicoId },
      scheduledAt: '2026-08-01'
    });
    expect(parsed.success).toBe(true);
  });

  it('lectura de auditoría legacy multi-tipo sin error', async () => {
    const cuit = '30-88000004-1';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Legacy Read SA', ${cuit}, 'cliente', 'LGRD')
      RETURNING id
    `;
    const tplIt = (await sql<{ id: string }[]>`SELECT id FROM template WHERE code='it' LIMIT 1`)[0]
      .id;
    const tplErp = (
      await sql<{ id: string }[]>`SELECT id FROM template WHERE code='erp-tango' LIMIT 1`
    )[0].id;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (
        empresa_id, name, types, template_ids, segment, status,
        assigned_tech_id, created_by, ref_code
      )
      VALUES (
        ${emp.id}, 'Legacy', ${['it', 'erp-tango']}, ${[tplIt, tplErp]}::uuid[], 'A', 'borrador',
        ${tecnicoId}, ${adminId}, 'LGRD-IT-0001'
      )
      RETURNING id
    `;
    const detail = await getAuditById(audit.id);
    expect(detail?.types).toEqual(['it', 'erp-tango']);
    expect(detail?.refCode).toBe('LGRD-IT-0001');
  });
});
