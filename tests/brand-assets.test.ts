import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STATIC = join(process.cwd(), 'static');

describe('brand assets', () => {
  it('official logo files exist in static/brand with minimum size', () => {
    const logos = ['sys-horizontal-w.png', 'sys-horizontal-b.png', 'isologo-og.png'];

    for (const name of logos) {
      const path = join(STATIC, 'brand', name);
      const stat = statSync(path);
      expect(stat.size).toBeGreaterThan(1024);
    }

    expect(() => statSync(join(STATIC, 'brand', 'sys-logo.svg'))).toThrow();
  });

  it('PWA icons and favicon exist and are non-placeholder', () => {
    const assets = ['favicon.png', 'icons/icon-192.png', 'icons/icon-512.png'];

    for (const rel of assets) {
      const stat = statSync(join(STATIC, rel));
      expect(stat.size).toBeGreaterThan(500);
    }
  });

  it('manifest references icon paths that exist', () => {
    const manifest = JSON.parse(readFileSync(join(STATIC, 'manifest.webmanifest'), 'utf8')) as {
      icons: Array<{ src: string }>;
    };

    for (const icon of manifest.icons) {
      const path = join(STATIC, icon.src.replace(/^\//, ''));
      expect(() => statSync(path)).not.toThrow();
    }
  });
});
