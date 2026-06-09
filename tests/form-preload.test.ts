import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { loadAuditForm } from '../src/lib/server/form/load-form';
import { saveFormResponse } from '../src/lib/server/form/save-response';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';
import { seedAuditFormFixture } from './fixtures/audit-form';
import type postgres from 'postgres';

describe('form preload', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(async () => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('includes cliente responses with preloaded flag', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    expect(tech).toBeTruthy();

    const form = await loadAuditForm(auditId, tech!);
    const preloaded = form.sections.flatMap((s) => s.items).filter((i) => i.preloaded);
    expect(preloaded.length).toBeGreaterThan(0);
  });

  it('technician edit persists source tecnico', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const form = await loadAuditForm(auditId, tech!);
    const preloadedItem = form.sections.flatMap((s) => s.items).find((i) => i.preloaded);
    expect(preloadedItem).toBeTruthy();

    await saveFormResponse(auditId, tech!, {
      itemId: preloadedItem!.id,
      value: 'no'
    });

    const [row] = await sql<{ source: string }[]>`
      SELECT source FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${preloadedItem!.id}
    `;
    expect(row.source).toBe('tecnico');
  });
});
