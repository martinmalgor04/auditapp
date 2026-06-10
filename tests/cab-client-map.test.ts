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
  it('scope completo: client → CAB, merge de overrides y CAB → client', () => {
    const client = {
      razonSocial: 'Playadito SA',
      cuit: '30-12345678-9',
      rubro: 'Yerba',
      empleados: 120,
      referenteNombre: null,
      referenteContacto: null,
      erpActual: null,
      proveedorCorreo: null,
      soporteItActual: null
    };

    const defaults = clientToCabValues(client, cabItems, '2026-07-15');
    expect(defaults).toEqual({
      a: 'Playadito SA',
      b: '30-12345678-9',
      c: 'Yerba',
      d: 120,
      e: '2026-07-15'
    });

    const merged = mergeCabResponses(defaults, { a: 'Override SA' });
    expect(merged.a).toBe('Override SA');
    expect(merged.b).toBe('30-12345678-9');

    const items = applyCabDefaultsToItems(
      [
        { id: 'a', label: 'Razón social', fieldType: 'text', value: 'Manual' },
        { id: 'b', label: 'CUIT', fieldType: 'text', value: null }
      ],
      newClientToCabFields({ razonSocial: 'Seed SA', cuit: '30-11111111-1' })
    );
    expect(items[0].value).toBe('Manual');
    expect(items[1].value).toBe('30-11111111-1');

    expect(
      cabResponsesToClientPatch(cabItems, { a: 'Nuevo SA', d: '45', e: '2026-08-01' })
    ).toEqual({ razonSocial: 'Nuevo SA', empleados: 45 });
  });
});
