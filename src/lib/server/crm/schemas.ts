import { z } from 'zod';
import { CRM_FUNNEL } from './state-machine';

export const crmSourceSchema = z.enum(['firecrawl', 'referido', 'manual', 'otro']);

export const crmStatusSchema = z.enum([...CRM_FUNNEL, 'descartado']);

const emailField = z
  .string()
  .email('Email inválido')
  .transform((v) => v.trim().toLowerCase());

export const crmLeadBatchItemSchema = z.object({
  email: emailField,
  empresa: z.string().trim().min(1, 'Empresa requerida'),
  source: crmSourceSchema,
  contacto: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  notas: z.string().trim().optional()
});

export const crmLeadBatchSchema = z.array(crmLeadBatchItemSchema).min(1).max(200);

export const crmLeadCreateSchema = z.object({
  email: emailField,
  empresa: z.string().trim().min(1, 'Empresa requerida'),
  source: crmSourceSchema,
  contacto: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  notas: z.string().trim().optional()
});

export const crmLeadUpdateSchema = z
  .object({
    contacto: z.string().trim().nullable().optional(),
    telefono: z.string().trim().nullable().optional(),
    notas: z.string().trim().nullable().optional(),
    proxima_accion: z.string().trim().nullable().optional(),
    proxima_accion_fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
      .nullable()
      .optional(),
    presupuesto_ref: z.string().trim().nullable().optional(),
    client_id: z.string().uuid().nullable().optional(),
    audit_id: z.string().uuid().nullable().optional()
  })
  .strict();

export const crmStatusChangeSchema = z.object({
  to: crmStatusSchema
});

export const crmListFiltersSchema = z.object({
  status: crmStatusSchema.optional(),
  source: crmSourceSchema.optional(),
  q: z.string().trim().optional()
});

/**
 * #23 Fase 2 (R25/R31): selector explícito de `relacion` para el import en vivo.
 * El importador NO infiere la relación por el origen del archivo: la pantalla de import masivo
 * ofrece este selector y el endpoint lo recibe validado y lo aplica a todo el lote. Solo
 * `cliente | prospecto` (no `ex_cliente`, que es manual desde la ficha — decisión humana 6).
 */
export const empresaImportRelacionSchema = z.enum(['cliente', 'prospecto']);

export const empresaImportSchema = z.object({
  relacion: empresaImportRelacionSchema
});

export type EmpresaImportRelacion = z.infer<typeof empresaImportRelacionSchema>;

/**
 * #23 Fase 4 — Cockpit `/crm` (R16, R17, R29).
 *
 * `relacion` admite las tres clasificaciones (incluida `ex_cliente`, que sí se filtra/edita en la
 * ficha aunque el import en vivo no la ofrezca). El estado efectivo cubre el enum derivado del
 * design §3. La paginación es server-side (LIMIT/OFFSET) para no cargar las ~2000 fichas (R18).
 */
export const empresaRelacionSchema = z.enum(['cliente', 'prospecto', 'ex_cliente']);

export const empresaEstadoSchema = z.enum([
  'sin_contactar',
  'contactada',
  'auditoria_en_curso',
  'auditada',
  'presupuestada',
  'activa',
  'inactiva'
]);

export const empresaListFiltersSchema = z.object({
  relacion: empresaRelacionSchema.optional(),
  estado: empresaEstadoSchema.optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50)
});

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = z.preprocess(
  emptyToNull,
  z.string().trim().max(500).nullable().optional()
);

const optionalInt = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().min(0).nullable().optional()
);

/**
 * #23 Fase 4 (R19): editar datos maestros y `relacion` de una empresa. `.strict()` rechaza campos
 * no editables (id, created_at, estado_override —el override es Fase 5—). Todos opcionales:
 * PATCH parcial. Al menos un campo es validado en el endpoint.
 */
export const empresaUpdateSchema = z
  .object({
    razon_social: z.string().trim().min(1, 'Razón social requerida').max(500).optional(),
    relacion: empresaRelacionSchema.optional(),
    cuit: optionalText,
    rubro: optionalText,
    empleados: optionalInt,
    puestos: optionalInt,
    sedes: optionalInt,
    referente_nombre: optionalText,
    referente_cargo: optionalText,
    referente_contacto: optionalText,
    erp_actual: optionalText,
    proveedor_correo: optionalText,
    soporte_it_actual: optionalText,
    direccion: optionalText,
    cp: optionalText,
    provincia: optionalText,
    telefono: optionalText,
    email: optionalText,
    nivel_interes: optionalText,
    tiene_software: optionalText,
    observaciones: optionalText,
    fuente: optionalText
  })
  .strict();

/**
 * #23 Fase 5 (R22): evento/nota de timeline registrado manualmente desde la ficha. Tipos de
 * contacto/nota que el staff puede crear. `cambio_estado` y `sistema` NO se ofrecen acá: el primero
 * lo genera `setEstadoOverride` (R23), el segundo es interno/migración. `texto` requerido para que
 * el evento tenga contenido en el timeline.
 */
export const empresaEventoTipoSchema = z.enum(['llamada', 'reunion', 'nota']);

export const empresaEventoSchema = z.object({
  tipo: empresaEventoTipoSchema,
  texto: z.string().trim().min(1, 'El texto del evento es requerido').max(2000)
});

/**
 * #23 Fase 5 (R23): set/clear del `estado_override` manual. `null` limpia el override (vuelve al
 * estado auto-derivado); un estado válido lo fija. Genera un evento `cambio_estado` en el timeline.
 */
export const empresaOverrideSchema = z.object({
  estado_override: empresaEstadoSchema.nullable()
});

export type EmpresaListFilters = z.infer<typeof empresaListFiltersSchema>;
export type EmpresaUpdateInput = z.infer<typeof empresaUpdateSchema>;
export type EmpresaRelacion = z.infer<typeof empresaRelacionSchema>;
export type EmpresaEstado = z.infer<typeof empresaEstadoSchema>;
export type EmpresaEventoTipo = z.infer<typeof empresaEventoTipoSchema>;
export type EmpresaEventoInput = z.infer<typeof empresaEventoSchema>;
export type EmpresaOverrideInput = z.infer<typeof empresaOverrideSchema>;

export type CrmLeadBatchItem = z.infer<typeof crmLeadBatchItemSchema>;
export type CrmLeadCreateInput = z.infer<typeof crmLeadCreateSchema>;
export type CrmLeadUpdateInput = z.infer<typeof crmLeadUpdateSchema>;
