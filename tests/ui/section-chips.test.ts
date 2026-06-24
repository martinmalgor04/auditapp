import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('SectionChips component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/form/SectionChips.svelte'),
    'utf8'
  );

  it('sección completa (done === total > 0) muestra ✓', () => {
    expect(source).toContain('✓');
    expect(source).toContain('s.done === s.total && s.total > 0');
  });

  it('sección incompleta no muestra ✓ incondicionalmente', () => {
    // el ✓ debe estar dentro de un bloque condicional, no a nivel raíz
    const checkmarkIndex = source.indexOf('✓');
    const ifIndex = source.indexOf('s.done === s.total && s.total > 0');
    expect(ifIndex).toBeGreaterThan(-1);
    expect(checkmarkIndex).toBeGreaterThan(ifIndex);
  });

  it('chip activo usa bg-[--sys-primary] text-white', () => {
    expect(source).toContain('bg-[--sys-primary] text-white');
  });

  it('chip inactivo usa bg-[--sys-bg-app] con borde', () => {
    expect(source).toContain('bg-[--sys-bg-app] border border-[--sys-border] text-[--sys-text-secondary]');
  });

  it('click dispara onSelect con el code del chip', () => {
    expect(source).toContain('onSelect(s.code)');
  });

  it('renderiza el code de cada sección', () => {
    expect(source).toContain('{s.code}');
  });
});
