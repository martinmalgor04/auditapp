import { describe, expect, it } from 'vitest';
import {
  CATALOGO_SYS,
  CATALOGO_SYS_VERSION,
  catalogoLineaSchema,
  catalogoSchema
} from '../src/lib/server/informe/catalogo/catalogo-sys';

describe('informe catálogo SyS (R8)', () => {
  it('seed embebido pasa catalogoSchema', () => {
    expect(() => catalogoSchema.parse(CATALOGO_SYS)).not.toThrow();
    expect(CATALOGO_SYS.length).toBeGreaterThan(0);
  });

  it('CATALOGO_SYS_VERSION es string no vacío', () => {
    expect(CATALOGO_SYS_VERSION).toBeTruthy();
    expect(typeof CATALOGO_SYS_VERSION).toBe('string');
  });

  it('rechaza entrada sin rango_usd', () => {
    expect(
      catalogoLineaSchema.safeParse({
        linea: 'X',
        descripcion: 'd',
        proveedores: ['SyS'],
        condiciones: 'c'
      }).success
    ).toBe(false);
  });

  it('rechaza min > max', () => {
    expect(
      catalogoLineaSchema.safeParse({
        linea: 'X',
        descripcion: 'd',
        proveedores: ['SyS'],
        rango_usd: { min: 100, max: 50 },
        condiciones: 'c'
      }).success
    ).toBe(false);
  });
});
