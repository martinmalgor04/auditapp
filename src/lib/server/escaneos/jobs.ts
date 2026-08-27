import { logger } from '$lib/server/logger';
import { cambiarEstadoEscaneo, escaneosColgados } from './repo';
import { EscaneoNotFoundError, TransicionInvalidaError } from './errors';
import { resolverAmbitoEscaneo } from './api';

export const ERROR_DETALLE_COLGADO = 'Sin actividad por más de 24 horas (job de limpieza)';

/**
 * Job de escaneos colgados (R7 de #59 → R26 de #60): marca `fallido` todo
 * escaneo candidato usando la máquina de estados (R10 de #59), con el
 * `empresaId` real resuelto por join (R26/R27 de #59).
 *
 * Idempotente (R28): tras marcar, los escaneos quedan en estado terminal y
 * `escaneosColgados()` ya no los devuelve. Un candidato que cambió de estado
 * entre la lectura y el marcado se saltea (log warn) sin abortar el lote.
 */
export async function marcarColgadosFallidos(): Promise<{ marcados: number }> {
  const colgados = await escaneosColgados();
  let marcados = 0;

  for (const esc of colgados) {
    const ambito = await resolverAmbitoEscaneo(esc.id);
    if (!ambito) continue;
    try {
      await cambiarEstadoEscaneo(ambito.empresaId, esc.id, 'fallido', ERROR_DETALLE_COLGADO);
      marcados += 1;
    } catch (err) {
      if (err instanceof TransicionInvalidaError || err instanceof EscaneoNotFoundError) {
        logger.warn('escaneo_colgado_skip', { escaneoId: esc.id, motivo: err.message });
        continue;
      }
      throw err;
    }
  }

  return { marcados };
}
