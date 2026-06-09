import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('deploy production env', () => {
  const envExample = readFileSync(resolve(root, '.env.example'), 'utf8');
  const deployDoc = readFileSync(resolve(root, 'docs/deploy-dokploy.md'), 'utf8');

  it('production docs describe POSTGRES_PASSWORD and internal hostname', () => {
    expect(deployDoc).toContain('POSTGRES_PASSWORD');
    expect(deployDoc).toContain('postgres:5432');
  });

  it('documents all required production vars', () => {
    const requiredInDoc = [
      'POSTGRES_PASSWORD',
      'SESSION_SECRET',
      'PUBLIC_APP_URL',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_ENDPOINT'
    ];
    const requiredInEnvExample = [
      'DATABASE_URL',
      'SESSION_SECRET',
      'PUBLIC_APP_URL',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_ENDPOINT'
    ];
    for (const key of requiredInDoc) {
      expect(deployDoc).toContain(key);
    }
    for (const key of requiredInEnvExample) {
      expect(envExample).toContain(`${key}=`);
    }
    expect(envExample).toContain(
      'PUBLIC_APP_URL=https://app.auditoriaserviciosysistemas.com.ar'
    );
    expect(deployDoc).toContain('4043');
  });
});
