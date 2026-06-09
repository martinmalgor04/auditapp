import { describe, expect, it } from 'vitest';
import { AUDIT_STATUSES } from '../src/lib/server/db/audit-status';
import {
  getAllAuditStatusBadgeVariants,
  getAuditStatusBadgeClasses,
  getSysBadgeClasses
} from '../src/lib/brand/badge-variants';

describe('backoffice status badge', () => {
  it('maps each audit status to a badge variant from unified brand module', () => {
    const variants = getAllAuditStatusBadgeVariants();

    for (const status of AUDIT_STATUSES) {
      const classes = getAuditStatusBadgeClasses(status);
      expect(classes.length).toBeGreaterThan(0);
      expect(variants[status]).toBeDefined();
      expect(getSysBadgeClasses(variants[status])).toContain('rounded-full');
    }
  });

  it('status-colors re-exports brand badge helpers', async () => {
    const mod = await import('../src/lib/backoffice/status-colors');
    expect(mod.getStatusBadgeClasses).toBe(getAuditStatusBadgeClasses);
    expect(mod.getAllStatusVariants).toBe(getAllAuditStatusBadgeVariants);
  });
});
