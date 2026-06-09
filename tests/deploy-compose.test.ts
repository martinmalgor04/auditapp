import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('deploy dokploy compose example', () => {
  const compose = readFileSync(resolve(root, 'deploy/dokploy.compose.example.yml'), 'utf8');

  it('postgres publishes admin port 4043 on localhost by default', () => {
    const postgresBlock = compose.slice(
      compose.indexOf('postgres:'),
      compose.indexOf('app:')
    );
    expect(postgresBlock).toContain("4043:5432");
    expect(postgresBlock).toContain('POSTGRES_PUBLISH_BIND:-127.0.0.1');
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
    expect(compose).toContain("PORT: '3033'");
  });

  it('passes POSTGRES_PASSWORD to app (URL built in entrypoint)', () => {
    const appBlock = compose.slice(compose.indexOf('app:'));
    expect(appBlock).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}');
    expect(appBlock).not.toContain('DATABASE_URL:');
  });

  it('builds app from repository root Dockerfile', () => {
    expect(compose).toContain('context: ..');
    expect(compose).toContain('dockerfile: Dockerfile');
  });
});
