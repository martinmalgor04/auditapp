import { afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  acquireTestDbHold,
  flushTestDbSerial,
  getTestSql,
  releaseTestDbHold,
  resetAndSeedForTests,
  resetDatabaseToBaseline,
  resetVolatileTablesUnsafe,
  syncBaselineSeedFlagFromDb,
  withTestDbSerial
} from './helpers/db';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-secret-min-32-characters-long!!';
}

if (!process.env.PUBLIC_APP_URL) {
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';
}

const SKIP_DB_RESET =
  /(?:seed|migrate|schema|db-stub|smoke|docker-compose|docker|pwa-prod|audit-status|audit-access|field-type-schemas|briefing-validation|backoffice-status-badge|backoffice-progress|password|form-field-renderer|form-item-ux|form-section-nav|form-save-indicator|form-image-compress|form-table-camera|form-live-score|form-autosave|form-retry-queue|pwa-manifest|pwa-sw|brand-tokens|entrypoint|informe-schemas|informe-state-machine|informe-web-render|storage-r2|auth-cookie|crm-schema)\.test\.ts$/;

const FULL_DB_RESET = /(?:users-admin|templates-admin|audit-create-flow)\.test\.ts$/;

function testFilePath(ctx?: unknown): string {
  const c = ctx as { task?: { file?: { name?: string } } } | undefined;
  return c?.task?.file?.name ?? expect.getState().testPath ?? '';
}

function shouldSkipDbReset(file: string): boolean {
  return !file || SKIP_DB_RESET.test(file);
}

beforeAll(async (ctx) => {
  const file = testFilePath(ctx);
  if (shouldSkipDbReset(file)) {
    return;
  }

  await flushTestDbSerial();
  const sql = getTestSql();
  setSqlForTests(sql);
  await syncBaselineSeedFlagFromDb(sql);

  if (FULL_DB_RESET.test(file)) {
    await resetAndSeedForTests(sql);
    return;
  }

  await resetAndSeedForTests(sql, { skipIfBaseline: true });
});

beforeEach(async (ctx) => {
  const file = testFilePath(ctx);
  if (shouldSkipDbReset(file)) {
    return;
  }

  await flushTestDbSerial();
  const sql = getTestSql();
  await acquireTestDbHold(sql);
  await syncBaselineSeedFlagFromDb(sql);
  await resetVolatileTablesUnsafe(sql);
});

afterEach(async () => {
  await releaseTestDbHold();
  if (process.env.DATABASE_URL) {
    setSqlForTests(getTestSql());
  }
});
