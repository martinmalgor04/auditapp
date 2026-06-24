import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = join(process.cwd(), 'src/lib/components/ui/ProgressBar.svelte');

describe('ProgressBar component', () => {
  it('el archivo del componente existe', () => {
    expect(existsSync(componentPath)).toBe(true);
  });

  it('importa navigating de $app/stores', () => {
    const source = readFileSync(componentPath, 'utf8');
    expect(source).toContain("from '$app/stores'");
    expect(source).toContain('navigating');
  });

  it('muestra el div cuando navigating es truthy', () => {
    const source = readFileSync(componentPath, 'utf8');
    expect(source).toContain('{#if $navigating}');
    expect(source).toContain('fixed top-0 left-0 right-0 z-50 h-[6px]');
  });

  it('aplica clase bg-[--sys-primary] al div', () => {
    const source = readFileSync(componentPath, 'utf8');
    expect(source).toContain('bg-[--sys-primary]');
  });

  it('aplica animate-pulse al div', () => {
    const source = readFileSync(componentPath, 'utf8');
    expect(source).toContain('animate-pulse');
  });
});
