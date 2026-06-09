import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_COLORS, LEGACY_BANNED } from '../src/lib/brand/tokens';

const ROOT = join(process.cwd(), 'src');
const BRAND_CSS = join(process.cwd(), 'src/lib/styles/brand.css');
const TAILWIND_CONFIG = join(process.cwd(), 'tailwind.config.js');

function readAllSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      readAllSourceFiles(full, acc);
    } else if (/\.(svelte|ts|css|js)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('brand tokens', () => {
  it('brand.css declares official SyS CSS variables with exact hex values', () => {
    const css = readFileSync(BRAND_CSS, 'utf8');
    expect(css).toContain('--sys-azul-profundo: #0a1929');
    expect(css).toContain('--sys-azul-medio: #102a43');
    expect(css).toContain('--sys-blanco: #ffffff');
    expect(css).toContain('--sys-offwhite: #f7f9fb');
    expect(css).toContain('--sys-celeste: #a2c6d4');
    expect(css).toContain('--sys-azul-electrico: #2196f3');
    expect(css).toContain('--sys-verde: #27ae60');
    expect(css).toContain('--sys-rojo: #e63946');
    expect(css).toContain('--sys-naranja: #f39c12');
    expect(css).toContain('--sys-gris-neutro: #908a82');
    expect(css).toContain('--sys-font:');
    expect(css).toContain('--sys-bg-gradient:');
    expect(css).toContain('--sys-top-bar: 6px');
    expect(css).toContain('--sys-touch-min: 44px');
    expect(OFFICIAL_COLORS.azulProfundo.toLowerCase()).toBe('#0a1929');
  });

  it('src contains no legacy brand hex or CSS var names', () => {
    const files = readAllSourceFiles(ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith('lib/brand/tokens.ts')) continue;
      const content = readFileSync(file, 'utf8').toLowerCase();
      for (const banned of LEGACY_BANNED) {
        if (content.includes(banned.toLowerCase())) {
          offenders.push(`${file}: ${banned}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('tailwind theme extends sys colors referencing CSS variables', () => {
    const config = readFileSync(TAILWIND_CONFIG, 'utf8');
    expect(config).toContain('profundo:');
    expect(config).toContain('electrico:');
    expect(config).toContain('celeste:');
    expect(config).toContain('offwhite:');
    expect(config).toContain('fontFamily');
    expect(config).toContain('sys:');
    expect(config).toContain('var(--sys-azul-profundo)');
    expect(config).toContain('var(--sys-azul-electrico)');
  });

  it('brand.css imported only from root layout', () => {
    const files = readAllSourceFiles(join(ROOT, 'routes'));
    const importers = files.filter((f) => readFileSync(f, 'utf8').includes("styles/brand.css"));

    expect(importers).toEqual([join(ROOT, 'routes/+layout.svelte')]);
  });

  it('form layout and section-nav reference unified sys tokens', () => {
    const formLayout = readFileSync(
      join(ROOT, 'routes/(app)/auditorias/[id]/form/+layout.svelte'),
      'utf8'
    );
    const sectionNav = readFileSync(join(ROOT, 'lib/components/form/section-nav.svelte'), 'utf8');

    expect(formLayout).toContain('bg-sys-offwhite');
    expect(sectionNav).toContain('bg-sys-electrico');
    expect(sectionNav).not.toContain('--sys-primary');
  });

  it('briefing components use official tokens only', () => {
    const header = readFileSync(join(ROOT, 'lib/components/briefing/briefing-header.svelte'), 'utf8');
    const wizard = readFileSync(join(ROOT, 'lib/components/briefing/briefing-wizard.svelte'), 'utf8');

    expect(header).toContain('/brand/sys-horizontal-b.png');
    expect(header).toContain('--sys-text-on-light');
    expect(wizard).toContain('bg-sys-electrico');
    expect(wizard).not.toContain('--sys-primary');
  });
});
