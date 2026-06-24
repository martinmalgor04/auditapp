# Requirements — #42 42_rediseno_ui

> Rediseño visual integral de auditapp: design tokens unificados, layout shell responsive
> (sidebar web + bottom nav mobile), Tablero, Relevamiento y Mercado con nuevas pantallas
> pixel-perfect basadas en el archivo de referencia `AuditApp Rediseño.dc.html`.
> No cambia el modelo de datos, el scoring ni las rutas API existentes.
> Depende de: `04_backoffice` (#4), `07_form_tecnico` (#7), `18_dashboard_mercado` (#18),
> `36_bottom_nav_mobile` (#36), `35_paleta_consistente` (#35).

---

## R1 — Design tokens: fuente Montserrat

El sistema DEBE cargar la fuente Montserrat (pesos 300/400/500/600/700/800) desde Google Fonts
y aplicarla como `font-family` base en `src/lib/styles/brand.css` mediante la variable
`--sys-font-base: 'Montserrat', sans-serif`.

**Verificación:** `tests/ui/tokens.test.ts` — `brand.css` exporta `--sys-font-base` con valor que
contiene `Montserrat`; `e2e/ui-tokens.spec.ts` — el `<body>` de cualquier ruta autenticada computa
`font-family` que incluye `Montserrat`.

---

## R2 — Design tokens: paleta completa en brand.css

El sistema DEBE definir en `src/lib/styles/brand.css` las siguientes variables CSS (actualizando
o añadiendo sobre las existentes):

| Variable | Valor |
|---|---|
| `--sys-primary` | `#2196F3` |
| `--sys-navy` | `#0A1929` |
| `--sys-navy-mid` | `#0E2540` |
| `--sys-bg-app` | `#ECEEF2` |
| `--sys-surface` | `#ffffff` |
| `--sys-border` | `#E4E7ED` |
| `--sys-text-primary` | `#0A1929` |
| `--sys-text-secondary` | `#374151` |
| `--sys-text-muted` | `#6B7280` |
| `--sys-text-faint` | `#9CA3AF` |
| `--sys-text-navy-muted` | `#A2C6D4` |
| `--sys-status-green` | `#10B981` |
| `--sys-status-amber` | `#F59E0B` |
| `--sys-status-red` | `#EF4444` |
| `--sys-status-blue-bg` | `#DBEAFE` |
| `--sys-status-blue-text` | `#1E40AF` |

**Verificación:** `tests/ui/tokens.test.ts` — parsear `brand.css` y verificar que cada variable
está definida con el valor exacto listado.

---

## R3 — Design tokens: utilidades Tailwind extendidas

El sistema DEBE extender `tailwind.config` para exponer las variables de R2 como clases utilitarias
(`bg-sys-navy`, `text-sys-primary`, `border-sys-border`, etc.) sin eliminar las clases sys-*
existentes ya usadas en el codebase.

**Verificación:** `tests/ui/tokens.test.ts` — `tailwind.config` exporta las claves extendidas
correspondientes a las variables de R2; `pnpm run check` pasa sin errores TypeScript.

---

## R4 — Layout shell: barra de progreso global

El sistema DEBE mostrar una barra de progreso azul (`--sys-primary`) de 6px de alto fija en el
borde superior de la ventana durante la navegación SvelteKit (usando el store `navigating`), visible
en todas las rutas autenticadas y en `/briefing/[token]`.

**Verificación:** `tests/ui/layout.test.ts` — el componente `ProgressBar.svelte` es reactivo al
store `navigating`; `e2e/ui-layout.spec.ts` — al navegar entre rutas aparece y desaparece la barra.

---

## R5 — Layout shell: header mobile navy gradient

El sistema DEBE renderizar en viewports `< lg` (1024px) un header fijo con:
- fondo `linear-gradient(160deg, var(--sys-navy) 0%, var(--sys-navy-mid) 100%)`
- logotipo SyS (SVG inline o `<img>` desde CDN R2) y nombre "servicios & sistemas" en `--sys-text-navy-muted`
- avatar circular del usuario autenticado (inicial del nombre, fondo `--sys-primary`)
- título de la vista actual en 24px/800/blanco
- subtítulo contextual (p. ej. "5 auditorías activas") en `--sys-text-navy-muted`
- botón "+ Nueva" (`--sys-primary`, border-radius 8px) cuando la vista lo requiera

CUANDO el viewport es `>= lg`, el sistema NO DEBE renderizar el header mobile.

**Verificación:** `tests/ui/header-mobile.test.ts` — componente `HeaderMobile.svelte` recibe
props `title`, `subtitle`, `user` y `showNew`; renderiza el gradiente y el avatar con la inicial;
a viewport >= lg el componente no se monta (prop o clase `lg:hidden`).

---

## R6 — Layout shell: sidebar web 220px

El sistema DEBE renderizar en viewports `>= lg` una barra lateral izquierda fija de 220px con:
- fondo `--sys-navy`
- logotipo SyS y nombre empresa en la cabecera
- ítems de navegación vertical (Tablero, CRM, Mercado, Usuarios, Plantillas); ítem activo con
  fondo `--sys-primary` sólido y texto blanco; ítem inactivo con texto `--sys-text-navy-muted`
- avatar del usuario autenticado al pie con borde top `rgba(255,255,255,.08)`

CUANDO el viewport es `< lg`, el sistema NO DEBE renderizar el sidebar.

**Verificación:** `tests/ui/sidebar.test.ts` — componente `Sidebar.svelte` marca activo el ítem
cuya `href` coincide con la ruta actual; `e2e/ui-layout.spec.ts` — a viewport 1100px existe el
sidebar con ancho 220px; a viewport 390px no existe.

---

## R7 — Layout shell: bottom nav mobile unificado

El sistema DEBE reemplazar el bottom nav existente (`36_bottom_nav_mobile`) por un componente
`BottomNav.svelte` con:
- altura 64px, fondo `--sys-navy`
- 6 ítems: Tablero, CRM, FAB central (círculo 34px `--sys-primary`), Mercado, Usuarios, Plantillas
- FAB con sombra y `margin-bottom: -2px`
- ítem activo: ícono + texto en `--sys-primary`; inactivo: opacidad 0.35
- padding-bottom `env(safe-area-inset-bottom)`

CUANDO el viewport es `>= lg`, el sistema NO DEBE renderizar el bottom nav.

**Verificación:** `tests/ui/bottom-nav.test.ts` — el ítem activo tiene clase/estilo de color
`--sys-primary`; el FAB existe con diámetro 34px; `e2e/ui-layout.spec.ts` — a viewport 390px
existe el bottom nav; a viewport 1100px no existe.

---

## R8 — Layout shell: integración en +layout.svelte

CUANDO se monta el layout `src/routes/(app)/+layout.svelte`, el sistema DEBE componer:
- `HeaderMobile` (visible `< lg`)
- `Sidebar` (visible `>= lg`)
- `ProgressBar` (siempre)
- `BottomNav` (visible `< lg`)
- `<main>` con `padding-bottom` suficiente para no quedar tapado por `BottomNav`
- `<main>` con `padding-left: 220px` en `>= lg` para acomodar el sidebar

**Verificación:** `e2e/ui-layout.spec.ts` — el `<main>` a mobile no queda solapado por el bottom nav
(bounding-box del último elemento de contenido no intersecta con el nav);
a desktop el contenido comienza después de los 220px del sidebar.

---

## R9 — Tablero: fondo y chip filters

CUANDO la vista `/` (Tablero) carga, el sistema DEBE renderizar:
- fondo `--sys-bg-app` en el área de contenido
- una fila de chips de filtro (fondo blanco, `border-bottom: 1px solid --sys-border`) con labels
  "Todos", "IT", "ERP", "En cierre", "Cerrada"
- chip activo: fondo `--sys-primary`, texto blanco, border-radius 12px
- chip inactivo: fondo `--sys-bg-app`, borde `--sys-border`, border-radius 12px

**Verificación:** `tests/ui/tablero.test.ts` — el componente `ChipFilters.svelte` cambia el chip
activo al hacer clic; `e2e/tablero.spec.ts` — seleccionar "IT" filtra la lista a auditorías de
tipo IT.

---

## R10 — Tablero mobile: audit cards

CUANDO el viewport es `< lg`, el sistema DEBE renderizar la lista de auditorías como cards
(`AuditCard.svelte`) con:
- fondo blanco, border-radius 12px, sombra `0 1px 4px rgba(0,0,0,.08)`, gap 8px, padding 12px
  en el contenedor
- fila superior: nombre del cliente (11px/700/`--sys-text-primary`, truncado con ellipsis),
  `ref_code` (10px/600/`--sys-primary`), badge de estado
- chips de tipo (IT=azul claro, ERP=verde claro) y segmento (gris)
- barra de progreso 5px: fondo `--sys-border`, color según estado de la auditoría
- fila técnico asignado + fecha programada de visita
- botones de acción "Ver", "Relevamiento", "Cierre": "Ver" y "Cierre" outline con borde
  `--sys-border`; "Relevamiento" sólido `--sys-primary`

**Verificación:** `tests/ui/audit-card.test.ts` — con props de auditoría, el componente renderiza
`ref_code`, badge de estado y los tres botones; `e2e/tablero.spec.ts` — a viewport 390px existen
cards; click en "Relevamiento" navega a la ruta del form.

---

## R11 — Tablero web: tabla de auditorías

CUANDO el viewport es `>= lg`, el sistema DEBE renderizar la lista de auditorías como tabla con:
- fondo blanco, border-radius 10px, sombra
- cabecera: fondo `#F7F9FB`, texto 9px/700/uppercase/`--sys-text-faint`
- columnas: `2.2fr 88px 108px 145px 108px 62px 76px 165px` (Cliente, Tipo, Estado, Avance,
  Técnico, Visita, Actualiz., Acciones)
- columna Avance: barra + porcentaje alineados en flex
- columna Acciones: botones "Ver" / "Relevamiento" / "Cierre" inline
- borde bottom `#F0F2F5` entre filas

**Verificación:** `tests/ui/tablero.test.ts` — la tabla renderiza headers en el orden correcto;
`e2e/tablero.spec.ts` — a viewport 1100px existe el elemento `<table>` o `role=table`; las
columnas tienen el ancho relativo correcto.

---

## R12 — Tablero web: barra superior y filtros

CUANDO el viewport es `>= lg`, el sistema DEBE renderizar encima de la tabla:
- top bar blanco con título "Tablero", subtítulo, y botón "+ Nueva auditoría"
- filter bar blanco: label "Filtrar:", pills de estado (igual que chips de R9), campo de búsqueda
  con ícono lupa, fondo `--sys-bg-app`, borde `--sys-border`

**Verificación:** `tests/ui/tablero.test.ts` — el componente `TableroHeader.svelte` recibe props
`auditCount` y renderiza el subtítulo; el input de búsqueda tiene `type=search`;
`e2e/tablero.spec.ts` — tipear en el input filtra la lista.

---

## R13 — Status badge unificado

El sistema DEBE exponer un componente `StatusBadge.svelte` que reciba `status: AuditStatus` y
renderice el badge con colores definidos:
- `cerrada`: fondo `rgba(16,185,129,.12)`, texto `--sys-status-green`
- `en_cierre`: fondo `rgba(245,158,11,.12)`, texto `--sys-status-amber`
- `borrador` / estados iniciales: fondo `--sys-status-blue-bg`, texto `--sys-status-blue-text`
- score bajo (prop adicional `scoreLow: boolean`): fondo `rgba(239,68,68,.12)`, texto `--sys-status-red`

El componente DEBE ser reutilizable en cards (R10) y tabla (R11) sin duplicación de lógica de color.

**Verificación:** `tests/ui/status-badge.test.ts` — cada valor de `status` produce el color
correcto; prop `scoreLow=true` produce el color rojo independientemente del status.

---

## R14 — Relevamiento: header dinámico

CUANDO la ruta del form técnico (`/auditorias/[id]/form`) está activa, el sistema DEBE renderizar
en mobile un header navy con:
- flecha de retorno + nombre del cliente en `--sys-text-navy-muted`
- badge "NN% · N pendientes" calculado del estado real del form
- título de la sección activa
- barra de progreso 4px debajo del header (fondo `--sys-border`, fill `--sys-primary`)

**Verificación:** `tests/ui/form-header.test.ts` — `FormHeader.svelte` recibe `progress`, `pending`
y `sectionTitle` y renderiza el badge y la barra; el porcentaje del badge coincide con `progress`.

---

## R15 — Relevamiento: chips de sección con estado

CUANDO el form técnico está activo, el sistema DEBE renderizar una fila horizontal de chips
(scroll horizontal) con el código de cada sección (CAB, A1, A2, …) e indicador de completado
(checkmark ✓) en las secciones donde `done === total`.

CUANDO el usuario toca un chip, el sistema DEBE navegar a esa sección sin recargar la página.

**Verificación:** `tests/ui/section-chips.test.ts` — con sección completa el chip muestra el
checkmark; con sección incompleta no; click dispara la navegación; `e2e/form.spec.ts` — tap en chip
"A1" desplaza la vista a la sección A1.

---

## R16 — Relevamiento: question cards con Sí/No/Parcial

El sistema DEBE renderizar cada ítem del form técnico de tipo booleano o tri-estado como una
`QuestionCard.svelte` con:
- badge "Observación" (gris, arriba) cuando el ítem tiene observación cargada
- badge de relevancia opcional (azul para alta, ámbar para media)
- texto de la pregunta en 13px/600/`--sys-text-primary`
- botones Sí/No/Parcial:
  - inactivo: borde `--sys-border`, fondo blanco
  - Sí activo: fondo `--sys-status-green`, texto blanco
  - No activo: fondo `--sys-status-red`, texto blanco
  - Parcial activo: borde `--sys-primary`, texto `--sys-primary`, fondo blanco
- link "+ Agregar observación" en `--sys-primary` al pie de la card

SI el campo es de tipo distinto a booleano/tri-estado (`field_type` no es `bool` ni `tri`),
ENTONCES el sistema NO DEBE usar `QuestionCard` y DEBE usar los componentes de campo existentes.

**Verificación:** `tests/ui/question-card.test.ts` — seleccionar "Sí" aplica el estilo activo verde
y deselecciona los otros; seleccionar "No" aplica rojo; "Parcial" aplica el estilo outline azul;
el link de observación está presente; `e2e/form.spec.ts` — tap en "Sí" persiste la respuesta.

---

## R17 — Relevamiento: botón "Próximo pendiente" sticky

CUANDO existen ítems sin responder en el form técnico, el sistema DEBE mostrar un botón "Próximo
pendiente →" sticky al pie del viewport, con fondo `--sys-navy`, texto blanco.

CUANDO no existen ítems pendientes, el sistema NO DEBE mostrar el botón.

**Verificación:** `tests/ui/form-next.test.ts` — con pendientes el botón existe y está fijo;
sin pendientes no existe; `e2e/form.spec.ts` — responder todos los ítems hace desaparecer el botón.

---

## R18 — Mercado: stats grid 2×2

CUANDO la vista Mercado (`/mercado`) carga, el sistema DEBE renderizar un grid 2×2 de stat cards
blancas con:
- border-top 3px de color por categoría (IT=`--sys-primary`, ERP=`--sys-primary`,
  Cerradas=`--sys-status-green`, Upsell=`--sys-status-amber`)
- número grande 30px/800 del valor agregado
- label descriptivo arriba del número
- "n=" con cantidad de auditorías debajo

**Verificación:** `tests/ui/mercado.test.ts` — `StatCard.svelte` renderiza los valores con los
colores correctos por categoría; con cero auditorías el número muestra "0" sin divisiones por cero.

---

## R19 — Mercado: distribución ERP con barras horizontales

CUANDO la vista Mercado carga con datos, el sistema DEBE renderizar una card "Distribución ERP"
con barras horizontales de 6px por ERP detectado, coloreadas según paleta por ERP y con el nombre
y porcentaje a la derecha.

SI no hay auditorías cerradas, ENTONCES el sistema DEBE mostrar un estado vacío con texto descriptivo.

**Verificación:** `tests/ui/mercado.test.ts` — `ErpDistribution.svelte` renderiza una barra por
cada clave del mapa de distribución; la barra con 100% ocupa el ancho completo; con datos vacíos
muestra el empty state.

---

## R20 — Mercado: score promedio por sección

CUANDO la vista Mercado carga, el sistema DEBE renderizar una card "Score por sección" con barras
horizontales por cada sección de la plantilla, mostrando el score promedio y el porcentaje a la
derecha.

**Verificación:** `tests/ui/mercado.test.ts` — `SectionScoreBar.svelte` recibe `{ label, score }`
y renderiza la barra con ancho proporcional al score (0–100).

---

## R21 — Mercado: chip filters

CUANDO la vista Mercado carga, el sistema DEBE renderizar chips de filtro (igual patrón R9) con al
menos "Todos", "Seg. A", "Seg. B" y el año actual.

CUANDO el usuario selecciona un chip, la vista DEBE actualizar las métricas aplicando el filtro
sin recargar la página completa.

**Verificación:** `e2e/mercado.spec.ts` — seleccionar "Seg. A" actualiza los números del grid;
chip activo tiene fondo `--sys-primary`.

---

## R22 — Componentes compartidos: ProgressBar de ítem

El sistema DEBE exponer un componente `ItemProgressBar.svelte` que reciba `value: number` (0–100)
y `status: AuditStatus` y renderice una barra de 5px de alto, fondo `--sys-border`, relleno de
color determinado por el estado (cerrada=verde, en_cierre=ámbar, otros=azul).

**Verificación:** `tests/ui/progress-bar.test.ts` — `value=75, status='cerrada'` produce una barra
verde al 75%; `value=0` produce barra vacía sin error.

---

## R23 — Componentes compartidos: ChipPill

El sistema DEBE exponer un componente `ChipPill.svelte` que reciba `label`, `active: boolean` y
`variant?: 'default' | 'blue' | 'green' | 'gray'` y renderice según el patrón de chips de R9,
reutilizable en Tablero, Relevamiento y Mercado sin duplicación de estilos.

**Verificación:** `tests/ui/chip-pill.test.ts` — `active=true` produce fondo `--sys-primary`;
`active=false` produce fondo `--sys-bg-app`; `variant='green'` produce tinte verde en la card del
chip de tipo ERP.

---

## R24 — Responsive: mobile-first con breakpoint lg

El sistema DEBE implementar todos los componentes de esta feature en mobile-first: los estilos base
cubren `< lg` (390px) y los overrides `lg:` cubren `>= 1024px`.

El sistema NO DEBE usar breakpoints distintos de `lg` para separar las vistas mobile/desktop de
esta feature (se permite `sm:` para ajustes menores internos dentro de cada vista).

**Verificación:** `e2e/ui-layout.spec.ts` — a viewport 390px no existen sidebar ni tabla; a
viewport 1100px no existen header mobile ni bottom nav; `pnpm run check` pasa sin errores.

---

## R25 — No regresión de funcionalidad existente

El sistema DEBE mantener sin cambios funcionales todas las rutas y actions existentes afectadas
por el rediseño:
- `/` (Tablero): filtros, búsqueda, navegación a detalle/form/cierre
- `/auditorias/[id]/form`: autosave, fotos, score en vivo, chips de sección existentes
- `/mercado`: agregaciones SQL, filtros existentes

SI alguna de las rutas existentes retorna un error distinto al pre-rediseño bajo los mismos inputs,
ENTONCES el rediseño DEBE revertir los cambios que causaron la regresión.

**Verificación:** `pnpm test` pasa sin tests rotos (suite completa pre-existente en verde);
`e2e/tablero.spec.ts`, `e2e/form.spec.ts`, `e2e/mercado.spec.ts` existentes pasan sin modificación
de sus assertions.

---

## Trazabilidad acceptance → R

| Acceptance (descripción en prompt) | Requirements |
|---|---|
| Design tokens CSS/Tailwind | R1, R2, R3 |
| Layout shell: sidebar web + bottom nav mobile unificados | R4, R5, R6, R7, R8 |
| Tablero mobile (cards) + web (tabla) | R9, R10, R11, R12, R13, R22, R23 |
| Relevamiento: header + chips + question cards + próximo pendiente | R14, R15, R16, R17 |
| Mercado: stats grid + distribuciones + filtros | R18, R19, R20, R21 |
| Responsive mobile-first → lg | R24 |
| No regresión | R25 |
