import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { listDashboardAudits } from '../../src/lib/server/backoffice/dashboard';
import { createAudit, getAuditById } from '../../src/lib/server/backoffice/audits';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

describe('rutas siguen usando uuid (#41 R25)', () => {
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

  it('audit.id sigue siendo uuid; ref_code es distinto', async () => {
    const cuit = '30-88000008-5';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Routes UUID SA', ${cuit}, 'cliente', 'RUID')
      RETURNING id
    `;
    const { id } = await createAudit(
      {
        clientId: emp.id,
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-10-03',
        cabResponses: {}
      },
      adminId
    );

    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    const detail = await getAuditById(id);
    expect(detail!.refCode).not.toBe(id);
    expect(detail!.refCode).toMatch(/^RUID-IT-/);

    const dash = await listDashboardAudits({ page: 1 });
    const row = dash.rows.find((r) => r.id === id);
    expect(row!.id).toBe(id);
    expect(`/auditorias/${row!.id}`).toBe(`/auditorias/${id}`);
  });
});
