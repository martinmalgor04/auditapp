import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('brand typography', () => {
  it('root layout loads Montserrat and sets sys font on body', () => {
    const layout = readFileSync(join(process.cwd(), 'src/routes/+layout.svelte'), 'utf8');
    const appCss = readFileSync(join(process.cwd(), 'src/app.css'), 'utf8');

    expect(layout).toContain('fonts.googleapis.com/css2?family=Montserrat');
    expect(layout).toContain('wght@300;400;600;700;800');
    expect(layout).toContain('font-sys');
    expect(appCss).toContain('font-family: var(--sys-font)');
  });
});
