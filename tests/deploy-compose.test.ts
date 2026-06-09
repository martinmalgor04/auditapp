import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function readCompose(name: string) {
  return readFileSync(resolve(root, 'deploy', name), 'utf8');
}

describe('deploy dokploy split composes (recommended)', () => {
  const dbCompose = readCompose('dokploy-db.compose.yml');
  const appCompose = readCompose('dokploy-app.compose.yml');

  it('postgres joins dokploy-network with unique hostname auditapp-postgres', () => {
    expect(dbCompose).toContain('dokploy-network');
    expect(dbCompose).toContain('- auditapp-postgres');
    expect(dbCompose).not.toMatch(/aliases:\s*\n\s*- postgres\b/);
    expect(dbCompose).toContain("4043:5432");
    expect(dbCompose).toContain('POSTGRES_PUBLISH_BIND:-127.0.0.1');
    expect(dbCompose).toContain('docker/postgres/Dockerfile');
  });

  it('app joins dokploy-network and passes POSTGRES_HOST + POSTGRES_PASSWORD', () => {
    expect(appCompose).toContain('dokploy-network');
    expect(appCompose).toContain('POSTGRES_HOST: auditapp-postgres');
    expect(appCompose).toContain('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}');
    expect(appCompose).not.toContain('DATABASE_URL:');
    expect(appCompose).toContain('dockerfile: Dockerfile');
    expect(appCompose).toContain("PORT: '3033'");
    expect(appCompose).toContain(
      'PUBLIC_APP_URL: ${PUBLIC_APP_URL:-https://app.auditoriaserviciosysistemas.com.ar'
    );
  });

  it('builds from repository root via parent context', () => {
    expect(dbCompose).toContain('context: ..');
    expect(appCompose).toContain('context: ..');
  });
});

describe('deploy dokploy combined compose example', () => {
  const compose = readCompose('dokploy.compose.example.yml');

  it('postgres publishes admin port 4043 on localhost by default', () => {
    const postgresBlock = compose.slice(
      compose.indexOf('postgres:'),
      compose.indexOf('app:')
    );
    expect(postgresBlock).toContain('4043:5432');
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
