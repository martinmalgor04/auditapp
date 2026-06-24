import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('StatCard', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/mercado/StatCard.svelte'),
    'utf8'
  );

  it('usa var(--sys-primary) para IT', () => {
    expect(source).toContain("IT: 'var(--sys-primary)'");
  });

  it('usa var(--sys-primary) para ERP', () => {
    expect(source).toContain("ERP: 'var(--sys-primary)'");
  });

  it('usa var(--sys-status-green) para Cerradas', () => {
    expect(source).toContain("Cerradas: 'var(--sys-status-green)'");
  });

  it('usa var(--sys-status-amber) para Upsell', () => {
    expect(source).toContain("Upsell: 'var(--sys-status-amber)'");
  });

  it('renderiza value (incluso 0)', () => {
    expect(source).toContain('{value}');
  });

  it('renderiza n=', () => {
    expect(source).toContain('n={n}');
  });

  it('renderiza label', () => {
    expect(source).toContain('{label}');
  });

  it('aplica border-top con color dinámico', () => {
    expect(source).toContain('border-top: 3px solid {color}');
  });
});

describe('ErpDistribution', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/mercado/ErpDistribution.svelte'),
    'utf8'
  );

  it('renderiza una barra por cada dato', () => {
    expect(source).toContain('{#each data as bar}');
    expect(source).toContain('{bar.erp}');
    expect(source).toContain('{bar.pct}%');
    expect(source).toContain('{bar.color}');
  });

  it('muestra empty state cuando data está vacío', () => {
    expect(source).toContain('{#if data.length === 0}');
    expect(source).toContain('Sin auditorías cerradas');
  });

  it('tiene la estructura de barra con width y background dinámicos', () => {
    expect(source).toContain('width: {bar.pct}%');
    expect(source).toContain('background: {bar.color}');
  });

  it('tiene el título Distribución ERP', () => {
    expect(source).toContain('Distribución ERP');
  });
});
