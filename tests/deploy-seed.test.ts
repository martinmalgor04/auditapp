import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('deploy production seed', () => {
  it('seed commands are documented and match package.json scripts', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const doc = readFileSync(resolve(root, 'docs/deploy-dokploy.md'), 'utf8');

    expect(pkg.scripts['db:seed']).toBe('tsx scripts/db-seed.ts');
    expect(pkg.scripts['db:seed:templates']).toBe('tsx scripts/db-seed-templates.ts');
    expect(doc).toMatch(/seed autom[aá]tico|pnpm run db:seed/i);
    expect(doc).toContain('seed-templates-cli.mjs');
  });

  it('docker seed-cli uses conditional initial seed', () => {
    const seedCli = readFileSync(resolve(root, 'docker/seed-cli.mjs'), 'utf8');
    expect(seedCli).toContain('runInitialSeedIfNeeded');
    expect(seedCli).toContain('build/seed.js');
  });

  it('Dockerfile copies seed assets for runtime auto-seed', () => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('COPY seed ./seed');
    expect(dockerfile).toContain('seed-cli.mjs');
    expect(dockerfile).toContain('seed-templates-cli.mjs');
  });
});
