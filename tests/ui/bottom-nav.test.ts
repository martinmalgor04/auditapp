import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BottomNav component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/ui/BottomNav.svelte'),
    'utf8'
  );

  it('ítem activo usa color text-[--sys-primary]', () => {
    expect(source).toContain('text-[--sys-primary]');
  });

  it('ítem inactivo usa text-white/35', () => {
    expect(source).toContain('text-white/35');
  });

  it('FAB existe con bg-[--sys-primary] y rounded-full', () => {
    expect(source).toContain('bg-[--sys-primary]');
    expect(source).toContain('rounded-full');
  });

  it('FAB apunta a /auditorias/new', () => {
    expect(source).toContain('/auditorias/new');
  });

  it('tiene los 6 ítems de navegación', () => {
    expect(source).toContain("href: '/tablero'");
    expect(source).toContain("href: '/crm'");
    expect(source).toContain("href: '/mercado'");
    expect(source).toContain("href: '/usuarios'");
    expect(source).toContain("href: '/plantillas'");
  });

  it('deriva ruta activa de $page store', () => {
    expect(source).toContain("from '$app/stores'");
    expect(source).toContain('$page.url.pathname');
  });
});
