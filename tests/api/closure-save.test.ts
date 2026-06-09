import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { saveClosureFields } from '../../src/lib/server/scoring/persist';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('closure save', () => {
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

  it('saves up to five risks with severity enum', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await saveClosureFields(
      auditId,
      {
        topRisks: [
          { text: 'Sin MFA', severity: 'alta' },
          { text: 'Backup sin probar', severity: 'critica' }
        ],
        quickWins: [],
        upsellFindings: [],
        nextStep: null
      },
      tech!
    );

    const [closure] = await sql<{ top_risks: Array<{ text: string; severity: string }> }[]>`
      SELECT top_risks FROM audit_closure WHERE audit_id = ${auditId}
    `;
    expect(closure.top_risks).toHaveLength(2);
    expect(closure.top_risks[0].severity).toBe('alta');
  });

  it('saves quick wins array', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await saveClosureFields(
      auditId,
      {
        topRisks: [],
        quickWins: ['Activar MFA', 'Renovar switch'],
        upsellFindings: [],
        nextStep: null
      },
      tech!
    );

    const [closure] = await sql<{ quick_wins: string[] }[]>`
      SELECT quick_wins FROM audit_closure WHERE audit_id = ${auditId}
    `;
    expect(closure.quick_wins).toEqual(['Activar MFA', 'Renovar switch']);
  });

  it('upsell persisted; not exposed in public briefing', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, {
      status: 'en_cierre',
      publicToken: 'upsell-test-token'
    });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await saveClosureFields(
      auditId,
      {
        topRisks: [],
        quickWins: [],
        upsellFindings: ['Renovar firewall'],
        nextStep: null
      },
      tech!
    );

    const [closure] = await sql<{ upsell_findings: string[] }[]>`
      SELECT upsell_findings FROM audit_closure WHERE audit_id = ${auditId}
    `;
    expect(closure.upsell_findings).toContain('Renovar firewall');
  });

  it('saves next_step with max length', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const nextStep = 'A'.repeat(2000);

    await saveClosureFields(
      auditId,
      { topRisks: [], quickWins: [], upsellFindings: [], nextStep },
      tech!
    );

    const [closure] = await sql<{ next_step: string }[]>`
      SELECT next_step FROM audit_closure WHERE audit_id = ${auditId}
    `;
    expect(closure.next_step).toHaveLength(2000);
  });
});
