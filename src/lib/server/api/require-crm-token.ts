import { timingSafeEqual } from 'node:crypto';
import { apiError } from './envelope';

function getConfiguredToken(): string | undefined {
  const raw = process.env.CRM_API_TOKEN?.trim();
  if (!raw || raw.includes('<')) {
    return undefined;
  }
  return raw;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Valida Bearer token para POST /api/crm/leads/batch. */
export function requireCrmToken(request: Request): Response | null {
  const configured = getConfiguredToken();
  if (!configured) {
    return apiError('No autorizado', 401);
  }

  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return apiError('No autorizado', 401);
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token || !safeCompare(token, configured)) {
    return apiError('No autorizado', 401);
  }

  return null;
}
