import type { RequestHandler } from './$types';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { requireAgenteRequest } from '$lib/server/api/require-agente-escaneo';
import { cambiarEstadoEscaneo } from '$lib/server/escaneos/repo';
import { cambiarEstadoInput, mapErrorEscaneo } from '$lib/server/escaneos/http';

/**
 * Transición de estado (R16): aplica la máquina TRANSICIONES de #59 con la
 * validación de consentimiento para `en_curso` (R8 de #59). Transición
 * inválida o sin consentimiento → 409 (R17); `fallido` sin detalle → 400 (R18).
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
  const ambito = await requireAgenteRequest(request, params.escaneoId, getClientAddress());
  if (ambito instanceof Response) {
    return ambito;
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = cambiarEstadoInput.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  try {
    const row = await cambiarEstadoEscaneo(
      ambito.empresaId,
      ambito.escaneoId,
      parsed.data.estado,
      parsed.data.errorDetalle
    );
    return apiSuccess({
      estado: row.estado,
      iniciadoAt: row.iniciado_at,
      finalizadoAt: row.finalizado_at
    });
  } catch (err) {
    return mapErrorEscaneo(err);
  }
};
