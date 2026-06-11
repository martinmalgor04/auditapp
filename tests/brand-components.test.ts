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
    expect(source).toContain('hover:brightness-95');
    expect(source).toContain('min-h-[var(--sys-touch-min)]');
    expect(source).toContain('rounded-sys');
  });

  it('SysInput applies electric focus ring styles', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/components/brand/SysInput.svelte'),
      'utf8'
    );
    const appCss = readFileSync(join(process.cwd(), 'src/app.css'), 'utf8');
    const brandCss = readFileSync(join(process.cwd(), 'src/lib/styles/brand.css'), 'utf8');

    // El componente delega estilos a la clase compartida .sys-field (app.css)
    expect(source).toContain('sys-field');
    expect(appCss).toMatch(/\.sys-field:focus\s*\{[^}]*var\(--sys-azul-electrico\)/);
    expect(brandCss).toMatch(/--sys-shadow-focus:[^;]*rgba\(33, 150, 243/);
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
