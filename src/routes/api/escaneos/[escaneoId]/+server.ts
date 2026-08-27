import type { RequestHandler } from './$types';
import { apiSuccess } from '$lib/server/api/envelope';
import { requireAgenteRequest } from '$lib/server/api/require-agente-escaneo';
import { obtenerEscaneo } from '$lib/server/escaneos/repo';
import { obtenerContextoEscaneo } from '$lib/server/escaneos/api';
import { EscaneoNotFoundError } from '$lib/server/escaneos/errors';
import { mapErrorEscaneo } from '$lib/server/escaneos/http';

/**
 * Estado del escaneo para el agente (R11) con el contexto de confirmación del
 * técnico (empresa + auditoría). Lectura permitida también en estado terminal
 * (R10).
 */
export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
  const ambito = await requireAgenteRequest(request, params.escaneoId, getClientAddress());
  if (ambito instanceof Response) {
    return ambito;
  }

  try {
    const escaneo = await obtenerEscaneo(ambito.empresaId, ambito.escaneoId);
    const contexto = await obtenerContextoEscaneo(ambito.empresaId, ambito.escaneoId);
    if (!contexto) {
      throw new EscaneoNotFoundError();
    }
    return apiSuccess({
      estado: escaneo.estado,
      dispositivosDetectados: escaneo.dispositivos_detectados,
      consentimientoOtorgado: escaneo.consentimiento_otorgado,
      etiqueta: escaneo.etiqueta,
      rangoObjetivo: escaneo.rango_objetivo,
      iniciadoAt: escaneo.iniciado_at,
      finalizadoAt: escaneo.finalizado_at,
      empresa: contexto.empresa,
      auditoria: contexto.auditoria
    });
  } catch (err) {
    return mapErrorEscaneo(err);
  }
};
