import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BottomNav component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/ui/BottomNav.svelte'),
    'utf8'
  );

  it('ítem activo usa color text-sys-primary', () => {
    expect(source).toContain('text-sys-primary');
  });

  it('ítem inactivo usa text-white/35', () => {
    expect(source).toContain('text-white/35');
  });

  it('respeta safe-area-inset-bottom en el contenedor fijo', () => {
    expect(source).toContain('env(safe-area-inset-bottom');
  });

  it('tiene los 5 ítems de navegación alineados con Sidebar', () => {
    expect(source).toContain("href: '/tablero'");
    expect(source).toContain("href: '/crm'");
    expect(source).toContain("href: '/mercado'");
    expect(source).toContain("href: '/usuarios'");
    expect(source).toContain("href: '/plantillas'");
  });

  it('no incluye FAB central duplicado', () => {
    expect(source).not.toContain('isFab');
    expect(source).not.toContain('/auditorias/new');
  });

  it('deriva ruta activa de $page store', () => {
    expect(source).toContain("from '$app/stores'");
    expect(source).toContain('$page.url.pathname');
  });
});
