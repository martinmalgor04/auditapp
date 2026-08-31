/**
 * #62 — Etiquetas y badges de presentación para la UI de revisión de escaneos.
 * Compartido entre lista, detalle y tests. Sin lógica de servidor.
 * Patrón: `$lib/crm/empresa-view.ts`; colores solo tokens `--sys-*` (#42).
 */
import type {
  DispositivoRevision,
  DispositivoTipo,
  EscaneoEstado
} from '$lib/server/escaneos/schemas';

export const ESCANEO_ESTADO_LABELS: Record<EscaneoEstado, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  sincronizando: 'Sincronizando',
  completado: 'Completado',
  fallido: 'Fallido',
  cancelado: 'Cancelado'
};

/** Clases Tailwind con tokens --sys-* para el pill de estado de escaneo. */
export const ESCANEO_ESTADO_BADGE: Record<EscaneoEstado, string> = {
  pendiente: 'bg-sys-status-blue-bg text-sys-status-blue-text',
  en_curso: 'bg-[rgba(245,158,11,.12)] text-sys-status-amber',
  sincronizando: 'bg-[rgba(245,158,11,.12)] text-sys-status-amber',
  completado: 'bg-[rgba(16,185,129,.12)] text-sys-status-green',
  fallido: 'bg-[rgba(239,68,68,.12)] text-sys-status-red',
  cancelado: 'bg-sys-bg-app text-sys-text-muted'
};

export const DISPOSITIVO_TIPOS = [
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
] as const;

export const DISPOSITIVO_TIPO_LABELS: Record<DispositivoTipo, string> = {
  servidor: 'Servidor',
  workstation: 'Workstation',
  notebook: 'Notebook',
  switch: 'Switch',
  router: 'Router',
  firewall: 'Firewall',
  impresora: 'Impresora',
  camara: 'Cámara',
  nas: 'NAS',
  ups: 'UPS',
  telefonia: 'Telefonía',
  movil: 'Móvil',
  virtual: 'Virtual',
  desconocido: 'Desconocido'
};

export const REVISION_LABELS: Record<DispositivoRevision, string> = {
  sin_revisar: 'Sin revisar',
  confirmado: 'Confirmado',
  descartado: 'Descartado',
  fusionado: 'Fusionado'
};

/** Clases Tailwind con tokens --sys-* para el pill de revisión efectiva. */
export const REVISION_BADGE: Record<DispositivoRevision, string> = {
  sin_revisar: 'bg-sys-bg-app text-sys-text-muted',
  confirmado: 'bg-[rgba(16,185,129,.12)] text-sys-status-green',
  descartado: 'bg-[rgba(239,68,68,.12)] text-sys-status-red',
  fusionado: 'bg-sys-status-blue-bg text-sys-status-blue-text'
};

/** 'aabbccddeeff' → 'aa:bb:cc:dd:ee:ff' (otro input se devuelve igual). */
export function formatMac(mac: string): string {
  return /^[0-9a-f]{12}$/.test(mac) ? (mac.match(/../g) as string[]).join(':') : mac;
}

// ── Tipos serializados (fechas ISO) que sirven las páginas a los componentes ──

export type OcurrenciaUi = {
  dispositivoId: string;
  escaneoId: string;
  escaneoEtiqueta: string | null;
  escaneoRango: string;
  escaneoEstado: EscaneoEstado;
  vistoAt: string | null;
};

export type DispositivoConsolidadoUi = {
  identidad: string;
  identidadPorIp: boolean;
  mac: string | null;
  ip: string;
  hostname: string | null;
  fqdn: string | null;
  fabricante: string | null;
  modelo: string | null;
  serial: string | null;
  tipo: DispositivoTipo;
  soFamilia: string | null;
  soNombre: string | null;
  soVersion: string | null;
  cpuDescripcion: string | null;
  memoriaMb: number | null;
  discoTotalGb: number | null;
  vistoAt: string | null;
  revision: DispositivoRevision;
  revisadoPor: string | null;
  revisadoAt: string | null;
  notaTecnico: string | null;
  relevamientoItemId: string | null;
  relevamientoRowId: string | null;
  canonicalId: string;
  ocurrencias: OcurrenciaUi[];
};

export type EscaneoUi = {
  id: string;
  etiqueta: string | null;
  rangoObjetivo: string;
  estado: EscaneoEstado;
  dispositivosDetectados: number;
  iniciadoAt: string | null;
  finalizadoAt: string | null;
  createdAt: string;
  tokenActivo: boolean;
  tokenExpiresAt: string | null;
};

/** URL del detalle por identidad (IPv6 contiene ':' → encodeURIComponent). */
export function detalleDispositivoHref(auditId: string, identidad: string): string {
  return `/auditorias/${auditId}/escaneos/dispositivos/${encodeURIComponent(identidad)}`;
}
