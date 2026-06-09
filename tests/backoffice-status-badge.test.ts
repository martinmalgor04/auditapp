import { describe, expect, it } from 'vitest';
import { AUDIT_STATUSES } from '../src/lib/server/db/audit-status';
import {
  getAllStatusVariants,
  getStatusBadgeClasses
} from '../src/lib/server/backoffice/status-colors';

describe('backoffice status badge', () => {
  it('maps each audit status to a distinct badge variant', () => {
    const variants = getAllStatusVariants();
    const classSets = new Set<string>();

    for (const status of AUDIT_STATUSES) {
      const classes = getStatusBadgeClasses(status);
      expect(classes.length).toBeGreaterThan(0);
      expect(variants[status]).toBeDefined();
      classSets.add(classes);
    }

    expect(classSets.size).toBe(AUDIT_STATUSES.length);
  });
});
