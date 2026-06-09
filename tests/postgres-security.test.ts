import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('postgres security image', () => {
  const entrypoint = readFileSync(
    resolve(root, 'docker/postgres/docker-entrypoint.sh'),
    'utf8'
  );
  const compose = readFileSync(resolve(root, 'deploy/dokploy.compose.example.yml'), 'utf8');

  it('uses scram-sha-256 and rejects other users', () => {
    expect(entrypoint).toContain('scram-sha-256');
    expect(entrypoint).toContain('host    all       all       0.0.0.0/0         reject');
    expect(entrypoint).toContain('auditapp    auditapp');
  });

  it('sets pg_hba ownership for postgres user', () => {
    expect(entrypoint).toContain('chown postgres:postgres');
    expect(entrypoint).toContain('chmod 640');
  });

  it('publishes postgres on host port 4043 with localhost bind by default', () => {
    expect(compose).toContain("'${POSTGRES_PUBLISH_BIND:-127.0.0.1}:4043:5432'");
  });

  it('builds hardened postgres from docker/postgres/Dockerfile', () => {
    const postgresBlock = compose.slice(
      compose.indexOf('postgres:'),
      compose.indexOf('app:')
    );
    expect(postgresBlock).toContain('docker/postgres/Dockerfile');
  });
});
