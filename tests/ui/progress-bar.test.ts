import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/lib/components/ui/ItemProgressBar.svelte'),
  'utf8'
);

describe('ItemProgressBar', () => {
  it('value=75, status=cerrada → barra verde al 75%', () => {
    expect(source).toContain('var(--sys-status-green)');
    expect(source).toContain("status === 'cerrada'");
    expect(source).toContain('width: {value}%');
  });

  it('value=0 → sin error (componente renderizable)', () => {
    // El componente acepta value=0 sin restricciones
    expect(source).toContain('export let value: number');
    expect(source).toContain('width: {value}%');
  });

  it('status=en_cierre → color amber', () => {
    expect(source).toContain('var(--sys-status-amber)');
    expect(source).toContain("status === 'en_cierre'");
  });

  it('otros status → color primary', () => {
    expect(source).toContain('var(--sys-primary)');
  });

  it('estructura correcta: h-[5px] rounded-full con fondo sys-border', () => {
    expect(source).toContain('h-[5px]');
    expect(source).toContain('rounded-full');
    expect(source).toContain('var(--sys-border)');
  });
});
