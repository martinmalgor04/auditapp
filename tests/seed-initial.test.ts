import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  needsInitialSeed,
  runInitialSeedIfNeeded
} from '../src/lib/server/db/seed';
import { setupTestDb, teardownTestDb, withTestDbSerial } from './helpers/db';
import type postgres from 'postgres';

describe('initial seed automation', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('needsInitialSeed is false when baseline users exist', async () => {
    await withTestDbSerial(sql, async (s) => {
      expect(await needsInitialSeed(s)).toBe(false);
    });
  });

  it('runInitialSeedIfNeeded skips when database already initialized', async () => {
    await withTestDbSerial(sql, async (s) => {
      const result = await runInitialSeedIfNeeded(s);
      expect(result).toEqual({ seeded: false, reason: 'already_initialized' });
    });
  });

  it('runInitialSeedIfNeeded respects AUTO_SEED=false', async () => {
    const previous = process.env.AUTO_SEED;
    process.env.AUTO_SEED = 'false';
    try {
      await withTestDbSerial(sql, async (s) => {
        const result = await runInitialSeedIfNeeded(s);
        expect(result).toEqual({ seeded: false, reason: 'disabled' });
      });
    } finally {
      if (previous === undefined) {
        delete process.env.AUTO_SEED;
      } else {
        process.env.AUTO_SEED = previous;
      }
    }
  });
});
