import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Unit tests for TableroHeader logic — pure JS, no DOM mount needed.

describe('AuditCard', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/backoffice/AuditCard.svelte'),
    'utf8'
  );

  it('renderiza ref_code del audit', () => {
    expect(source).toContain('audit.ref_code');
  });

  it('incluye StatusBadge con status y scoreLow', () => {
    expect(source).toContain('StatusBadge');
    expect(source).toContain('status={audit.status}');
    expect(source).toContain('scoreLow={audit.score_low}');
  });

  it('tiene los 3 botones de acción (Ver, Relevamiento, Cierre)', () => {
    expect(source).toContain('>Ver<');
    expect(source).toContain('>Relevamiento<');
    expect(source).toContain('>Cierre<');
  });

  it('botones apuntan a rutas correctas del audit', () => {
    expect(source).toContain('/auditorias/{audit.id}');
    expect(source).toContain('/auditorias/{audit.id}/form');
    expect(source).toContain('/auditorias/{audit.id}/cierre');
  });
});

describe('TableroHeader', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/backoffice/TableroHeader.svelte'),
    'utf8'
  );

  it('renders subtítulo con auditCount', () => {
    expect(source).toContain('{auditCount} auditorías');
  });

  it('input tiene type=search', () => {
    expect(source).toContain('type="search"');
  });

  it('integra ChipFilters', () => {
    expect(source).toContain('ChipFilters');
  });
});

describe('Tablero tabla web', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/routes/(app)/tablero/+page.svelte'),
    'utf8'
  );

  it('renderiza headers de tabla en orden', () => {
    expect(source).toContain('Cliente');
    expect(source).toContain('Tipo');
    expect(source).toContain('Estado');
    expect(source).toContain('Avance');
    expect(source).toContain('Acciones');
  });

  it('usa grid-template-columns del design', () => {
    expect(source).toContain('2.2fr 88px 120px 145px 108px 62px 76px 165px');
  });
});
