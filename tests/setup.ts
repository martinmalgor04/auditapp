import { afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  ensureBaselineSeed,
  flushTestDbSerial,
  getTestSql,
  resetAndSeedForTests,
  resetVolatileTablesForTests
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
  /(?:seed|migrate|schema|db-stub|smoke|docker-compose|audit-status|field-type-schemas|briefing-validation|backoffice-status-badge|backoffice-progress|password|form-field-renderer|form-item-ux|form-section-nav|form-save-indicator|form-image-compress|form-table-camera|form-live-score|form-autosave|form-retry-queue|pwa-manifest|pwa-sw)\.test\.ts$/;

const FULL_DB_RESET = /(?:users-admin|templates-admin)\.test\.ts$/;

function currentTestFile(): string {
  return expect.getState().testPath ?? '';
}

async function prepareDbForTestFile(file: string, scope: 'file' | 'test'): Promise<void> {
  if (!file || SKIP_DB_RESET.test(file)) {
    return;
  }
  await flushTestDbSerial();
  const sql = getTestSql();
  setSqlForTests(sql);
  if (FULL_DB_RESET.test(file)) {
    if (scope === 'file') {
      await resetAndSeedForTests(sql);
    } else {
      await resetVolatileTablesForTests(sql);
    }
    return;
  }
  await ensureBaselineSeed(sql);
}

/** Antes del primer test del archivo: seed completo si aplica. */
beforeAll(async () => {
  await prepareDbForTestFile(currentTestFile(), 'file');
});

/** Antes de cada test: tablas volátiles limpias + bridge. */
beforeEach(async () => {
  await prepareDbForTestFile(currentTestFile(), 'test');
});

/** Tras cada test: re-vincula bridge si un test cerró la conexión. */
afterEach(async () => {
  if (process.env.DATABASE_URL) {
    setSqlForTests(getTestSql());
  }
});
