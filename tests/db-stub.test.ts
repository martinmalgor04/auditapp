import { afterEach, describe, expect, it } from 'vitest';
import { createSql, getSql, pingDb, resetSqlForTests } from '../src/lib/server/db';

describe('db stub', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    resetSqlForTests();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('exports createSql factory', () => {
    const sql = createSql('postgres://user:pass@localhost:5432/testdb');
    expect(sql).toBeDefined();
    expect(typeof sql).toBe('function');
    void sql.end({ timeout: 0 });
  });

  it('getSql throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getSql()).toThrow('DATABASE_URL is not set');
  });

  it('getSql returns lazy singleton without connecting', () => {
    process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
    const first = getSql();
    const second = getSql();
    expect(first).toBe(second);
  });

  it('pingDb returns false without DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    await expect(pingDb()).resolves.toBe(false);
  });

  it('pingDb returns true when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
    await expect(pingDb()).resolves.toBe(true);
  });
});
