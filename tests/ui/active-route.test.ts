import { describe, expect, it } from 'vitest';
import { isNavItemActive } from '$lib/nav/active-route';

describe('isNavItemActive', () => {
  it('tablero activo en / y /tablero', () => {
    expect(isNavItemActive('/', '/tablero')).toBe(true);
    expect(isNavItemActive('/tablero', '/tablero')).toBe(true);
    expect(isNavItemActive('/crm', '/tablero')).toBe(false);
  });

  it('solo el href exacto o subruta queda activo', () => {
    expect(isNavItemActive('/usuarios', '/usuarios')).toBe(true);
    expect(isNavItemActive('/usuarios', '/crm')).toBe(false);
    expect(isNavItemActive('/crm', '/usuarios')).toBe(false);
    expect(isNavItemActive('/crm/abc', '/crm')).toBe(true);
  });
});
