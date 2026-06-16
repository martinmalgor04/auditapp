import { z } from 'zod';

/** Normaliza CUIT a solo dígitos. '30-12345678-9' -> '30123456789'. Vacío -> null. */
export function normalizeCuit(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** Fila ya normalizada (vacíos -> null, cuit -> dígitos) lista para validar. */
export const clientImportRowSchema = z.object({
  razon_social: z.string().trim().min(1, 'razon_social obligatoria'),
  cuit: z
    .string()
    .nullable()
    .transform((v) => (v !== null && /^\d{11}$/.test(v) ? v : null)),
  direccion: z.string().nullable(),
  cp: z.string().nullable(),
  provincia: z.string().nullable(),
  telefono: z.string().nullable(),
  email: z.string().nullable()
});

export type ClientImportRow = z.infer<typeof clientImportRowSchema>;
