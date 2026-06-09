import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BRIEFING_UNAVAILABLE_MESSAGE } from '../../src/lib/server/auth/briefing-token';
import { load as briefingLoad } from '../../src/routes/briefing/[token]/+page.server';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { runSeed } from '../../src/lib/server/db/seed';
import { BRIEFING_FIXTURE_TOKEN, seedBriefingAuditFixture } from '../fixtures/briefing-audit';
import { insertTestAuditRow } from '../helpers/backoffice';
import type postgres from 'postgres';

type BriefingLoadResult =
  | { available: true; items: unknown[]; stepCount: number }
  | { available: false; message: string };

describe('briefing load API', () => {
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

  it('returns form without session cookie', async () => {
    await seedBriefingAuditFixture(sql);
    const data = (await briefingLoad({
      params: { token: BRIEFING_FIXTURE_TOKEN },
      locals: { user: null },
      cookies: { get: () => undefined } as never
    } as never)) as BriefingLoadResult;

    expect(data.available).toBe(true);
    if (data.available) {
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.stepCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('shows unavailable for unknown token', async () => {
    const data = (await briefingLoad({
      params: { token: 'missing-token' },
      locals: { user: null }
    } as never)) as BriefingLoadResult;

    expect(data.available).toBe(false);
    if (!data.available) {
      expect(data.message).toBe(BRIEFING_UNAVAILABLE_MESSAGE);
    }
  });

  it.each(['en_relevamiento', 'cerrada'] as const)(
    'shows unavailable when audit is %s',
    async (status) => {
      await insertTestAuditRow(sql, {
        razonSocial: 'Avanzada',
        status,
        publicToken: `token-${status}`
      });

      const data = (await briefingLoad({
        params: { token: `token-${status}` },
        locals: { user: null }
      } as never)) as BriefingLoadResult;

      expect(data.available).toBe(false);
    }
  );
});
