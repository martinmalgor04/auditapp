import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('UserMenu component', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/ui/UserMenu.svelte'),
    'utf8'
  );

  it('envía POST a /logout', () => {
    expect(source).toContain('method="POST"');
    expect(source).toContain('action="/logout"');
  });

  it('muestra Cerrar sesión', () => {
    expect(source).toContain('Cerrar sesión');
  });

  it('variant header usa botón con aria-expanded', () => {
    expect(source).toContain('aria-expanded={open}');
    expect(source).toContain("variant === 'header'");
  });

  it('muestra inicial del nombre en avatar', () => {
    expect(source).toContain('user.name.charAt(0).toUpperCase()');
  });
});
