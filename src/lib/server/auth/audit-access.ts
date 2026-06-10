import type { AuditType } from '$lib/audit-types';
import type { AppUser } from './types';

/** `null` = sin restricción (admin o técnico sin especialidad configurada). */
export function userAuditTypesScope(user: AppUser): AuditType[] | null {
  if (user.role === 'admin') {
    return null;
  }
  if (!user.auditTypes || user.auditTypes.length === 0) {
    return null;
  }
  return user.auditTypes;
}

export function auditMatchesUserScope(auditTypes: string[], user: AppUser): boolean {
  const scope = userAuditTypesScope(user);
  if (!scope) {
    return true;
  }
  return auditTypes.some((type) => scope.includes(type as AuditType));
}

export function userCanUseAuditTypes(types: AuditType[], user: AppUser): boolean {
  const scope = userAuditTypesScope(user);
  if (!scope) {
    return true;
  }
  return types.length > 0 && types.every((type) => scope.includes(type));
}

export function allowedAuditTypesForUser(user: AppUser): AuditType[] | null {
  return userAuditTypesScope(user);
}
