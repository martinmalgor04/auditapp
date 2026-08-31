import { z } from 'zod';

export const escaneoEstado = z.enum([
  'pendiente',
  'en_curso',
  'sincronizando',
  'completado',
  'fallido',
  'cancelado'
]);

export const dispositivoTipo = z.enum([
  'servidor',
  'workstation',
  'notebook',
  'switch',
  'router',
  'firewall',
  'impresora',
  'camara',
  'nas',
  'ups',
  'telefonia',
  'movil',
  'virtual',
  'desconocido'
]);

export const dispositivoRevision = z.enum([
  'sin_revisar',
  'confirmado',
  'descartado',
  'fusionado'
]);

export const servicioProtocolo = z.enum(['tcp', 'udp', 'sctp']);

/** MAC en cualquier formato → 12 hex minúsculas (R15). */
export const macNormalizada = z
  .string()
  .transform((v) => v.replace(/[^0-9a-fA-F]/g, '').toLowerCase())
  .refine((v) => v.length === 12, { message: 'MAC inválida' });

export const softwareInput = z.object({
  nombre: z.string().min(1).max(500),
  version: z.string().max(200).nullish(),
  publisher: z.string().max(300).nullish(),
  instaladoAt: z.coerce.date().nullish(),
  raw: z.record(z.unknown()).default({})
});

export const servicioInput = z.object({
  puerto: z.number().int().min(1).max(65535),
  protocolo: servicioProtocolo.default('tcp'),
  estadoPuerto: z.string().max(50).default('open'),
  servicio: z.string().max(200).nullish(),
  producto: z.string().max(300).nullish(),
  version: z.string().max(200).nullish(),
  banner: z.string().max(2000).nullish(),
  raw: z.record(z.unknown()).default({})
});

export const dispositivoInput = z.object({
  mac: macNormalizada.nullish(),
  ip: z.string().ip(),
  hostname: z.string().max(300).nullish(),
  fqdn: z.string().max(500).nullish(),
  fabricante: z.string().max(300).nullish(),
  modelo: z.string().max(300).nullish(),
  serial: z.string().max(200).nullish(),
  tipo: dispositivoTipo.default('desconocido'),
  soFamilia: z.string().max(100).nullish(),
  soNombre: z.string().max(300).nullish(),
  soVersion: z.string().max(100).nullish(),
  soArquitectura: z.string().max(50).nullish(),
  cpuDescripcion: z.string().max(300).nullish(),
  memoriaMb: z.number().int().positive().nullish(),
  discoTotalGb: z.number().int().positive().nullish(),
  vistoAt: z.coerce.date().nullish(),
  fuente: z.string().max(50).default('open-audit'),
  raw: z.record(z.unknown()).default({}),
  software: z.array(softwareInput).max(2000).default([]),
  servicios: z.array(servicioInput).max(500).default([])
});

/** Identidad determinística (R12). */
export function identidadDispositivo(d: { mac?: string | null; ip: string }): string {
  return d.mac && d.mac.length === 12 ? d.mac : d.ip;
}

export const crearEscaneoInput = z.object({
  auditId: z.string().uuid(),
  etiqueta: z.string().max(200).nullish(),
  rangoObjetivo: z.string().min(1).max(200),
  agenteVersion: z.string().max(50),
  agenteHostname: z.string().max(300).nullish(),
  // Consentimiento opcional al crear (decisión puerta); obligatorio para en_curso (R8)
  consentimientoPor: z.string().min(1).max(300).nullish(),
  consentimientoAt: z.coerce.date().nullish()
});

export const registrarConsentimientoInput = z.object({
  consentimientoPor: z.string().min(1).max(300),
  consentimientoAt: z.coerce.date()
});

// ── #62: UI de revisión ────────────────────────────────────────────────

/**
 * Versión precargada al crear escaneo desde la UI; el agente la corrige al
 * conectarse (R21 de #60). Major alineado con AGENTE_MAJOR_SOPORTADO.
 */
export const AGENTE_VERSION_INICIAL = '1.0.0';

export const filtrosConsolidadoInput = z.object({
  tipo: dispositivoTipo.optional(),
  revision: dispositivoRevision.optional(),
  escaneo: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1)
});

export const crearEscaneoUiInput = z.object({
  etiqueta: z.string().max(200).nullish(),
  rangoObjetivo: z.string().min(1).max(200)
});

export const marcarRevisionGrupoInput = z.object({
  identidad: z.string().min(1).max(300),
  revision: z.enum(['confirmado', 'descartado', 'sin_revisar']),
  nota: z.string().max(2000).nullish()
});

export const fusionarDispositivoInput = z.object({
  identidad: z.string().min(1).max(300),
  itemId: z.string().uuid(),
  // row_id es UUID en filas nuevas (crypto.randomUUID) pero el canónico lo
  // tipa string (#45): se acepta string para no romper filas históricas
  rowId: z.string().min(1).max(100),
  nota: z.string().max(2000).nullish()
});

export const TRANSICIONES: Record<EscaneoEstado, EscaneoEstado[]> = {
  pendiente: ['en_curso', 'cancelado'],
  en_curso: ['sincronizando', 'fallido', 'cancelado'],
  sincronizando: ['completado', 'fallido'],
  completado: [],
  fallido: [],
  cancelado: []
};

export type EscaneoEstado = z.infer<typeof escaneoEstado>;
export type DispositivoTipo = z.infer<typeof dispositivoTipo>;
export type DispositivoRevision = z.infer<typeof dispositivoRevision>;
export type SoftwareInput = z.infer<typeof softwareInput>;
export type ServicioInput = z.infer<typeof servicioInput>;
export type DispositivoInput = z.infer<typeof dispositivoInput>;
export type CrearEscaneoInput = z.infer<typeof crearEscaneoInput>;
export type RegistrarConsentimientoInput = z.infer<typeof registrarConsentimientoInput>;
export type FiltrosConsolidadoInput = z.infer<typeof filtrosConsolidadoInput>;
export type CrearEscaneoUiInput = z.infer<typeof crearEscaneoUiInput>;
export type MarcarRevisionGrupoInput = z.infer<typeof marcarRevisionGrupoInput>;
export type FusionarDispositivoInput = z.infer<typeof fusionarDispositivoInput>;
