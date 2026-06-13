import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { POST as batchPost } from '../../src/routes/api/crm/leads/batch/+server';

const TOKEN = 'test-crm-token-batch';

function request(body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== undefined) {
    headers.Authorization = `Bearer ${token}`;
  }
  return batchPost({
    request: new Request('http://localhost/api/crm/leads/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  } as never);
}

describe('crm leads batch API', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    process.env.CRM_API_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.CRM_API_TOKEN;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function countLeads(): Promise<number> {
    const [row] = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM crm_lead`;
    return Number(row.count);
  }

  it('401 sin header, token incorrecto y env sin token (R4)', async () => {
    const before = await countLeads();
    const body = [{ email: 'a@b.com', empresa: 'A', source: 'manual' }];

    const noHeader = await request(body);
    expect(noHeader.status).toBe(401);
    expect((await noHeader.json()).success).toBe(false);

    const badToken = await request(body, 'wrong');
    expect(badToken.status).toBe(401);

    delete process.env.CRM_API_TOKEN;
    const noEnv = await request(body, TOKEN);
    expect(noEnv.status).toBe(401);

    expect(await countLeads()).toBe(before);
  });

  it('400 por Zod — lote atómico y máx 200 (R5)', async () => {
    const before = await countLeads();
    const invalid = await request(
      [
        { email: 'good@b.com', empresa: 'Good', source: 'manual' },
        { empresa: 'Sin email', source: 'manual' }
      ],
      TOKEN
    );
    expect(invalid.status).toBe(400);
    expect(await countLeads()).toBe(before);

    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      email: `bulk${i}@b.com`,
      empresa: `E${i}`,
      source: 'firecrawl' as const
    }));
    const over = await request(tooMany, TOKEN);
    expect(over.status).toBe(400);
    expect(await countLeads()).toBe(before);
  });

  it('inserta lote válido y dedupe sin pisar status (R5, R6)', async () => {
    const first = await request(
      [{ email: 'dup@b.com', empresa: 'Empresa', source: 'firecrawl' }],
      TOKEN
    );
    expect(first.status).toBe(200);
    expect((await first.json()).data).toEqual({ inserted: 1, updated: 0 });

    await sql`UPDATE crm_lead SET status = 'contactado' WHERE email = 'dup@b.com'`;

    const second = await request(
      [{ email: 'DUP@b.com', empresa: 'Empresa', source: 'otro', telefono: '123' }],
      TOKEN
    );
    const body = await second.json();
    expect(second.status).toBe(200);
    expect(body.data).toEqual({ inserted: 0, updated: 1 });

    const [row] = await sql<{ status: string; telefono: string | null; source: string }[]>`
      SELECT status, telefono, source FROM crm_lead WHERE email = 'dup@b.com'
    `;
    expect(row.status).toBe('contactado');
    expect(row.telefono).toBe('123');
    expect(row.source).toBe('firecrawl');
  });
});
