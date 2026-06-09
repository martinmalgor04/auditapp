import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BRIEFING_UNAVAILABLE_MESSAGE } from '../../src/lib/server/auth/briefing-token';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { confirmClosure } from '../../src/lib/server/scoring/persist';
import { load as briefingLoad } from '../../src/routes/briefing/[token]/+page.server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('closure confirm', () => {
  let sql: postgres.Sql;
  const token = 'confirm-closure-token';

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('confirm with empty fields shows warning and succeeds', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre', publicToken: token });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    const result = await confirmClosure(auditId, tech!);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings).toContain('top_risks');

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('cerrada');
  });

  it('confirm sets cerrada closed_at closed_by', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await confirmClosure(auditId, tech!);

    const [audit] = await sql<{ status: string; closed_at: Date | null }[]>`
      SELECT status, closed_at FROM audit WHERE id = ${auditId}
    `;
    const [closure] = await sql<{ closed_at: Date | null; closed_by: string }[]>`
      SELECT closed_at, closed_by FROM audit_closure WHERE audit_id = ${auditId}
    `;

    expect(audit.status).toBe('cerrada');
    expect(audit.closed_at).not.toBeNull();
    expect(closure.closed_at).not.toBeNull();
    expect(closure.closed_by).toBe(tech!.id);
  });

  it('closed audit has null public_token; briefing route shows friendly error', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre', publicToken: token });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    await confirmClosure(auditId, tech!);

    const [audit] = await sql<{ public_token: string | null }[]>`
      SELECT public_token FROM audit WHERE id = ${auditId}
    `;
    expect(audit.public_token).toBeNull();

    const data = (await briefingLoad({
      params: { token },
      locals: { user: null }
    } as never)) as { available: boolean; message?: string };

    expect(data.available).toBe(false);
    if (!data.available) {
      expect(data.message).toBe(BRIEFING_UNAVAILABLE_MESSAGE);
    }
  });
});
