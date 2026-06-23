import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { validateBriefingToken } from '../../src/lib/server/briefing/validate-token';
import { createAudit } from '../../src/lib/server/backoffice/audits';
import { generateBriefingLink } from '../../src/lib/server/backoffice/briefing-link';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

describe('briefing ref_code (#41 R20)', () => {
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

  it('validateBriefingToken expone refCode', async () => {
    const cuit = '30-88000007-4';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Briefing Ref SA', ${cuit}, 'cliente', 'BREF')
      RETURNING id
    `;
    const { id } = await createAudit(
      {
        clientId: emp.id,
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-10-02',
        cabResponses: {}
      },
      adminId
    );
    const { token } = await generateBriefingLink(id);
    const ctx = await validateBriefingToken(token);
    expect(ctx.audit.refCode).toMatch(/^BREF-IT-\d{4}$/);
  });
});
