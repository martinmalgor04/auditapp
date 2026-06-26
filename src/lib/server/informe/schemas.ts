import { z } from 'zod';

import type { TipoAuditoria } from './tipo';

/** Schemas Zod estrictos del borrador IA (R10, R11, R16, R25). Fuente de verdad local. */

const semaphoreSchema = z.enum(['green', 'amber', 'red']);

const indexWithSemaphoreSchema = z
  .object({
    valor: z.number().int().min(0).max(100),
    semaforo: semaphoreSchema
  })
  .strict();

// ── Página 2: resumen ejecutivo ──
const resumenSchema = z
  .object({
    diagnostico: z.string().min(1).max(90),
    lead: z.string().min(1),
    circuitos_con_controles: z
      .object({
        n: z.number().int().min(0),
        total: z.number().int().min(1)
      })
      .strict()
      .nullable(),
    interpretacion: z.string().min(1),
    recomendacion_central: z.string().min(1),
    fortalezas: z.string().min(1).nullable()
  })
  .strict();

// ── Página 3: hallazgos por circuito ──
const dimensionSchema = z.string().min(1).max(24);

const hallazgoCircuitoSchema = z
  .object({
    seccion_code: z.string().min(1),
    doc: dimensionSchema,
    controles: dimensionSchema,
    madurez: dimensionSchema
  })
  .strict();

const lecturaTransversalSchema = z
  .object({
    titulo: z.string().min(1),
    detalle: z.string().min(1)
  })
  .strict();

// ── Página 4: riesgos priorizados ──
const riesgoSchema = z
  .object({
    titulo: z.string().min(1),
    descripcion: z.string().min(1),
    evidencia: z.string().min(1),
    severidad: z.enum(['baja', 'media', 'alta', 'critica'])
  })
  .strict();

// ── Página 5: recomendación + plan ──
const etapaPlanSchema = z
  .object({
    semana: z.string().min(1).max(12),
    titulo: z.string().min(1),
    descripcion: z.string().min(1)
  })
  .strict();

const planSchema = z
  .object({
    titulo: z.string().min(1),
    descripcion: z.string().min(1),
    etapas: z.array(etapaPlanSchema).min(2).max(6),
    necesitamos_cliente: z.array(z.string().min(1)).min(1).max(6),
    no_incluye: z.array(z.string().min(1)).min(1).max(6)
  })
  .strict();

// ── #46: control de usuarios / seguridad (derivado del canónico, no del IA) ──
const seguridadSchema = z
  .object({
    titulo: z.string().min(1),
    filas: z
      .array(
        z
          .object({
            control: z.string().min(1),
            estado: z.string(),
            observaciones: z.string()
          })
          .strict()
      )
      .min(1)
  })
  .strict();

// ── Página 6: qué cambia en el día a día ──
const circuitoDiaADiaSchema = z
  .object({
    seccion_code: z.string().min(1),
    // Estado actual del circuito en UNA línea ("Hoy: …"). null si no hay evidencia.
    hoy: z.string().min(1).nullable(),
    funcionalidades: z
      .array(
        z
          .object({
            nombre: z.string().min(1),
            que_resuelve: z.string().min(1)
          })
          .strict()
      )
      .length(3)
  })
  .strict();

export const reportClientDraftSchema = z
  .object({
    resumen: resumenSchema,
    indices: z
      .object({
        it: indexWithSemaphoreSchema.optional(),
        erp: indexWithSemaphoreSchema.optional()
      })
      .strict(),
    hallazgos: z
      .object({
        circuitos: z.array(hallazgoCircuitoSchema).min(1),
        lectura_transversal: z.array(lecturaTransversalSchema).min(3).max(4)
      })
      .strict(),
    riesgos: z
      .object({
        intro: z.string().min(1),
        items: z.array(riesgoSchema).min(3).max(5)
      })
      .strict(),
    plan: planSchema,
    dia_a_dia: z
      .object({
        intro: z.string().min(1),
        circuitos: z.array(circuitoDiaADiaSchema).min(2).max(4),
        callout_transversal: z.string().min(1).nullable()
      })
      .strict(),
    proximos_pasos: z.array(z.string().min(1)).min(3).max(5),
    // #46 (R3) — opcional/nullable: lo puebla el builder server desde el canónico,
    // no el generador IA. Presente solo si la auditoría relevó seguridad.
    seguridad: seguridadSchema.nullable().optional()
  })
  .strict(); // strict() rechaza claves upsell/recomendaciones/etc. (R16)

/** Variante mixta (#19 R7): límites ampliados para hallazgos cross-dominio. */
const reportClientDraftMixtaSchema = reportClientDraftSchema
  .extend({
    hallazgos: z
      .object({
        circuitos: z.array(hallazgoCircuitoSchema).min(1),
        lectura_transversal: z.array(lecturaTransversalSchema).min(3).max(6)
      })
      .strict(),
    riesgos: z
      .object({
        intro: z.string().min(1),
        items: z.array(riesgoSchema).min(3).max(6)
      })
      .strict(),
    dia_a_dia: z
      .object({
        intro: z.string().min(1),
        circuitos: z.array(circuitoDiaADiaSchema).min(2).max(6),
        callout_transversal: z.string().min(1).nullable()
      })
      .strict()
  })
  .strict();

export function reportClientDraftSchemaFor(tipo: TipoAuditoria) {
  if (tipo !== 'mixta') return reportClientDraftSchema;
  return reportClientDraftMixtaSchema;
}

export const reportInternalDraftSchema = z
  .object({
    recomendaciones_presupuesto: z
      .array(
        z
          .object({
            linea: z.string().min(1),
            rango_estimado: z.string().min(1),
            urgencia: z.enum(['baja', 'media', 'alta']),
            probabilidad_cierre: z.enum(['baja', 'media', 'alta']),
            candidato_financiacion: z.boolean(),
            candidato_abono: z.boolean(),
            justificacion: z.string().min(1)
          })
          .strict()
      )
      .min(1)
  })
  .strict(); // (R11)

/** Envelope de una sola llamada Claude: ambas mitades (design). */
export const reportDraftEnvelopeSchema = z
  .object({
    cliente: reportClientDraftSchema,
    interna: reportInternalDraftSchema
  })
  .strict();

export const loomUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https:\/\/(www\.)?loom\.com\//.test(u), {
    message: 'Debe ser una URL https de loom.com'
  }); // (R25)

export const patchReportSchema = z
  .object({
    client_draft: z.record(z.string(), z.unknown()).optional(),
    loom_url: loomUrlSchema.nullable().optional(),
    origin: z.enum(['inline', 'form']).default('form')
  })
  .refine((v) => v.client_draft !== undefined || v.loom_url !== undefined, {
    message: 'Debe incluir client_draft o loom_url'
  });

/**
 * Generación del link de entrega (#15, R7): 1–365 días o null = sin vencimiento.
 * Default 90 = INFORME_SHARE_DEFAULT_DAYS (constante de dominio en share.ts).
 */
export const createShareSchema = z
  .object({
    expires_in_days: z.number().int().min(1).max(365).nullable().default(90)
  })
  .strict();

export type CreateShareInput = z.infer<typeof createShareSchema>;

export type ReportClientDraft = z.infer<typeof reportClientDraftSchema>;
export type ReportInternalDraft = z.infer<typeof reportInternalDraftSchema>;
export type ReportDraftEnvelope = z.infer<typeof reportDraftEnvelopeSchema>;
export type PatchReportInput = z.infer<typeof patchReportSchema>;
