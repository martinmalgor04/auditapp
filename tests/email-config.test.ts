import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_SMTP_FROM,
  resolveSmtpFrom,
  serverEnvSchema,
  type ServerEnv
} from '../src/lib/server/env';

const ORIGINAL_ENV = { ...process.env };

const baseEnv = {
  DATABASE_URL: 'postgres://auditapp:changeme@localhost:5432/auditapp',
  SESSION_SECRET: 'x'.repeat(32),
  PUBLIC_APP_URL: 'http://localhost:5173'
};

describe('email config (#49 R1)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('parsea sin vars SMTP (no lanza)', () => {
    const parsed = serverEnvSchema.parse(baseEnv);
    expect(parsed.SMTP_HOST).toBeUndefined();
    expect(parsed.SMTP_PORT).toBeUndefined();
    expect(parsed.SMTP_SECURE).toBeUndefined();
  });

  it('parsea con vars SMTP válidas', () => {
    const parsed = serverEnvSchema.parse({
      ...baseEnv,
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'user@example.com',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'from@example.com',
      SMTP_SECURE: 'false'
    });
    expect(parsed.SMTP_HOST).toBe('smtp.example.com');
    expect(parsed.SMTP_PORT).toBe(587);
    expect(parsed.SMTP_USER).toBe('user@example.com');
    expect(parsed.SMTP_PASS).toBe('secret');
    expect(parsed.SMTP_FROM).toBe('from@example.com');
    expect(parsed.SMTP_SECURE).toBe(false);
  });

  it('SMTP_FROM ausente → remitente default corporativo', () => {
    const parsed = serverEnvSchema.parse(baseEnv) as ServerEnv;
    expect(resolveSmtpFrom(parsed)).toBe(DEFAULT_SMTP_FROM);
    expect(DEFAULT_SMTP_FROM).toBe('auditorias@serviciosysistemas.com.ar');
  });

  it('SMTP_FROM presente → usa ese valor', () => {
    const parsed = serverEnvSchema.parse({
      ...baseEnv,
      SMTP_FROM: 'custom@example.com'
    }) as ServerEnv;
    expect(resolveSmtpFrom(parsed)).toBe('custom@example.com');
  });

  it('.env.example lista las seis vars SMTP sin secretos reales', () => {
    const example = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
    expect(example).toContain('# ── Email (SMTP, #49) ──');
    expect(example).toContain('SMTP_HOST=');
    expect(example).toContain('SMTP_PORT=');
    expect(example).toContain('SMTP_USER=');
    expect(example).toContain('SMTP_PASS=');
    expect(example).toContain('SMTP_FROM=');
    expect(example).toContain('SMTP_SECURE=');
    expect(example).not.toMatch(/SMTP_PASS=(?!.*<)/);
  });
});
