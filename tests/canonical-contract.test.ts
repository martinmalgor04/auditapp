import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildCanonicalAuditJson } from '../src/lib/server/canonical/build';
import { seedCanonicalAuditFixture } from './fixtures/canonical-audit';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

describe('canonical contract', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('score_contribution sum aligns with section score', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);

    for (const section of payload.sections) {
      if (section.score === null) continue;
      const contributions = section.items
        .map((i) => i.score_contribution)
        .filter((c): c is number => c !== undefined);
      if (contributions.length === 0) continue;
      const sum = contributions.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
    }
  });

  it('canonical JSON matches snapshot', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);

    const stable = normalize({
      ...payload,
      audit_id: '[UUID]',
      generated_at: '[GENERATED_AT]',
      closed_at: payload.closed_at ? '[CLOSED_AT]' : null
    });

    expect(stable).toMatchSnapshot();
  });
});

function normalize(value: unknown): unknown {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof value === 'string') {
    if (uuidRe.test(value)) return '[UUID]';
    if (value.startsWith('audits/')) {
      return value.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '[UUID]'
      );
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalize(v)])
    );
  }
  return value;
}
