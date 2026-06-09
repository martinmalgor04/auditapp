import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_COLORS } from '../src/lib/brand/tokens';

describe('brand PWA meta', () => {
  it('app.html theme-color meta matches manifest theme_color', () => {
    const appHtml = readFileSync(join(process.cwd(), 'src/app.html'), 'utf8');
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'static/manifest.webmanifest'), 'utf8')
    ) as { theme_color: string };

    expect(appHtml).toContain(`content="${OFFICIAL_COLORS.azulProfundo}"`);
    expect(manifest.theme_color).toBe(OFFICIAL_COLORS.azulProfundo);
  });
});
