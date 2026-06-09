import { apiSuccess } from '$lib/server/api/envelope';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return apiSuccess({ status: 'ok' });
};
