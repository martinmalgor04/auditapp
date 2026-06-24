import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('FormHeader component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/form/FormHeader.svelte'),
    'utf8'
  );

  it('renderiza badge con progress y pending', () => {
    expect(source).toContain('{progress}%');
    expect(source).toContain('{pending} pendientes');
  });

  it('barra de progreso tiene width={progress}%', () => {
    expect(source).toContain('width: {progress}%');
  });

  it('contenedor principal tiene clase lg:hidden', () => {
    expect(source).toContain('lg:hidden');
  });

  it('renderiza clientName', () => {
    expect(source).toContain('{clientName}');
  });

  it('renderiza sectionTitle', () => {
    expect(source).toContain('{sectionTitle}');
  });

  it('botón back llama a onBack', () => {
    expect(source).toContain('on:click={onBack}');
  });

  it('barra de progreso usa --sys-primary', () => {
    expect(source).toContain('bg-[--sys-primary]');
  });

  it('contenedor usa --sys-navy como background', () => {
    expect(source).toContain('var(--sys-navy)');
  });
});
