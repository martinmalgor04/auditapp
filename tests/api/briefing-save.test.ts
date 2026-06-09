import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BriefingItemNotAllowedError } from '../../src/lib/server/briefing/errors';
import { saveBriefingResponse } from '../../src/lib/server/briefing/save-response';
import { PATCH } from '../../src/routes/api/briefing/[token]/responses/+server';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { runSeed } from '../../src/lib/server/db/seed';
import {
  BRIEFING_FIXTURE_TOKEN,
  listClienteItemIds,
  listTecnicoItemId,
  seedBriefingAuditFixture
} from '../fixtures/briefing-audit';
import type postgres from 'postgres';

describe('briefing save', () => {
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

  it('upserts audit_response with source cliente', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql);
    const [itemId] = await listClienteItemIds(sql, auditId);

    await saveBriefingResponse(BRIEFING_FIXTURE_TOKEN, itemId, { value: 'Rubro test' });
    await saveBriefingResponse(BRIEFING_FIXTURE_TOKEN, itemId, { value: 'Rubro actualizado' });

    const [row] = await sql<
      { value: string; source: string; updated_by: string | null; count: string }[]
    >`
      SELECT value, source, updated_by,
        (SELECT COUNT(*)::text FROM audit_response WHERE audit_id = ${auditId}) AS count
      FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;

    expect(row.source).toBe('cliente');
    expect(row.updated_by).toBeNull();
    expect(row.value).toBe('Rubro actualizado');
    expect(row.count).toBe('1');
  });

  it('PATCH endpoint returns envelope success', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql);
    const [itemId] = await listClienteItemIds(sql, auditId);

    const res = await PATCH({
      params: { token: BRIEFING_FIXTURE_TOKEN },
      request: new Request('http://localhost/api/briefing/x/responses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, value: 'Valor PATCH', na: false })
      }),
      getClientAddress: () => '127.0.0.1'
    } as never);

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { updatedAt: expect.any(String) } });
  });

  it('rejects tecnico item with 403', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql);
    const tecnicoItemId = await listTecnicoItemId(sql, auditId);
    expect(tecnicoItemId).toBeTruthy();

    await expect(
      saveBriefingResponse(BRIEFING_FIXTURE_TOKEN, tecnicoItemId!, { value: 'hack' })
    ).rejects.toThrow(BriefingItemNotAllowedError);

    const res = await PATCH({
      params: { token: BRIEFING_FIXTURE_TOKEN },
      request: new Request('http://localhost/api/briefing/x/responses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: tecnicoItemId, value: 'hack' })
      }),
      getClientAddress: () => '127.0.0.1'
    } as never);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('rejects unknown item_id not in audit template', async () => {
    await seedBriefingAuditFixture(sql);
    const fakeItemId = '00000000-0000-4000-8000-000000000099';

    await expect(
      saveBriefingResponse(BRIEFING_FIXTURE_TOKEN, fakeItemId, { value: 'x' })
    ).rejects.toThrow(BriefingItemNotAllowedError);
  });
});
