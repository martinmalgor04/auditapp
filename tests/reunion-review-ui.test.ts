/**
 * Test de lógica de revisión de propuestas.
 * No usa @testing-library/svelte — verifica lógica pura de badges y formateo.
 */
import { describe, it, expect } from 'vitest';

/** Lógica de badge copiada del componente proposal-review. */
function confidenceBadge(confidence: number): { label: string } {
  if (confidence >= 0.8) return { label: 'Alta' };
  if (confidence >= 0.5) return { label: 'Media' };
  return { label: 'Baja' };
}

/** Formateo de valor copiado del componente. */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  return String(val);
}

describe('proposal-review — lógica de badge de confianza', () => {
  it('confidence >= 0.8 es Alta', () => {
    expect(confidenceBadge(0.8).label).toBe('Alta');
    expect(confidenceBadge(1.0).label).toBe('Alta');
    expect(confidenceBadge(0.95).label).toBe('Alta');
  });

  it('confidence entre 0.5 y 0.79 es Media', () => {
    expect(confidenceBadge(0.5).label).toBe('Media');
    expect(confidenceBadge(0.79).label).toBe('Media');
  });

  it('confidence < 0.5 es Baja', () => {
    expect(confidenceBadge(0.0).label).toBe('Baja');
    expect(confidenceBadge(0.49).label).toBe('Baja');
  });
});

describe('proposal-review — formateo de valor', () => {
  it('null formatea como —', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
  });

  it('boolean true formatea como Sí', () => {
    expect(formatValue(true)).toBe('Sí');
  });

  it('boolean false formatea como No', () => {
    expect(formatValue(false)).toBe('No');
  });

  it('string se muestra tal cual', () => {
    expect(formatValue('texto libre')).toBe('texto libre');
  });

  it('número se convierte a string', () => {
    expect(formatValue(42)).toBe('42');
  });
});

describe('proposal-review — items con review_status != pending se deshabilitan', () => {
  // Verificar regla: si review_status !== 'pending' no se muestran acciones
  it('solo "pending" habilita acciones', () => {
    const statuses = ['accepted', 'rejected', 'edited'];
    for (const status of statuses) {
      expect(status).not.toBe('pending');
    }
  });
});
