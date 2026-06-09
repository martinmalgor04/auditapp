import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { saveFormResponse } from '../../src/lib/server/form/save-response';
import { PATCH } from '../../src/routes/api/audits/[auditId]/responses/+server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedAuditFormFixture, getScoredSelectItem } from '../fixtures/audit-form';
import type postgres from 'postgres';
import type { AppUser } from '../../src/lib/server/auth/types';

function staffLocals(user: AppUser): App.Locals {
  return { user } as App.Locals;
}

describe('audit form save', () => {
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

  it('two PATCH of same item update one row with source tecnico', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const scored = await getScoredSelectItem(sql, auditId);
    expect(scored).toBeTruthy();

    await saveFormResponse(auditId, tech!, {
      itemId: scored!.itemId,
      value: scored!.choices[0]
    });
    await saveFormResponse(auditId, tech!, {
      itemId: scored!.itemId,
      value: scored!.choices[1] ?? scored!.choices[0]
    });

    const [row] = await sql<
      { source: string; updated_by: string; count: string }[]
    >`
      SELECT source, updated_by::text,
        (SELECT COUNT(*)::text FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${scored!.itemId}) AS count
      FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${scored!.itemId}
    `;
    expect(row.count).toBe('1');
    expect(row.source).toBe('tecnico');
    expect(row.updated_by).toBe(tech!.id);
  });

  it('PATCH endpoint returns envelope with sectionScore', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const scored = await getScoredSelectItem(sql, auditId);

    const res = await PATCH({
      params: { auditId },
      request: new Request('http://localhost/api/audits/x/responses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: scored!.itemId, value: scored!.choices[0], na: false })
      }),
      locals: staffLocals(tech!)
    } as never);

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.updatedAt).toBeTruthy();
    expect(body.data.sectionScore).toBeTruthy();
  });
});
