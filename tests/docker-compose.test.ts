import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('docker-compose dev postgres', () => {
  it('has Dockerfile and docker-compose.yml', () => {
    expect(() => readFileSync(resolve(root, 'docker/postgres/Dockerfile'), 'utf8')).not.toThrow();
    expect(() => readFileSync(resolve(root, 'docker-compose.yml'), 'utf8')).not.toThrow();
  });

  it('aligns credentials with .env.example DATABASE_URL', () => {
    const dockerfile = readFileSync(resolve(root, 'docker/postgres/Dockerfile'), 'utf8');
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    const envExample = readFileSync(resolve(root, '.env.example'), 'utf8');

    expect(dockerfile).toContain('POSTGRES_USER=auditapp');
    expect(dockerfile).toContain('POSTGRES_PASSWORD=changeme');
    expect(dockerfile).toContain('POSTGRES_DB=auditapp');
    expect(compose).toContain('pg_isready -U auditapp -d auditapp');
    expect(compose).toContain('auditapp_pgdata');
    expect(envExample).toContain(
      'DATABASE_URL=postgres://auditapp:changeme@localhost:5432/auditapp'
    );
  });
});
