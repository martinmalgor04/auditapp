import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { searchClientsForPicker } from '../../src/lib/server/backoffice/audits';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import type postgres from 'postgres';

describe('client search', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('finds PLASTIPRESS SRL by name beyond old picker limit', async () => {
    const results = await searchClientsForPicker('plastipress');
    expect(results.some((r) => r.razonSocial.toUpperCase().includes('PLASTIPRESS'))).toBe(true);
  });

  it('finds client by CUIT fragment', async () => {
    const results = await searchClientsForPicker('30518766925');
    expect(results.some((r) => r.cuit === '30518766925')).toBe(true);
  });

  it('returns empty for short queries', async () => {
    expect(await searchClientsForPicker('p')).toEqual([]);
  });
});
