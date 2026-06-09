import type { MarketData } from './schema';

export type ClientMarketRow = {
  erp_actual: string | null;
  empleados: number | null;
  puestos: number | null;
  sedes: number | null;
  proveedor_correo: string | null;
  soporte_it_actual: string | null;
};

export function extractMarketData(
  client: ClientMarketRow,
  modulosTangoValue: unknown
): MarketData {
  let modulos_tango: string[] | null = null;

  if (Array.isArray(modulosTangoValue)) {
    modulos_tango = modulosTangoValue.filter((v): v is string => typeof v === 'string');
  } else if (modulosTangoValue === null || modulosTangoValue === undefined) {
    modulos_tango = null;
  }

  return {
    erp_actual: client.erp_actual ?? null,
    modulos_tango,
    empleados: client.empleados ?? null,
    puestos: client.puestos ?? null,
    sedes: client.sedes ?? null,
    proveedor_correo: client.proveedor_correo ?? null,
    soporte_it_actual: client.soporte_it_actual ?? null
  };
}
