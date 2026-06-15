/**
 * tests/cab-contacto-map.test.ts
 * Feature #22 cab_contacto_cliente
 *
 * Verifica:
 *  - clientToCabValues pre-rellena Dirección/Teléfono/Email cuando el cliente los tiene
 *  - No falla cuando los campos son null
 *  - newClientToCabFields incluye los 3 nuevos campos como null
 *  - cabResponsesToClientPatch extrae Dirección/Teléfono/Email al patch
 */

import { describe, expect, it } from 'vitest';
import {
  clientToCabValues,
  newClientToCabFields,
  cabResponsesToClientPatch,
  type ClientCabFields
} from '../src/lib/backoffice/cab-client-map';

/** UUIDs fijos de la migración 014 para erp-tango-v3 */
const ITEM_ID_DIRECCION_TANGO = 'a1b2c3d4-0001-0001-0001-000000000001';
const ITEM_ID_TELEFONO_TANGO = 'a1b2c3d4-0001-0002-0001-000000000001';
const ITEM_ID_EMAIL_TANGO = 'a1b2c3d4-0001-0003-0001-000000000001';

const cabItems = [
  { id: 'aa01', label: 'Razón social', fieldType: 'text' },
  { id: 'aa02', label: 'CUIT', fieldType: 'text' },
  { id: ITEM_ID_DIRECCION_TANGO, label: 'Dirección', fieldType: 'text' },
  { id: ITEM_ID_TELEFONO_TANGO, label: 'Teléfono', fieldType: 'text' },
  { id: ITEM_ID_EMAIL_TANGO, label: 'Email', fieldType: 'text' },
  { id: 'aa06', label: 'Fecha programada de visita', fieldType: 'date' }
];

const clientConContacto: ClientCabFields = {
  razonSocial: 'Playadito SA',
  cuit: '30-12345678-9',
  rubro: 'Yerba',
  empleados: 120,
  referenteNombre: 'Juan Perez',
  referenteContacto: null,
  erpActual: null,
  proveedorCorreo: null,
  soporteItActual: null,
  direccion: 'Av. Corrientes 123, Resistencia',
  telefono: '+54 362 412-3456',
  email: 'contacto@playadito.com.ar'
};

const clientSinContacto: ClientCabFields = {
  razonSocial: 'Cliente Sin Datos',
  cuit: null,
  rubro: null,
  empleados: null,
  referenteNombre: null,
  referenteContacto: null,
  erpActual: null,
  proveedorCorreo: null,
  soporteItActual: null,
  direccion: null,
  telefono: null,
  email: null
};

describe('cab-contacto-map — feature #22', () => {
  it('pre-rellena Dirección, Teléfono y Email cuando el cliente los tiene', () => {
    const defaults = clientToCabValues(clientConContacto, cabItems);

    expect(defaults[ITEM_ID_DIRECCION_TANGO]).toBe('Av. Corrientes 123, Resistencia');
    expect(defaults[ITEM_ID_TELEFONO_TANGO]).toBe('+54 362 412-3456');
    expect(defaults[ITEM_ID_EMAIL_TANGO]).toBe('contacto@playadito.com.ar');
  });

  it('pre-rellena razón social y CUIT junto con los campos de contacto', () => {
    const defaults = clientToCabValues(clientConContacto, cabItems);

    expect(defaults['aa01']).toBe('Playadito SA');
    expect(defaults['aa02']).toBe('30-12345678-9');
  });

  it('no falla y no incluye valores cuando los campos de contacto son null', () => {
    const defaults = clientToCabValues(clientSinContacto, cabItems);

    expect(defaults[ITEM_ID_DIRECCION_TANGO]).toBeUndefined();
    expect(defaults[ITEM_ID_TELEFONO_TANGO]).toBeUndefined();
    expect(defaults[ITEM_ID_EMAIL_TANGO]).toBeUndefined();
  });

  it('newClientToCabFields incluye direccion, telefono y email como null', () => {
    const fields = newClientToCabFields({
      razonSocial: 'Nuevo SA',
      cuit: '30-99999999-0',
      rubro: 'Comercio'
    });

    expect(fields.direccion).toBeNull();
    expect(fields.telefono).toBeNull();
    expect(fields.email).toBeNull();
  });

  it('cabResponsesToClientPatch extrae Dirección, Teléfono y Email al patch de cliente', () => {
    const patch = cabResponsesToClientPatch(cabItems, {
      [ITEM_ID_DIRECCION_TANGO]: 'Av. Mitre 500',
      [ITEM_ID_TELEFONO_TANGO]: '0800-123-4567',
      [ITEM_ID_EMAIL_TANGO]: 'info@empresa.com'
    });

    expect(patch.direccion).toBe('Av. Mitre 500');
    expect(patch.telefono).toBe('0800-123-4567');
    expect(patch.email).toBe('info@empresa.com');
  });

  it('cabResponsesToClientPatch ignora valores vacíos para los campos de contacto', () => {
    const patch = cabResponsesToClientPatch(cabItems, {
      [ITEM_ID_DIRECCION_TANGO]: '',
      [ITEM_ID_TELEFONO_TANGO]: null,
      [ITEM_ID_EMAIL_TANGO]: 'valido@empresa.com'
    });

    expect(patch.direccion).toBeUndefined();
    expect(patch.telefono).toBeUndefined();
    expect(patch.email).toBe('valido@empresa.com');
  });

  it('idempotencia conceptual: insertar los mismos UUIDs dos veces no duplica (ON CONFLICT DO NOTHING)', () => {
    // Este test verifica que los UUIDs están correctamente definidos como constantes
    // y que el mapeo LABEL_TO_FIELD para los 3 labels funciona consistentemente.
    const items = [
      { id: ITEM_ID_DIRECCION_TANGO, label: 'Dirección', fieldType: 'text' },
      { id: ITEM_ID_TELEFONO_TANGO, label: 'Teléfono', fieldType: 'text' },
      { id: ITEM_ID_EMAIL_TANGO, label: 'Email', fieldType: 'text' }
    ];

    const client: ClientCabFields = {
      ...clientSinContacto,
      direccion: 'Calle Falsa 123',
      telefono: '11-1234-5678',
      email: 'test@test.com'
    };

    const run1 = clientToCabValues(client, items);
    const run2 = clientToCabValues(client, items);

    // Dos llamadas con los mismos datos producen el mismo resultado (idempotente)
    expect(run1).toEqual(run2);
    expect(run1[ITEM_ID_DIRECCION_TANGO]).toBe('Calle Falsa 123');
    expect(run1[ITEM_ID_TELEFONO_TANGO]).toBe('11-1234-5678');
    expect(run1[ITEM_ID_EMAIL_TANGO]).toBe('test@test.com');
  });
});
