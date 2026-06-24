import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('brand shell', () => {
  it('SysShell exports dark and light variants with required structural classes', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/components/brand/SysShell.svelte'),
      'utf8'
    );

    expect(source).toContain("variant?: Variant");
    expect(source).toContain('sys-shell-dark');
    expect(source).toContain('sys-shell-light');
    expect(source).toContain('bg-sys-offwhite');
    expect(source).toContain('--sys-bg-gradient');
    expect(source).toContain('--sys-top-bar');
    expect(source).toContain('/brand/sys-horizontal-w.png');
    expect(source).toContain('/brand/sys-horizontal-b.png');
    expect(source).toContain('data-sys-shell-header');
  });

  it('login page uses SysShell dark', () => {
    const login = readFileSync(join(process.cwd(), 'src/routes/login/+page.svelte'), 'utf8');
    expect(login).toContain('SysShell');
    expect(login).toContain('variant="dark"');
  });

  it('app layout composes #42 shell (HeaderMobile + Sidebar + BottomNav)', () => {
    const layout = readFileSync(join(process.cwd(), 'src/routes/(app)/+layout.svelte'), 'utf8');
    expect(layout).toContain('HeaderMobile');
    expect(layout).toContain('Sidebar');
    expect(layout).toContain('BottomNav');
    expect(layout).toContain('lg:pl-[220px]');
    expect(layout).toContain('bg-[--sys-bg-app]');
    expect(layout).not.toContain('SysShell');
  });

  it('cierre layout exists when route file exists', () => {
    const cierreLayout = join(
      process.cwd(),
      'src/routes/(app)/auditorias/[id]/cierre/+layout.svelte'
    );
    expect(existsSync(cierreLayout)).toBe(true);
    const appLayout = readFileSync(
      join(process.cwd(), 'src/routes/(app)/+layout.svelte'),
      'utf8'
    );
    expect(appLayout).toContain('HeaderMobile');
    expect(appLayout).toContain('Sidebar');
  });
});
