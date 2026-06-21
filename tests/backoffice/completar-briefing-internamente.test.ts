import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { completarBriefingInternamente } from '../../src/lib/server/backoffice/briefing-link';
import { InvalidStateTransitionError } from '../../src/lib/server/backoffice/errors';
import { setupTestDb, teardownTestDb, ensureBaselineSeed } from '../helpers/db';
import { insertTestAuditRow } from '../helpers/backoffice';

// #34 — briefing opcional: completar internamente desde el backoffice. Cubre R1, R2, R3.
describe('#34 completarBriefingInternamente', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    await ensureBaselineSeed(sql);
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // T4a: borrador → briefing_completo, public_token sigue nulo (R1)
  it('(R1) T4a: borrador → briefing_completo; public_token queda nulo', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Briefing Interno Borrador SA',
      status: 'borrador',
      publicToken: null
    });

    await completarBriefingInternamente(auditId);

    const [row] = await sql<{ status: string; public_token: string | null }[]>`
      SELECT status, public_token FROM audit WHERE id = ${auditId}
    `;
    expect(row.status).toBe('briefing_completo');
    expect(row.public_token).toBeNull();
  });

  // T4b: briefing_enviado → briefing_completo, public_token intacto (R2)
  it('(R2) T4b: briefing_enviado → briefing_completo; public_token intacto', async () => {
    const token = 'test-token-briefing-enviado-34';
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Briefing Interno Enviado SA',
      status: 'briefing_enviado',
      publicToken: token
    });

    await completarBriefingInternamente(auditId);

    const [row] = await sql<{ status: string; public_token: string | null }[]>`
      SELECT status, public_token FROM audit WHERE id = ${auditId}
    `;
    expect(row.status).toBe('briefing_completo');
    expect(row.public_token).toBe(token);
  });

  // T4c: briefing_completo → lanza InvalidStateTransitionError, estado sin cambio (R3)
  it('(R3) T4c: briefing_completo → lanza InvalidStateTransitionError', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Briefing Completo SA',
      status: 'briefing_completo',
      publicToken: 'token-completo-34'
    });

    await expect(completarBriefingInternamente(auditId)).rejects.toThrow(
      InvalidStateTransitionError
    );

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(row.status).toBe('briefing_completo');
  });

  // T4d: en_relevamiento → lanza InvalidStateTransitionError (R3)
  it('(R3) T4d: en_relevamiento → lanza InvalidStateTransitionError', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'En Relevamiento SA',
      status: 'en_relevamiento'
    });

    await expect(completarBriefingInternamente(auditId)).rejects.toThrow(
      InvalidStateTransitionError
    );

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(row.status).toBe('en_relevamiento');
  });
});
