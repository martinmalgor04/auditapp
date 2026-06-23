import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { createAudit } from '../../src/lib/server/backoffice/audits';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

describe('audit ref_code concurrencia (#41 R8)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoId: string;
  let empresaId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const cuit = '30-88000001-8';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM audit_ref_counter WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Concurrencia Test SA', ${cuit}, 'cliente', 'CTST')
      RETURNING id
    `;
    empresaId = emp.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('N altas paralelas misma empresa+tipo → ref_code distintos y secuenciales', async () => {
    const n = 5;
    const results = await Promise.all(
      Array.from({ length: n }, () =>
        createAudit(
          {
            clientId: empresaId,
            types: ['it'],
            segment: 'B',
            techByType: { it: tecnicoId },
            scheduledAt: '2026-08-01',
            cabResponses: {},
            confirmDuplicate: true
          },
          adminId
        )
      )
    );

    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(n);

    const codes = await sql<{ ref_code: string }[]>`
      SELECT ref_code FROM audit WHERE id = ANY(${ids}::uuid[]) ORDER BY ref_code
    `;
    const suffixes = codes.map((c) => Number(c.ref_code.split('-').pop()));
    expect(suffixes).toEqual([...suffixes].sort((a, b) => a - b));
    expect(new Set(suffixes).size).toBe(n);
    for (let i = 1; i < suffixes.length; i++) {
      expect(suffixes[i]).toBe(suffixes[i - 1] + 1);
    }
  });
});
