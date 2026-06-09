import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('pre-push gate script', () => {
  it('pre-push script exists and runs gate commands', () => {
    const scriptPath = resolve(root, 'scripts/pre-push.sh');
    const script = readFileSync(scriptPath, 'utf8');
    const mode = statSync(scriptPath).mode & 0o777;

    expect(mode & 0o111).toBeGreaterThan(0);
    expect(script).toContain('pnpm test');
    expect(script).toContain('pnpm run build');
    expect(script).toContain('docker build');
  });

  it('package.json exposes prepush alias', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prepush).toBe('./scripts/pre-push.sh');
  });
});
