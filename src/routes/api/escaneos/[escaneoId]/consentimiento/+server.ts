import type { RequestHandler } from './$types';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { requireAgenteRequest } from '$lib/server/api/require-agente-escaneo';
import { registrarConsentimiento } from '$lib/server/escaneos/repo';
import { registrarConsentimientoInput } from '$lib/server/escaneos/schemas';
import { mapErrorEscaneo } from '$lib/server/escaneos/http';

/**
 * Registra el consentimiento (R12). El repo de #59 solo lo acepta en
 * `pendiente`; si ya salió de ese estado responde 409 vía mapErrorEscaneo.
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
  const ambito = await requireAgenteRequest(request, params.escaneoId, getClientAddress());
  if (ambito instanceof Response) {
    return ambito;
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = registrarConsentimientoInput.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  try {
    const row = await registrarConsentimiento(ambito.empresaId, ambito.escaneoId, parsed.data);
    return apiSuccess({
      consentimientoOtorgado: row.consentimiento_otorgado,
      consentimientoPor: row.consentimiento_por,
      consentimientoAt: row.consentimiento_at
    });
  } catch (err) {
    return mapErrorEscaneo(err);
  }
};
