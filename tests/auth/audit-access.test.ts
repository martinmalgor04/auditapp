import { describe, expect, it } from 'vitest';
import {
  auditMatchesUserScope,
  userAuditTypesScope,
  userCanUseAuditTypes
} from '../../src/lib/server/auth/audit-access';
import type { AppUser } from '../../src/lib/server/auth/types';

function user(partial: Partial<AppUser> & Pick<AppUser, 'role'>): AppUser {
  return {
    id: 'u1',
    email: 't@example.com',
    name: 'T',
    active: true,
    auditTypes: null,
    ...partial
  };
}

describe('audit access by user specialties', () => {
  it('admin has no scope restriction', () => {
    const admin = user({ role: 'admin' });
    expect(userAuditTypesScope(admin)).toBeNull();
    expect(auditMatchesUserScope(['erp-tango'], admin)).toBe(true);
  });

  it('tecnico without specialties sees all types', () => {
    const tech = user({ role: 'tecnico', auditTypes: null });
    expect(auditMatchesUserScope(['it'], tech)).toBe(true);
    expect(auditMatchesUserScope(['erp-tango'], tech)).toBe(true);
  });

  it('tecnico IT only matches overlapping audits', () => {
    const tech = user({ role: 'tecnico', auditTypes: ['it'] });
    expect(auditMatchesUserScope(['it'], tech)).toBe(true);
    expect(auditMatchesUserScope(['it', 'erp-tango'], tech)).toBe(true);
    expect(auditMatchesUserScope(['erp-tango'], tech)).toBe(false);
  });

  it('create audit validates all selected types are allowed', () => {
    const tech = user({ role: 'tecnico', auditTypes: ['erp-tango', 'erp-estandar'] });
    expect(userCanUseAuditTypes(['erp-tango'], tech)).toBe(true);
    expect(userCanUseAuditTypes(['it', 'erp-tango'], tech)).toBe(false);
  });
});
