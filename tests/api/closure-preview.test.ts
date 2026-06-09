import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { saveClosureFields } from '../../src/lib/server/scoring/persist';
import { load as previewLoad } from '../../src/routes/(app)/auditorias/[id]/cierre/preview/+page.server';
import type { ReportPreview } from '../../src/lib/server/canonical/preview';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('closure preview', () => {
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

  it('preview includes client indices risks wins next_step; excludes upsell', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await saveClosureFields(
      auditId,
      {
        topRisks: [{ text: 'Riesgo X', severity: 'media' }],
        quickWins: ['Win 1'],
        upsellFindings: ['Upsell secreto'],
        nextStep: 'Implementar MFA'
      },
      tech!
    );

    const data = (await previewLoad({
      params: { id: auditId },
      locals: { user: tech }
    } as never)) as { preview: ReportPreview; auditId: string };

    expect(data.preview.client.razonSocial).toBeTruthy();
    expect(data.preview.indices.it).not.toBeNull();
    expect(data.preview.topRisks).toHaveLength(1);
    expect(data.preview.quickWins).toContain('Win 1');
    expect(data.preview.nextStep).toBe('Implementar MFA');
    expect(JSON.stringify(data.preview)).not.toContain('Upsell secreto');
  });
});
