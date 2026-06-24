import { z } from 'zod';
import { MercadoInvalidFilterError } from './errors';

export const mercadoFiltersSchema = z
  .object({
    segment: z.enum(['A', 'B', 'C']).optional(),
    rubro: z.string().min(1).optional(),
    provincia: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: 'La fecha desde no puede ser posterior a la fecha hasta'
  });

export type MercadoFilters = z.infer<typeof mercadoFiltersSchema>;

function parseDateParam(raw: string | null): unknown {
  if (!raw) return undefined;
  return raw;
}

export function parseMercadoFilters(url: URL): MercadoFilters {
  const parsed = mercadoFiltersSchema.safeParse({
    segment: url.searchParams.get('segment') || undefined,
    rubro: url.searchParams.get('rubro') || undefined,
    provincia: url.searchParams.get('provincia') || undefined,
    from: parseDateParam(url.searchParams.get('from')),
    to: parseDateParam(url.searchParams.get('to'))
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ') || 'Filtros inválidos';
    throw new MercadoInvalidFilterError(message);
  }

  return parsed.data;
}
