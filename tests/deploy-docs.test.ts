import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('deploy dokploy documentation', () => {
  const doc = readFileSync(resolve(root, 'docs/deploy-dokploy.md'), 'utf8');

  it('documents traefik domain', () => {
    expect(doc).toContain('app.auditoriaserviciosysistemas.com.ar');
    expect(doc).toMatch(/UI de Dokploy|UI Dokploy/i);
    expect(doc).toContain('deploy/dokploy.compose.example.yml');
  });

  it('documents production seed procedure', () => {
    expect(doc).toMatch(/seed autom[aá]tico|autom[aá]ticamente/i);
    expect(doc).toContain('AUTO_SEED');
    expect(doc).toMatch(/contraseñas|password/i);
  });

  it('documents mandatory pre-push gate', () => {
    expect(doc).toContain('./scripts/pre-push.sh');
    expect(doc).toMatch(/obligatorio|No pushear/i);
    expect(doc).toContain('pnpm test');
    expect(doc).toContain('docker build');
  });
});
