import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/lib/server/db/migrate';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

const root = resolve(import.meta.dirname, '..');

describe('docker entrypoint', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('runs migrations before conditional seed, templates sync, and node server', () => {
    const entrypoint = readFileSync(resolve(root, 'docker/entrypoint.sh'), 'utf8');
    const migrateIndex = entrypoint.indexOf('migrate-cli.mjs');
    const seedIndex = entrypoint.indexOf('seed-cli.mjs');
    const templatesSeedIndex = entrypoint.indexOf('seed-templates-cli.mjs');
    const nodeIndex = entrypoint.indexOf('build/index.js');
    expect(migrateIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeGreaterThan(migrateIndex);
    expect(templatesSeedIndex).toBeGreaterThan(seedIndex);
    expect(nodeIndex).toBeGreaterThan(templatesSeedIndex);
    expect(entrypoint).toContain('exec node build/index.js');
  });

  it('seed-cli invokes runInitialSeedIfNeeded not unconditional runSeed', () => {
    const entrypoint = readFileSync(resolve(root, 'docker/entrypoint.sh'), 'utf8');
    const seedCli = readFileSync(resolve(root, 'docker/seed-cli.mjs'), 'utf8');
    expect(entrypoint).toContain('seed-cli.mjs');
    expect(seedCli).toContain('runInitialSeedIfNeeded');
    expect(seedCli).toContain('already initialized');
    expect(seedCli.toLowerCase()).not.toContain('runseed(');
  });

  it('second container start skips applied migrations', async () => {
    const first = await runMigrations(sql);
    expect(first.skipped.length).toBeGreaterThan(0);

    const second = await runMigrations(sql);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(first.skipped);
  });

  it('exits non-zero when database credentials are missing', () => {
    const result = spawnSync('node', [resolve(root, 'docker/migrate-cli.mjs')], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: '', POSTGRES_PASSWORD: '' },
      encoding: 'utf8'
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DATABASE_URL is not set');
  });

  it('entrypoint exports DATABASE_URL from POSTGRES_PASSWORD', () => {
    const entrypoint = readFileSync(resolve(root, 'docker/entrypoint.sh'), 'utf8');
    expect(entrypoint).toContain('export DATABASE_URL="$(node docker/database-url.mjs)"');
  });
});
