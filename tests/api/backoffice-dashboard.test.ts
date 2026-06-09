import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listDashboardAudits, DASHBOARD_PAGE_SIZE } from '../../src/lib/server/backoffice/dashboard';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { runSeed } from '../../src/lib/server/db/seed';
import { insertTestAuditRow } from '../helpers/backoffice';
import type postgres from 'postgres';

describe('backoffice dashboard', () => {
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

  it('lists audits with required columns', async () => {
    await insertTestAuditRow(sql, { razonSocial: 'Playadito SA' });

    const result = await listDashboardAudits({ page: 1, sort: 'last_activity_desc' });

    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    const row = result.rows.find((r) => r.razonSocial === 'Playadito SA');
    expect(row).toBeDefined();
    expect(row?.types).toEqual(['it']);
    expect(row?.techName).toBeTruthy();
    expect(row?.status).toBe('borrador');
    expect(row?.progress).toBeDefined();
  });

  it('filters by type, status and client', async () => {
    const { clientId } = await insertTestAuditRow(sql, {
      razonSocial: 'Cliente IT',
      types: ['it'],
      status: 'borrador'
    });
    await insertTestAuditRow(sql, {
      razonSocial: 'Cliente ERP',
      types: ['erp-tango'],
      status: 'en_relevamiento'
    });

    const byType = await listDashboardAudits({
      type: 'erp-tango',
      page: 1,
      sort: 'last_activity_desc'
    });
    expect(byType.rows.every((r) => r.types.includes('erp-tango'))).toBe(true);

    const byStatus = await listDashboardAudits({
      status: 'borrador',
      page: 1,
      sort: 'last_activity_desc'
    });
    expect(byStatus.rows.every((r) => r.status === 'borrador')).toBe(true);

    const byClient = await listDashboardAudits({
      clientId,
      page: 1,
      sort: 'last_activity_desc'
    });
    expect(byClient.rows.every((r) => r.clientId === clientId)).toBe(true);
  });

  it('search matches client razon_social', async () => {
    await insertTestAuditRow(sql, { razonSocial: 'Mazzoni Distribución' });
    await insertTestAuditRow(sql, { razonSocial: 'Otro Cliente' });

    const result = await listDashboardAudits({
      q: 'mazzoni',
      page: 1,
      sort: 'last_activity_desc'
    });

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].razonSocial).toContain('Mazzoni');
  });

  it('sorts by scheduled_at and by last activity', async () => {
    await insertTestAuditRow(sql, {
      razonSocial: 'Antigua',
      scheduledAt: new Date('2026-01-01')
    });
    const { auditId: newerId } = await insertTestAuditRow(sql, {
      razonSocial: 'Reciente',
      scheduledAt: new Date('2026-12-01')
    });

    const itemId = await import('../helpers/backoffice').then((m) =>
      m.getFirstTemplateItemId(sql, 'it')
    );
    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, source, updated_at)
      VALUES (${newerId}, ${itemId}, ${sql.json('x')}, 'admin', ${new Date('2026-12-31')})
      ON CONFLICT (audit_id, item_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
    `;

    const byScheduled = await listDashboardAudits({
      sort: 'scheduled_at_asc',
      page: 1
    });
    expect(byScheduled.rows[0].razonSocial).toBe('Antigua');

    const byActivity = await listDashboardAudits({
      sort: 'last_activity_desc',
      page: 1
    });
    expect(byActivity.rows[0].razonSocial).toBe('Reciente');
  });

  it('returns page size limit and next cursor', async () => {
    for (let i = 0; i < 55; i++) {
      await insertTestAuditRow(sql, { razonSocial: `Cliente ${i}` });
    }

    const page1 = await listDashboardAudits({ page: 1, sort: 'last_activity_desc' });
    expect(page1.rows.length).toBe(DASHBOARD_PAGE_SIZE);
    expect(page1.hasNext).toBe(true);
    expect(page1.total).toBe(55);

    const page2 = await listDashboardAudits({ page: 2, sort: 'last_activity_desc' });
    expect(page2.rows.length).toBe(5);
    expect(page2.hasNext).toBe(false);
  });

  it('excludes archived audits', async () => {
    await insertTestAuditRow(sql, {
      razonSocial: 'Archivada',
      archivedAt: new Date()
    });

    const result = await listDashboardAudits({ page: 1, sort: 'last_activity_desc' });
    expect(result.rows.find((r) => r.razonSocial === 'Archivada')).toBeUndefined();
  });
});
