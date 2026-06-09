import { redirect } from '@sveltejs/kit';
import type { AppUser } from './types';

export class AuthError extends Error {
  readonly code: 'UNAUTHORIZED' | 'FORBIDDEN';
  readonly status: 401 | 403;

  constructor(code: 'UNAUTHORIZED' | 'FORBIDDEN', message: string) {
    super(message);
    this.code = code;
    this.status = code === 'UNAUTHORIZED' ? 401 : 403;
    this.name = 'AuthError';
  }
}

/** Lanza redirect 303 a /login si no hay user. */
export function requireUser(locals: App.Locals): AppUser {
  if (!locals.user) {
    redirect(303, '/login');
  }
  return locals.user;
}

/** admin o tecnico. */
export function requireStaff(locals: App.Locals): AppUser {
  const user = requireUser(locals);
  if (user.role !== 'admin' && user.role !== 'tecnico') {
    throw new AuthError('FORBIDDEN', 'No tenés permiso para esta acción');
  }
  return user;
}

/** Solo admin; 403 para tecnico. */
export function requireAdmin(locals: App.Locals): AppUser {
  const user = requireUser(locals);
  if (user.role !== 'admin') {
    throw new AuthError('FORBIDDEN', 'No tenés permiso para esta acción');
  }
  return user;
}

/** Lista de acciones admin-only para tests y documentación. */
export const ADMIN_ONLY_ACTIONS = [
  'reopen_audit',
  'manage_users',
  'edit_templates'
] as const;

export type AdminOnlyAction = (typeof ADMIN_ONLY_ACTIONS)[number];

export function assertAdminOnly(locals: App.Locals, _action: AdminOnlyAction): void {
  requireAdmin(locals);
}
