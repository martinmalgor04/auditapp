import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildCanonicalAuditJson } from '../src/lib/server/canonical/build';
import {
  buildClientReportPreview,
  buildReportPreview,
  stripInternalFindings
} from '../src/lib/server/canonical/preview';
import { seedCanonicalAuditFixture } from './fixtures/canonical-audit';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

describe('canonical preview', () => {
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

  it('preview indices match canonical indices', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const canonical = await buildCanonicalAuditJson(auditId);
    const preview = buildReportPreview(canonical);

    expect(preview.indices.it).toBe(canonical.indices.it);
    expect(preview.indices.erp).toBe(canonical.indices.erp);
  });

  it('preview risks match canonical top_risks', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const canonical = await buildCanonicalAuditJson(auditId);
    const preview = buildReportPreview(canonical);

    expect(preview.topRisks).toEqual(canonical.top_risks);
  });

  it('internal preview includes upsell_findings', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const canonical = await buildCanonicalAuditJson(auditId);
    const preview = buildReportPreview(canonical);

    expect(preview.upsellFindings.length).toBeGreaterThan(0);
    expect(preview.upsellFindings[0].internal).toBe(true);
  });

  it('stripInternalFindings removes internal upsell entries', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const canonical = await buildCanonicalAuditJson(auditId);
    const stripped = stripInternalFindings(canonical);

    expect(stripped.upsell_findings).toHaveLength(0);
  });

  it('client preview excludes upsell text', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const canonical = await buildCanonicalAuditJson(auditId);
    const preview = buildClientReportPreview(canonical);

    expect(JSON.stringify(preview)).not.toContain('Renovar servidores EOL');
  });
});
