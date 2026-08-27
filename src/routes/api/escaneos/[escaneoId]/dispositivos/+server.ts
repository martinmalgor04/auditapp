import type { RequestHandler } from './$types';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { requireAgenteRequest } from '$lib/server/api/require-agente-escaneo';
import { obtenerEscaneo, upsertDispositivos } from '$lib/server/escaneos/repo';
import { chunkDispositivosInput, mapErrorEscaneo } from '$lib/server/escaneos/http';

/** R15: rechazo previo al parse si el body supera 2 MB. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Chunk de dispositivos (R13): 1–100 ítems validados con los schemas de #59,
 * upsert idempotente (R14) y conteo resultante. Rate limit de ingesta 30/min
 * por token (R23) en el preludio.
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return apiError('El cuerpo del request supera el límite de 2 MB', 400);
  }

  const ambito = await requireAgenteRequest(request, params.escaneoId, getClientAddress(), {
    ingesta: true
  });
  if (ambito instanceof Response) {
    return ambito;
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = chunkDispositivosInput.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  try {
    await upsertDispositivos(ambito.empresaId, ambito.escaneoId, parsed.data.dispositivos);
    const escaneo = await obtenerEscaneo(ambito.empresaId, ambito.escaneoId);
    return apiSuccess({
      recibidos: parsed.data.dispositivos.length,
      dispositivosDetectados: escaneo.dispositivos_detectados
    });
  } catch (err) {
    return mapErrorEscaneo(err);
  }
};
