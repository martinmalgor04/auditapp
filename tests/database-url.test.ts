import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('docker database-url', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('builds URL from POSTGRES_PASSWORD with internal hostname', async () => {
    process.env.POSTGRES_PASSWORD = 'SySauditapp2026Prod';
    delete process.env.DATABASE_URL;

    const { resolveDatabaseUrl } = await import('../docker/database-url.mjs');
    expect(resolveDatabaseUrl()).toBe(
      'postgres://auditapp:SySauditapp2026Prod@auditapp-postgres:5432/auditapp'
    );
  });

  it('URL-encodes special characters in password', async () => {
    process.env.POSTGRES_PASSWORD = 'p@ss:word';
    delete process.env.DATABASE_URL;

    const { resolveDatabaseUrl } = await import('../docker/database-url.mjs');
    expect(resolveDatabaseUrl()).toBe('postgres://auditapp:p%40ss%3Aword@auditapp-postgres:5432/auditapp');
  });

  it('prefers POSTGRES_PASSWORD over DATABASE_URL', async () => {
    process.env.POSTGRES_PASSWORD = 'from-password';
    process.env.DATABASE_URL = 'postgres://auditapp:wrong@postgres:5432/auditapp';

    const { resolveDatabaseUrl } = await import('../docker/database-url.mjs');
    expect(resolveDatabaseUrl()).toBe('postgres://auditapp:from-password@auditapp-postgres:5432/auditapp');
  });
});
