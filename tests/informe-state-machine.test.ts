import { describe, expect, it } from 'vitest';
import { assertInformeTransition, type InformeStatus } from '../src/lib/server/informe/state';
import { InformeInvalidTransitionError } from '../src/lib/server/informe/errors';

describe('informe state machine (R7, R24)', () => {
  const valid: Array<[InformeStatus, InformeStatus]> = [
    ['pendiente', 'generando'],
    ['generando', 'borrador'],
    ['generando', 'error'],
    ['error', 'generando'],
    ['borrador', 'aprobado']
  ];

  it.each(valid)('permite %s → %s', (from, to) => {
    expect(() => assertInformeTransition(from, to)).not.toThrow();
  });

  const invalid: Array<[InformeStatus, InformeStatus]> = [
    ['aprobado', 'borrador'],
    ['pendiente', 'aprobado'],
    ['generando', 'aprobado'], // R24: no existe auto-aprobación
    ['borrador', 'generando'],
    ['aprobado', 'generando'],
    ['error', 'borrador'],
    ['pendiente', 'borrador']
  ];

  it.each(invalid)('rechaza %s → %s con InformeInvalidTransitionError', (from, to) => {
    expect(() => assertInformeTransition(from, to)).toThrow(InformeInvalidTransitionError);
  });
});
