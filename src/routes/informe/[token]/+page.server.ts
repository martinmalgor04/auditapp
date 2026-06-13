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
    // Causa indistinguible hacia afuera (R2); el log server-side ya la registró.
    error(404, INFORME_SHARE_UNAVAILABLE_MESSAGE);
  }

  await registerShareView(resolution.share.id);
  setHeaders({ 'X-Robots-Tag': 'noindex, nofollow' });

  return {
    model: buildInformeRenderModel(resolution.report),
    token: params.token
  };
};
