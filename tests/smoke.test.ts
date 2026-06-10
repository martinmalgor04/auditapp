import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from '../src/lib/env';

describe('smoke', () => {
  it('adds numbers correctly', () => {
    expect(1 + 1).toBe(2);
  });

  it('parses server env schema shape', () => {
    const parsed = serverEnvSchema.parse({
      DATABASE_URL: 'postgres://auditapp:changeme@localhost:5432/auditapp',
      SESSION_SECRET: 'x'.repeat(32),
      PUBLIC_APP_URL: 'http://localhost:5173'
    });
    expect(parsed.DATABASE_URL).toContain('postgres://');
  });

  it('ignores placeholder R2_ENDPOINT from .env.example', () => {
    const parsed = serverEnvSchema.parse({
      DATABASE_URL: 'postgres://auditapp:changeme@localhost:5432/auditapp',
      SESSION_SECRET: 'x'.repeat(32),
      PUBLIC_APP_URL: 'http://localhost:5173',
      R2_ENDPOINT: 'https://<account_id>.r2.cloudflarestorage.com'
    });
    expect(parsed.R2_ENDPOINT).toBeUndefined();
  });
});
