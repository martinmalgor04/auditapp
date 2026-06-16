/**
 * #23 Fase 4 — Etiquetas y constantes de presentación del cockpit `/crm` de empresas.
 * Compartido entre el listado, la ficha y los tests. Sin lógica de servidor.
 */

export const EMPRESA_RELACIONES = ['cliente', 'prospecto', 'ex_cliente'] as const;
export type EmpresaRelacion = (typeof EMPRESA_RELACIONES)[number];

export const EMPRESA_RELACION_LABELS: Record<EmpresaRelacion, string> = {
  cliente: 'Cliente',
  prospecto: 'Prospecto',
  ex_cliente: 'Ex-cliente'
};

export const EMPRESA_ESTADOS = [
  'sin_contactar',
  'contactada',
  'auditoria_en_curso',
  'auditada',
  'presupuestada',
  'activa',
  'inactiva'
] as const;
export type EmpresaEstado = (typeof EMPRESA_ESTADOS)[number];

export const EMPRESA_ESTADO_LABELS: Record<EmpresaEstado, string> = {
  sin_contactar: 'Sin contactar',
  contactada: 'Contactada',
  auditoria_en_curso: 'Auditoría en curso',
  auditada: 'Auditada',
  presupuestada: 'Presupuestada',
  activa: 'Activa',
  inactiva: 'Inactiva'
};

/** Clases Tailwind para el badge de relación. */
export const EMPRESA_RELACION_BADGE: Record<EmpresaRelacion, string> = {
  cliente: 'bg-emerald-100 text-emerald-800',
  prospecto: 'bg-sky-100 text-sky-800',
  ex_cliente: 'bg-stone-200 text-stone-700'
};

/**
 * #23 Fase 5 (R22): tipos de evento de timeline que el staff puede registrar desde la ficha.
 * `cambio_estado` y `sistema` NO se ofrecen acá (los genera el sistema). Las labels cubren también
 * esos tipos para mostrar correctamente los eventos existentes en el timeline.
 */
export const EMPRESA_EVENTO_TIPOS_REGISTRABLES = ['llamada', 'reunion', 'nota'] as const;
export type EmpresaEventoTipoRegistrable = (typeof EMPRESA_EVENTO_TIPOS_REGISTRABLES)[number];

export const EMPRESA_EVENTO_TIPO_LABELS: Record<string, string> = {
  llamada: 'Llamada',
  reunion: 'Reunión',
  nota: 'Nota',
  cambio_estado: 'Cambio de estado',
  sistema: 'Sistema'
};

/** Clases Tailwind para el badge de estado efectivo. */
export const EMPRESA_ESTADO_BADGE: Record<EmpresaEstado, string> = {
  sin_contactar: 'bg-stone-100 text-stone-700',
  contactada: 'bg-amber-100 text-amber-800',
  auditoria_en_curso: 'bg-indigo-100 text-indigo-800',
  auditada: 'bg-violet-100 text-violet-800',
  presupuestada: 'bg-blue-100 text-blue-800',
  activa: 'bg-emerald-100 text-emerald-800',
  inactiva: 'bg-rose-100 text-rose-800'
};
