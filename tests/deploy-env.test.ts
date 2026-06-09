import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('deploy production env', () => {
  const envExample = readFileSync(resolve(root, '.env.example'), 'utf8');
  const deployDoc = readFileSync(resolve(root, 'docs/deploy-dokploy.md'), 'utf8');

  it('production DATABASE_URL uses internal hostname', () => {
    expect(envExample).toContain('@postgres:5432/auditapp');
    expect(deployDoc).toContain('@postgres:5432/auditapp');
  });

  it('documents all required production vars', () => {
    const required = [
      'DATABASE_URL',
      'SESSION_SECRET',
      'PUBLIC_APP_URL',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_ENDPOINT',
      'PORT'
    ];
    for (const key of required) {
      expect(envExample).toContain(`${key}=`);
      expect(deployDoc).toContain(key);
    }
    expect(envExample).toContain(
      'PUBLIC_APP_URL=https://app.auditoriaserviciosysistemas.com.ar'
    );
  });
});
