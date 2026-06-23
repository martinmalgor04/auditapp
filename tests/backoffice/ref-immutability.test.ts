import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { createAudit, getAuditById, updateAudit } from '../../src/lib/server/backoffice/audits';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

describe('ref_code / codigo inmutabilidad (#41 R3, R9)', () => {
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

  it('UPDATE directo a codigo/ref_code falla por trigger', async () => {
    const cuit = '30-88000002-9';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Inmutable SA', ${cuit}, 'cliente', 'IMMU')
      RETURNING id
    `;
    const { id } = await createAudit(
      {
        clientId: emp.id,
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-08-02',
        cabResponses: {}
      },
      adminId
    );

    await expect(
      sql`UPDATE empresa SET codigo = 'HACK' WHERE id = ${emp.id}`
    ).rejects.toThrow(/inmutable/i);

    await expect(
      sql`UPDATE audit SET ref_code = 'HACK-IT-0001' WHERE id = ${id}`
    ).rejects.toThrow(/inmutable/i);
  });

  it('updateAudit no altera ref_code', async () => {
    const cuit = '30-88000003-0';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Update Audit SA', ${cuit}, 'cliente', 'UPDA')
      RETURNING id
    `;
    const { id } = await createAudit(
      {
        clientId: emp.id,
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-08-03',
        cabResponses: {}
      },
      adminId
    );
    const before = (await getAuditById(id))!.refCode;
    await updateAudit(id, { segment: 'B' }, adminId);
    const after = (await getAuditById(id))!.refCode;
    expect(after).toBe(before);
  });
});
