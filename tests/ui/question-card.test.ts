import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('QuestionCard component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/form/QuestionCard.svelte'),
    'utf8'
  );

  it('Sí activo produce clases verdes', () => {
    expect(source).toContain("bg-[--sys-status-green] text-white border-[--sys-status-green]");
  });

  it('No activo produce clases rojas', () => {
    expect(source).toContain("bg-[--sys-status-red] text-white border-[--sys-status-red]");
  });

  it('Parcial activo produce outline azul primario', () => {
    expect(source).toContain("border-[--sys-primary] text-[--sys-primary] bg-white");
  });

  it('link de observación está presente', () => {
    expect(source).toContain('+ Agregar observación');
    expect(source).toContain('onAddObservation');
  });
});
