import { describe, expect, it } from 'vitest';
import {
  applyCabDefaultsToItems,
  cabResponsesToClientPatch,
  clientToCabValues,
  mergeCabResponses,
  newClientToCabFields
} from '../src/lib/backoffice/cab-client-map';

const cabItems = [
  { id: 'a', label: 'Razón social', fieldType: 'text' },
  { id: 'b', label: 'CUIT', fieldType: 'text' },
  { id: 'c', label: 'Rubro / actividad', fieldType: 'text' },
  { id: 'd', label: 'Cantidad de empleados', fieldType: 'number' },
  { id: 'e', label: 'Fecha programada de visita', fieldType: 'date' }
];

describe('cab-client-map', () => {
  it('maps client fields to CAB item ids by label', () => {
    const values = clientToCabValues(
      {
        razonSocial: 'Playadito SA',
        cuit: '30-12345678-9',
        rubro: 'Yerba',
        empleados: 120,
        referenteNombre: null,
        referenteContacto: null,
        erpActual: null,
        proveedorCorreo: null,
        soporteItActual: null
      },
      cabItems,
      '2026-07-15'
    );

    expect(values).toEqual({
      a: 'Playadito SA',
      b: '30-12345678-9',
      c: 'Yerba',
      d: 120,
      e: '2026-07-15'
    });
  });

  it('merge keeps explicit CAB responses over defaults', () => {
    const merged = mergeCabResponses(
      { a: 'Default SA', b: '30-00000000-0' },
      { a: 'Override SA' }
    );

    expect(merged).toEqual({ a: 'Override SA', b: '30-00000000-0' });
  });

  it('applyCabDefaultsToItems fills empty values only', () => {
    const items = applyCabDefaultsToItems(
      [
        { id: 'a', label: 'Razón social', fieldType: 'text', value: 'Manual' },
        { id: 'b', label: 'CUIT', fieldType: 'text', value: null }
      ],
      newClientToCabFields({ razonSocial: 'Seed SA', cuit: '30-11111111-1' })
    );

    expect(items[0].value).toBe('Manual');
    expect(items[1].value).toBe('30-11111111-1');
  });

  it('cabResponsesToClientPatch maps CAB back to client columns', () => {
    const patch = cabResponsesToClientPatch(cabItems, {
      a: 'Nuevo SA',
      d: '45',
      e: '2026-08-01'
    });

    expect(patch).toEqual({
      razonSocial: 'Nuevo SA',
      empleados: 45
    });
  });
});
