import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { submitBriefing } from '../../src/lib/server/briefing/submit';
import { actions } from '../../src/routes/briefing/[token]/+page.server';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { runSeed } from '../../src/lib/server/db/seed';
import { BRIEFING_FIXTURE_TOKEN, seedBriefingAuditFixture } from '../fixtures/briefing-audit';
import type postgres from 'postgres';

describe('briefing submit', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    await truncateSeedTables(sql);
    await runSeed(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('transitions briefing_enviado to briefing_completo', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql, { status: 'briefing_enviado' });
    await submitBriefing(BRIEFING_FIXTURE_TOKEN);

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('briefing_completo');
  });

  it('is idempotent when already briefing_completo', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql, { status: 'briefing_completo' });
    await expect(submitBriefing(BRIEFING_FIXTURE_TOKEN)).resolves.toBeUndefined();

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('briefing_completo');
  });

  it('form action returns success flag', async () => {
    await seedBriefingAuditFixture(sql, { status: 'briefing_enviado' });
    const result = await actions.submit({
      params: { token: BRIEFING_FIXTURE_TOKEN }
    } as never);

    expect(result).toMatchObject({ success: true });
  });
});
