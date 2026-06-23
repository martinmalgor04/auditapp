import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { listDashboardAudits } from '../../src/lib/server/backoffice/dashboard';
import { createAudit } from '../../src/lib/server/backoffice/audits';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

describe('dashboard refCode (#41 R16)', () => {
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

  it('listDashboardAudits incluye refCode por fila', async () => {
    const cuit = '30-88000006-3';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Dashboard Ref SA', ${cuit}, 'cliente', 'DREF')
      RETURNING id
    `;
    const { id } = await createAudit(
      {
        clientId: emp.id,
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-10-01',
        cabResponses: {}
      },
      adminId
    );

    const result = await listDashboardAudits({ page: 1 });
    const row = result.rows.find((r) => r.id === id);
    expect(row?.refCode).toMatch(/^DREF-IT-\d{4}$/);
  });
});
