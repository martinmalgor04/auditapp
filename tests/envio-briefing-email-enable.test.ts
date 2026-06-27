/**
 * #52 T7 — R2: matriz de canSendBriefingEmail (token vigente + email → habilitado; etc.)
 */
import { describe, expect, it } from 'vitest';
import { canShowBriefingLink } from '../src/lib/server/backoffice/briefing-link';
import type { AuditStatus } from '../src/lib/server/db/audit-status';

/**
 * Reproduce la lógica de canSendBriefingEmail del page.server.ts:
 *   canShowBriefingLink(status, publicToken) && !!contactEmail
 */
function canSendBriefingEmail(
  status: AuditStatus,
  publicToken: string | null,
  contactEmail: string | null
): boolean {
  return canShowBriefingLink(status, publicToken) && !!contactEmail;
}

describe('canSendBriefingEmail (#52 R2)', () => {
  const TOKEN = 'abc123token';

  // Casos habilitados
  it('briefing_enviado + token + email → true', () => {
    expect(canSendBriefingEmail('briefing_enviado', TOKEN, 'cliente@empresa.com')).toBe(true);
  });

  it('briefing_completo + token + email → true', () => {
    expect(canSendBriefingEmail('briefing_completo', TOKEN, 'cliente@empresa.com')).toBe(true);
  });

  // Sin token → false
  it('briefing_enviado + sin token + email → false', () => {
    expect(canSendBriefingEmail('briefing_enviado', null, 'cliente@empresa.com')).toBe(false);
  });

  it('briefing_completo + sin token + email → false', () => {
    expect(canSendBriefingEmail('briefing_completo', null, 'cliente@empresa.com')).toBe(false);
  });

  // Estado incorrecto → false
  it('borrador + token + email → false', () => {
    expect(canSendBriefingEmail('borrador', TOKEN, 'cliente@empresa.com')).toBe(false);
  });

  it('cerrada + token + email → false', () => {
    expect(canSendBriefingEmail('cerrada', TOKEN, 'cliente@empresa.com')).toBe(false);
  });

  it('en_relevamiento + token + email → false', () => {
    expect(canSendBriefingEmail('en_relevamiento', TOKEN, 'cliente@empresa.com')).toBe(false);
  });

  it('en_cierre + token + email → false', () => {
    expect(canSendBriefingEmail('en_cierre', TOKEN, 'cliente@empresa.com')).toBe(false);
  });

  // Sin email → false
  it('briefing_enviado + token + sin email → false', () => {
    expect(canSendBriefingEmail('briefing_enviado', TOKEN, null)).toBe(false);
  });

  it('briefing_enviado + token + email vacío → false', () => {
    expect(canSendBriefingEmail('briefing_enviado', TOKEN, '')).toBe(false);
  });

  it('briefing_completo + token + sin email → false', () => {
    expect(canSendBriefingEmail('briefing_completo', TOKEN, null)).toBe(false);
  });
});
