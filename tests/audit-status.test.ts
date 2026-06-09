import { describe, expect, it } from 'vitest';
import {
  AUDIT_STATUSES,
  isValidAuditStatus,
  isValidAuditStatusTransition
} from '../src/lib/server/db/audit-status';

describe('audit status machine', () => {
  it('accepts all valid statuses', () => {
    for (const status of AUDIT_STATUSES) {
      expect(isValidAuditStatus(status)).toBe(true);
    }
  });

  it('rejects invalid status value', () => {
    expect(isValidAuditStatus('abierta')).toBe(false);
    expect(isValidAuditStatus('')).toBe(false);
  });

  it('allows documented transitions and rejects invalid jumps', () => {
    expect(isValidAuditStatusTransition('borrador', 'briefing_enviado')).toBe(true);
    expect(isValidAuditStatusTransition('borrador', 'en_relevamiento')).toBe(true);
    expect(isValidAuditStatusTransition('briefing_enviado', 'briefing_completo')).toBe(true);
    expect(isValidAuditStatusTransition('briefing_completo', 'en_relevamiento')).toBe(true);
    expect(isValidAuditStatusTransition('en_relevamiento', 'en_cierre')).toBe(true);
    expect(isValidAuditStatusTransition('en_cierre', 'cerrada')).toBe(true);

    expect(isValidAuditStatusTransition('cerrada', 'en_cierre', { allowAdminReopen: true })).toBe(
      true
    );
    expect(isValidAuditStatusTransition('cerrada', 'en_cierre')).toBe(false);

    expect(isValidAuditStatusTransition('borrador', 'cerrada')).toBe(false);
    expect(isValidAuditStatusTransition('briefing_enviado', 'en_cierre')).toBe(false);
    expect(isValidAuditStatusTransition('cerrada', 'borrador')).toBe(false);
  });
});
