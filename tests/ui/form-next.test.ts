import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('FormNextButton component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/form/FormNextButton.svelte'),
    'utf8'
  );

  it('con pendingCount > 0, el botón existe (bloque #if pendingCount > 0)', () => {
    expect(source).toContain('{#if pendingCount > 0}');
    expect(source).toContain('<button');
  });

  it('con pendingCount = 0, no se muestra (bloque {/if} cierra la condición)', () => {
    expect(source).toContain('{/if}');
    // El botón está dentro del bloque condicional, no fuera de él
    const ifStart = source.indexOf('{#if pendingCount > 0}');
    const ifEnd = source.indexOf('{/if}');
    const buttonPos = source.indexOf('<button');
    expect(buttonPos).toBeGreaterThan(ifStart);
    expect(buttonPos).toBeLessThan(ifEnd);
  });

  it('muestra el texto con restantes', () => {
    expect(source).toContain('restantes');
    expect(source).toContain('Próximo pendiente');
  });

  it('usa --sys-navy como fondo', () => {
    expect(source).toContain('var(--sys-navy)');
  });

  it('está fijo en bottom-20 y oculto en lg+', () => {
    expect(source).toContain('bottom-20');
    expect(source).toContain('lg:hidden');
  });
});
