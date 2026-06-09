import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetBriefingRateLimit } from '../../src/lib/server/briefing/rate-limit';
import { PATCH } from '../../src/routes/api/briefing/[token]/responses/+server';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { runSeed } from '../../src/lib/server/db/seed';
import {
  BRIEFING_FIXTURE_TOKEN,
  listClienteItemIds,
  seedBriefingAuditFixture
} from '../fixtures/briefing-audit';
import type postgres from 'postgres';

describe('briefing rate limit', () => {
  let sql: postgres.Sql;
  let itemId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    resetBriefingRateLimit();
    await truncateSeedTables(sql);
    await runSeed(sql);
    const { auditId } = await seedBriefingAuditFixture(sql);
    [itemId] = await listClienteItemIds(sql, auditId);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('returns 429 after burst over 60 req/min', async () => {
    let lastStatus = 200;

    for (let i = 0; i < 65; i++) {
      const res = await PATCH({
        params: { token: BRIEFING_FIXTURE_TOKEN },
        request: new Request('http://localhost/api/briefing/x/responses', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, value: `v${i}`, na: false })
        }),
        getClientAddress: () => '10.0.0.1'
      } as never);
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
    const body = await (
      await PATCH({
        params: { token: BRIEFING_FIXTURE_TOKEN },
        request: new Request('http://localhost/api/briefing/x/responses', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, value: 'blocked', na: false })
        }),
        getClientAddress: () => '10.0.0.1'
      } as never)
    ).json();
    expect(body.error).toContain('Demasiados intentos');
  });
});
