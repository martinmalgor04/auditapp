import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sidebar component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/ui/Sidebar.svelte'),
    'utf8'
  );

  it('tiene los 5 nav items definidos', () => {
    expect(source).toContain("href: '/tablero'");
    expect(source).toContain("href: '/crm'");
    expect(source).toContain("href: '/mercado'");
    expect(source).toContain("href: '/usuarios'");
    expect(source).toContain("href: '/plantillas'");
  });

  it('marca activo el ítem cuya href coincide con pathname usando bg-sys-primary', () => {
    expect(source).toContain('isNavItemActive(pathname, item.href)');
    expect(source).toContain('bg-sys-primary text-white');
  });

  it('ítem inactivo usa clase hover:bg-white/5', () => {
    expect(source).toContain('hover:bg-white/5');
  });

  it('importa page de $app/state', () => {
    expect(source).toContain("from '$app/state'");
    expect(source).toContain('page.url.pathname');
  });

  it('avatar tiene menú de usuario con cerrar sesión', () => {
    expect(source).toContain('UserMenu');
    expect(source).toContain('variant="sidebar"');
  });

  it('tiene fondo bg-sys-navy', () => {
    expect(source).toContain('bg-sys-navy');
  });

  it('reactividad: pathname $derived desde page state', () => {
    expect(source).toContain('$derived(page.url.pathname)');
    expect(source).toContain('isNavItemActive');
  });

  it('itera navItems con each', () => {
    expect(source).toContain('{#each navItems as item}');
  });
});
