# Requirements — 36_bottom_nav_mobile

> En mobile, la navegación principal de auditapp está en el header como
> un scroll horizontal. Está en la parte superior de la pantalla, difícil
> de alcanzar con el pulgar, especialmente en iPhones grandes. Los técnicos
> usan la app en campo con una sola mano. Esta feature agrega una barra de
> navegación inferior fija en breakpoints mobile (`<md`), siguiendo el patrón
> de apps nativas (iOS Tab Bar, Android Bottom Navigation).

## Contexto verificado

- **Layout actual:** `SysShell.svelte` variant="light" tiene el nav en el header
  `sticky top-0`. El nav se renderiza dos veces: `.hidden.md:block` (desktop) y
  `-mx-4 mt-2 overflow-x-auto px-4 pb-0.5 md:hidden` (mobile, scroll horizontal).
- **Items de nav:** Tablero, CRM, Nueva auditoría; y para admin: Mercado, Usuarios,
  Plantillas.
- **Estado activo:** ya implementado en `(app)/+layout.svelte` con la función
  `navClass()` usando `$page.url.pathname`.
- **Safe area (notch/home indicator):** el `viewport-fit=cover` ya está en `app.html`
  (feature PWA). La barra inferior DEBE respetar `env(safe-area-inset-bottom)`.
- **InstallPWA.svelte:** también usa la zona inferior con `fixed bottom-0`. La
  bottom nav y el banner de instalación deben coexistir sin superponerse.

## Requerimientos

### R1 — Bottom nav bar en mobile

CUANDO el viewport es `< md` (breakpoint Tailwind, ~768px), el sistema DEBE
mostrar una barra de navegación inferior fija con los items principales:
**Tablero, CRM, Nueva auditoría**.

Los items de admin (Mercado, Usuarios, Plantillas) PUEDEN estar en la bottom
nav solo si el rol es admin; de lo contrario se omiten (respetar la misma
lógica `isAdmin` del layout).

### R2 — Íconos en la bottom nav

Cada item de la bottom nav DEBE mostrar un ícono SVG reconocible junto al label,
para cumplir el patrón de navegación nativa:
- Tablero → ícono de grilla/home
- CRM → ícono de personas/empresa
- Nueva auditoría → ícono de "+" o "clip + lápiz"
- Mercado → ícono de gráfico de barras (solo admin)
- Usuarios → ícono de grupo (solo admin)
- Plantillas → ícono de documento (solo admin)

### R3 — Estado activo visual

El item activo DEBE destacarse visualmente de forma consistente con el nav del
header (misma paleta: `text-sys-electrico` para el activo, `text-sys-medio`
para los inactivos).

### R4 — Ocultar nav horizontal del header en mobile

CUANDO se muestra la bottom nav (`< md`), el nav horizontal en el header (hoy
`-mx-4 mt-2 overflow-x-auto md:hidden`) DEBE ocultarse para evitar duplicación.

### R5 — Safe area y coexistencia con InstallPWA

La bottom nav DEBE respetar `padding-bottom: env(safe-area-inset-bottom)` para
evitar que quede tapada por el home indicator de iOS.

`InstallPWA.svelte` ya usa `bottom-0` con `padding-bottom: env(safe-area-inset-bottom)`.
CUANDO ambos están visibles, el banner de instalación DEBE mostrarse encima de la
bottom nav (mayor `z-index`) o desplazarse para no superponerse. La bottom nav
DEBE dejar suficiente `padding-bottom` en el `<main>` del SysShell para que
el contenido no quede tapado.

### R6 — Desktop sin cambios

En breakpoints `>= md`, el header y el nav horizontal existen como hoy. La
bottom nav no se renderiza.

### R7 — Implementación en SysShell o como componente separado

La bottom nav PUEDE implementarse como:
- Un snippet `bottomNav` en `SysShell.svelte`, renderizado solo cuando `!isDark` y visible `< md`.
- Un componente separado `BottomNav.svelte` agregado al layout `(app)/+layout.svelte`.

La decisión se toma en diseño según lo que resulte más limpio.

## Trazabilidad requerida

| R | Test mínimo |
|---|---|
| R1 | En viewport mobile, existe un `nav` con `position: fixed; bottom: 0` con los 3 items principales |
| R2 | Cada item tiene un elemento `<svg>` o imagen de ícono |
| R3 | El item activo tiene clase/style que lo diferencia de los inactivos |
| R4 | En viewport mobile, el nav horizontal del header no es visible |
| R5 | El `padding-bottom` de la bottom nav incluye `env(safe-area-inset-bottom)` |
| R6 | En viewport desktop, la bottom nav no se renderiza (`hidden` o no está en el DOM) |
