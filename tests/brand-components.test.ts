import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_STATUSES } from '../src/lib/server/db/audit-status';
import {
  getAllAuditStatusBadgeVariants,
  getAuditStatusBadgeClasses,
  getSysBadgeClasses
} from '../src/lib/brand/badge-variants';

describe('brand components', () => {
  it('SysButton primary variant classes use sys-azul-electrico token', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/components/brand/SysButton.svelte'),
      'utf8'
    );

    expect(source).toContain("primary: 'bg-sys-electrico");
    expect(source).toContain('#1976D2');
    expect(source).toContain('min-h-[var(--sys-touch-min)]');
    expect(source).toContain('rounded-sys');
  });

  it('SysInput applies electric focus ring styles', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/components/brand/SysInput.svelte'),
      'utf8'
    );

    expect(source).toContain('--sys-azul-electrico');
    expect(source).toContain('rgba(33, 150, 243, 0.15)');
  });

  it('SysBadge variants map to semaphore tokens', () => {
    expect(getSysBadgeClasses('green')).toContain('sys-verde');
    expect(getSysBadgeClasses('red')).toContain('sys-rojo');
    expect(getSysBadgeClasses('amber')).toContain('sys-naranja');
    expect(getSysBadgeClasses('neutral')).toContain('sys-neutro');

    for (const status of AUDIT_STATUSES) {
      const classes = getAuditStatusBadgeClasses(status);
      expect(classes.length).toBeGreaterThan(0);
      expect(getAllAuditStatusBadgeVariants()[status]).toBeDefined();
    }
  });
});
