import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('pwa manifest', () => {
  const manifestPath = join(process.cwd(), 'static/manifest.webmanifest');

  it('GET manifest returns valid JSON with required fields', () => {
    const raw = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as {
      name: string;
      short_name: string;
      display: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string }>;
    };

    expect(manifest.name).toBe('SyS Auditorías');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0A1929');
    expect(manifest.background_color).toBe('#0A1929');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    for (const icon of manifest.icons) {
      const iconPath = join(process.cwd(), 'static', icon.src.replace(/^\//, ''));
      expect(() => readFileSync(iconPath)).not.toThrow();
    }
  });
});
