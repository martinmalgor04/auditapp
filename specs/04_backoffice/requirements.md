# Requirements — #4 04_backoffice

> Panel admin + técnico: tablero, CRUD auditorías, usuarios, editor mínimo de plantillas.
> Depende de: `02_modelo_datos` (#2), `03_auth_roles` (#3).
> Fuera de alcance: export CSV/PDF, dashboard métricas v2, versionado completo de plantillas,
> alta/reorden de secciones, reabrir auditoría cerrada (feature `08_cierre_scoring` #8).

## R1 — Acceso autenticado al backoffice

MIENTRAS el usuario tiene sesión válida con rol `admin` o `tecnico`, el sistema DEBE permitir acceder a las rutas bajo `(app)/`.

**Verificación:** `tests/api/backoffice-routes.test.ts > unauthenticated GET /tablero returns 302 to login`.

## R2 — Tablero lista auditorías no archivadas

CUANDO un usuario autenticado (`admin` o `tecnico`) accede a `/tablero`, el sistema DEBE listar auditorías con `archived_at IS NULL` mostrando cliente, tipos, segmento, estado, técnico asignado, fecha de visita y última actualización.

**Verificación:** `tests/api/backoffice-dashboard.test.ts > lists audits with required columns`.

## R3 — Filtros primarios del tablero

CUANDO el usuario aplica filtros en el tablero, el sistema DEBE filtrar por **tipo** (`audit.types`), **estado** (`audit.status`) y **cliente** (`client_id`).

**Verificación:** `tests/api/backoffice-dashboard.test.ts > filters by type, status and client`.

## R4 — Búsqueda por razón social

CUANDO el usuario ingresa texto en la búsqueda del tablero, el sistema DEBE filtrar auditorías cuya razón social del cliente contenga el término (case-insensitive).

**Verificación:** `tests/api/backoffice-dashboard.test.ts > search matches client razon_social`.

## R5 — Badges de estado con color

El sistema DEBE renderizar el estado de cada auditoría como badge con color consistente para cada valor de la máquina de estados (`borrador`, `briefing_enviado`, `briefing_completo`, `en_relevamiento`, `en_cierre`, `cerrada`).

**Verificación:** `tests/backoffice-status-badge.test.ts > maps each audit status to a distinct badge variant`.

## R6 — Porcentaje de avance

El sistema DEBE calcular y mostrar el % de avance de cada auditoría como `(ítems con respuesta no vacía o marcados N/A) / (total de ítems de las plantillas congeladas)` × 100, redondeado a entero; un ítem N/A cuenta como completado.

**Verificación:** `tests/backoffice-progress.test.ts > na counts as completed; empty response does not`.

## R7 — Orden del tablero

CUANDO el usuario elige orden en el tablero, el sistema DEBE permitir ordenar por fecha de visita (`scheduled_at`) o última actualización (máximo `updated_at` de `audit_response` de esa auditoría, fallback `audit.created_at`).

**Verificación:** `tests/api/backoffice-dashboard.test.ts > sorts by scheduled_at and by last activity`.

## R8 — Layout responsive tabla/cards

DONDE el viewport es desktop (≥ `md`), el tablero DEBE mostrarse como tabla; DONDE el viewport es mobile (< `md`), el tablero DEBE mostrarse como cards apiladas con la misma información esencial.

**Verificación:** `e2e/backoffice-dashboard.spec.ts > desktop shows table; mobile shows cards` (o test de componente con breakpoint mock).

## R9 — Crear auditoría en borrador

CUANDO un usuario con permiso de creación (`admin` o `tecnico`) envía el formulario de nueva auditoría con cliente, tipos, segmento, técnico asignado, fecha de visita y respuestas de cabecera (sección `CAB`), el sistema DEBE persistir la auditoría con `status = 'borrador'` y `template_ids` congelados según los tipos seleccionados.

**Verificación:** `tests/api/audit-crud.test.ts > create audit sets borrador and freezes template_ids`.

## R10 — Cliente existente o nuevo en creación

CUANDO se crea una auditoría, el sistema DEBE permitir seleccionar un `client` existente o crear uno nuevo con `razon_social`, `cuit` y `rubro` validados por Zod.

**Verificación:** `tests/api/audit-crud.test.ts > create with new client persists client row`.

## R11 — Editar auditoría no cerrada

CUANDO la auditoría tiene `status != 'cerrada'` y `archived_at IS NULL`, el sistema DEBE permitir editar cabecera, respuestas CAB y reasignar técnico a usuarios con permiso de edición.

**Verificación:** `tests/api/audit-crud.test.ts > update header and reassign tech when not closed`.

## R12 — Bloqueo de edición en cerrada

SI la auditoría tiene `status = 'cerrada'`, ENTONCES el sistema NO DEBE permitir editar cabecera ni reasignar técnico (solo lectura en detalle).

**Verificación:** `tests/api/audit-crud.test.ts > update on closed audit returns 403 or 409`.

## R13 — Borrado lógico de auditoría

CUANDO un usuario `admin` confirma archivar una auditoría, el sistema DEBE establecer `archived_at = now()` sin borrar filas relacionadas.

**Verificación:** `tests/api/audit-crud.test.ts > archive sets archived_at; audit hidden from tablero`.

## R14 — Generar link de briefing

CUANDO el usuario autorizado ejecuta «Generar link de briefing» sobre una auditoría en `borrador`, el sistema DEBE crear `public_token` único, establecer `status = 'briefing_enviado'` y devolver la URL `{PUBLIC_APP_URL}/briefing/{public_token}`.

**Verificación:** `tests/api/audit-briefing-link.test.ts > generate token transitions to briefing_enviado`.

## R15 — Regenerar token de briefing

CUANDO el usuario autorizado ejecuta «Regenerar link» y la auditoría está en `briefing_enviado` o `briefing_completo`, el sistema DEBE reemplazar `public_token` por uno nuevo e invalidar el token anterior.

**Verificación:** `tests/api/audit-briefing-link.test.ts > regenerate invalidates previous token`.

## R16 — Copiar link desde tablero o detalle

El sistema DEBE exponer acción para copiar al portapapeles el link de briefing cuando exista `public_token` y el estado permita briefing.

**Verificación:** `e2e/backoffice-briefing-link.spec.ts > copy briefing URL action present when token exists` (o test de action que retorna URL).

## R17 — ABM usuarios solo admin

MIENTRAS el rol es `admin`, el sistema DEBE permitir alta, edición (nombre, email, rol, activo) y baja lógica (`active = false`) de usuarios `app_user` con rol `admin` o `tecnico`.

**Verificación:** `tests/api/users-admin.test.ts > admin can create and deactivate user`.

## R18 — Reset de contraseña solo admin

CUANDO un `admin` resetea la contraseña de un usuario, el sistema DEBE generar hash argon2id de una contraseña temporal segura y persistirla en `password_hash`.

**Verificación:** `tests/api/users-admin.test.ts > reset password updates hash; login with new password succeeds`.

## R19 — Usuarios bloqueado para técnico

SI el rol es `tecnico`, ENTONCES el sistema NO DEBE permitir acceder a `/usuarios` ni mutar `app_user`.

**Verificación:** `tests/api/users-admin.test.ts > tecnico GET /usuarios returns 403`.

## R20 — Editor plantillas solo admin

MIENTRAS el rol es `admin`, el sistema DEBE permitir abrir `/plantillas/[id]` y listar secciones e ítems de la plantilla.

**Verificación:** `tests/api/templates-admin.test.ts > admin can load template editor`.

## R21 — Edición acotada de ítems existentes

CUANDO un `admin` guarda cambios en un ítem de plantilla, el sistema DEBE permitir modificar únicamente `label`, `help`, `options`, `method` y `filled_by` del `template_item` existente.

**Verificación:** `tests/api/templates-admin.test.ts > update allowed fields persists; rejects new item or section`.

## R22 — Sin alta de secciones ni ítems nuevos

El sistema NO DEBE ofrecer en v1 acciones para crear secciones, crear ítems nuevos ni reordenar secciones/ítems en el editor de plantillas.

**Verificación:** `tests/api/templates-admin.test.ts > POST new section or item returns 404 or 403`.

## R23 — Plantillas bloqueado para técnico

SI el rol es `tecnico`, ENTONCES el sistema NO DEBE permitir acceder a rutas `/plantillas/*` ni mutar plantillas.

**Verificación:** `tests/api/templates-admin.test.ts > tecnico GET /plantillas/[id] returns 403`.

## R24 — Guards server-side en mutaciones

Toda acción de mutación del backoffice (form actions o `+server.ts`) DEBE validar rol y permisos en el servidor antes de ejecutar SQL.

**Verificación:** cubierto por tests de rol en `tests/api/backoffice-routes.test.ts` y suites CRUD.

## R25 — Paginación del tablero

CUANDO hay más de 50 auditorías que coinciden con filtros, el sistema DEBE paginar resultados (cursor o offset) sin cargar todo en memoria.

**Verificación:** `tests/api/backoffice-dashboard.test.ts > returns page size limit and next cursor`.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #4) | Requirements |
|---|---|
| Tablero con filtros tipo/estado/cliente, búsqueda, badges, % avance | R2, R3, R4, R5, R6 |
| CRUD auditorías: crear cabecera+plantilla+técnico, editar, borrado lógico | R9, R10, R11, R12, R13 |
| Generar/regenerar link briefing (`public_token`) | R14, R15, R16 |
| ABM usuarios técnicos/admins, reset contraseña (solo admin) | R17, R18, R19 |
| Editor plantillas: solo edición ítems existentes | R20, R21, R22, R23 |
| Layout responsive: tabla desktop, cards mobile | R8 |
| Tests de rutas backoffice pasan | R1, R24, suites `tests/api/` + e2e parcial |
