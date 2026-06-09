import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('deploy dokploy compose example', () => {
  const compose = readFileSync(resolve(root, 'deploy/dokploy.compose.example.yml'), 'utf8');

  it('postgres service has no host port mapping', () => {
    const postgresBlock = compose.slice(
      compose.indexOf('postgres:'),
      compose.indexOf('app:')
    );
    expect(postgresBlock).not.toMatch(/^\s*ports:/m);
    expect(postgresBlock).toContain('db');
  });

  it('app joins dokploy network for reverse proxy (not internal-only)', () => {
    const appBlock = compose.slice(compose.indexOf('app:'));
    expect(appBlock).toContain('dokploy');
    expect(appBlock).toContain('dokploy-network');
    expect(appBlock).toContain('db');
  });

  it('documents production domain via PUBLIC_APP_URL env', () => {
    expect(compose).toContain('PUBLIC_APP_URL: https://app.auditoriaserviciosysistemas.com.ar');
    expect(compose).toContain("PORT: '3000'");
  });

  it('uses internal postgres hostname in DATABASE_URL', () => {
    expect(compose).toContain('@postgres:5432/auditapp');
  });

  it('builds app from repository root Dockerfile', () => {
    expect(compose).toContain('context: ..');
    expect(compose).toContain('dockerfile: Dockerfile');
  });
});
