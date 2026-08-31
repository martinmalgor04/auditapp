import { fail } from '@sveltejs/kit';
import { failFromError } from '$lib/server/backoffice/route-helpers';
import { EscaneoNotFoundError, VinculoRelevamientoInvalidoError } from './errors';

/**
 * R29: como `failFromError` pero además mapea los errores de dominio de
 * escaneos (#59/#62, clases Error planas) a `fail()` con mensaje legible y
 * status semántico, sin stack ni SQL. Lo desconocido lo relanza
 * `failFromError` (log server-side + 500 genérico de SvelteKit).
 */
export function failFromEscaneoError(e: unknown) {
  if (e instanceof EscaneoNotFoundError) {
    return fail(404, { error: e.message, code: e.code });
  }
  if (e instanceof VinculoRelevamientoInvalidoError) {
    return fail(400, { error: e.message, code: e.code });
  }
  return failFromError(e);
}
