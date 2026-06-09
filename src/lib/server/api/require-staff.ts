import type { AppUser } from '../auth/types';
import { apiError } from './envelope';

export function requireStaffApi(locals: App.Locals): AppUser | Response {
  if (!locals.user) {
    return apiError('No autorizado', 401);
  }
  if (locals.user.role !== 'admin' && locals.user.role !== 'tecnico') {
    return apiError('No tenés permiso para esta acción', 403);
  }
  return locals.user;
}
