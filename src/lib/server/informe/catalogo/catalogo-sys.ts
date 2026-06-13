import { z } from 'zod';

export const CATALOGO_SYS_VERSION = '1.0';

const rangoUsdSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative()
  })
  .strict()
  .refine((r) => r.min <= r.max, { message: 'rango_usd.min debe ser <= max' });

export const catalogoLineaSchema = z
  .object({
    linea: z.string().min(1),
    descripcion: z.string().min(1),
    proveedores: z.array(z.string()).min(1),
    rango_usd: rangoUsdSchema,
    condiciones: z.string().min(1)
  })
  .strict();

export const catalogoSchema = z.array(catalogoLineaSchema).min(1);

export type CatalogoLinea = z.infer<typeof catalogoLineaSchema>;

/** Catálogo SyS v1 — rangos orientativos, revisión comercial (R8). */
export const CATALOGO_SYS: CatalogoLinea[] = catalogoSchema.parse([
  {
    linea: 'Tango Gestión — implementación módulos core',
    descripcion: 'Parametrización e implementación de Ventas, Compras, Stock y Contabilidad.',
    proveedores: ['Arizmendi / Tango'],
    rango_usd: { min: 4_000, max: 12_000 },
    condiciones: 'Según cantidad de módulos, usuarios y sucursales; no incluye hardware.'
  },
  {
    linea: 'Tango Nexo / e-commerce',
    descripcion: 'Integración tienda online con Tango (Nexo, WooCommerce, Mercado Shops).',
    proveedores: ['Arizmendi / Tango'],
    rango_usd: { min: 2_500, max: 8_000 },
    condiciones: 'Requiere Tango Gestión operativo; integraciones a terceros se cotizan aparte.'
  },
  {
    linea: 'Tango Restó / Punto de Venta',
    descripcion: 'Implementación y capacitación de Tango Restó o Tango PdV.',
    proveedores: ['Arizmendi / Tango'],
    rango_usd: { min: 1_500, max: 5_000 },
    condiciones: 'Por sucursal o punto de venta; periféricos no incluidos.'
  },
  {
    linea: 'Infraestructura servidores HPE',
    descripcion: 'Servidor(es) on-premise o hiperconvergente para ERP y servicios críticos.',
    proveedores: ['HPE'],
    rango_usd: { min: 8_000, max: 35_000 },
    condiciones: 'Hardware + instalación básica; licencias OS/backup aparte.'
  },
  {
    linea: 'Infraestructura servidores Lenovo / Dell',
    descripcion: 'Servidores tower/rack o storage para cargas ERP y virtualización.',
    proveedores: ['Lenovo', 'Dell'],
    rango_usd: { min: 5_000, max: 28_000 },
    condiciones: 'Según CPU/RAM/storage; garantía extendida opcional.'
  },
  {
    linea: 'Seguridad perimetral Sophos',
    descripcion: 'Firewall UTM/XG, protección endpoint y políticas de acceso remoto.',
    proveedores: ['Sophos'],
    rango_usd: { min: 2_000, max: 12_000 },
    condiciones: 'Licencias anuales Sophos aparte; sizing según usuarios y sitios.'
  },
  {
    linea: 'Soporte y abono mensual SyS',
    descripcion: 'Mesa de ayuda, mantenimiento preventivo y soporte remoto/presencial.',
    proveedores: ['Servicios y Sistemas'],
    rango_usd: { min: 400, max: 2_500 },
    condiciones: 'Abono mensual según SLA, usuarios y complejidad del entorno.'
  },
  {
    linea: 'SysDesk — tickets y mesa de ayuda',
    descripcion: 'Implementación del producto propio SysDesk para gestión de tickets interna.',
    proveedores: ['Servicios y Sistemas'],
    rango_usd: { min: 800, max: 3_000 },
    condiciones: 'Setup inicial + capacitación; hosting según modalidad acordada.'
  }
]);

export function loadCatalogoSys(): { version: string; lineas: CatalogoLinea[] } {
  return { version: CATALOGO_SYS_VERSION, lineas: CATALOGO_SYS };
}
