import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { registerShareView } from '$lib/server/db/informe-shares';
import { buildInformeRenderModel } from '$lib/server/informe/model';
import { isInformeShareRateLimited } from '$lib/server/informe/rate-limit';
import {
  INFORME_SHARE_UNAVAILABLE_MESSAGE,
  resolveShareByToken
} from '$lib/server/informe/share';

export const load: PageServerLoad = async ({ params, setHeaders, getClientAddress }) => {
  if (isInformeShareRateLimited(getClientAddress())) {
    error(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
  }

  const resolution = await resolveShareByToken(params.token);
  if (!resolution.ok) {
    error(404, INFORME_SHARE_UNAVAILABLE_MESSAGE);
  }

  // Decisión puerta #15-3: imprimir también cuenta como vista real (R9, R13).
  await registerShareView(resolution.share.id);
  setHeaders({ 'X-Robots-Tag': 'noindex, nofollow' });

  const model = buildInformeRenderModel(resolution.report);
  return {
    // El PDF/print no incluye el bloque Loom (R11).
    model: { ...model, loomUrl: null },
    token: params.token
  };
};
