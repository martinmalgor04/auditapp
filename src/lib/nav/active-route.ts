/** Marca activo un ítem del shell según pathname actual (SvelteKit). */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/tablero') {
    return pathname === '/' || pathname === '/tablero' || pathname.startsWith('/tablero/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
