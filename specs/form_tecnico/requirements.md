# Requirements — form_tecnico

> Formulario mobile-first del técnico: render data-driven, autosave con cola, fotos R2, score en vivo, PWA.
> Fuente: `docs/source-specs/specs-07/07e-form-tecnico-mobile/spec.md`, PRD 07e.
> Depende de: `modelo_datos` (#2), `auth_roles` (#3), `briefing_externo` (#5, motor de campos compartido), `storage_r2` (#6).

## R1 — Acceso autenticado del técnico

CUANDO un usuario con rol `tecnico` o `admin` abre `GET /audits/{auditId}/form`, el sistema DEBE renderizar el formulario de relevamiento si la auditoría está en estado editable (`briefing_completo`, `en_relevamiento` o `en_cierre`) y el técnico está asignado a esa auditoría (o es `admin`).

**Verificación:** `tests/api/audit-form-load.test.ts` — técnico asignado recibe 200; técnico no asignado recibe 403; sin sesión recibe 401.

## R2 — Render de los 12 field_type

CUANDO el formulario carga una auditoría con plantilla activa, el sistema DEBE renderizar data-driven un control mobile-first por cada `field_type` válido: `text`, `number`, `bool`, `tri`, `select`, `multiselect`, `date`, `datetime`, `list`, `table`, `file_ref`, `money`.

**Verificación:** `tests/form-field-renderer.test.ts` — fixture con los 12 tipos produce componente esperado por tipo; `e2e/form-tecnico.spec.ts` — smoke por tipo en viewport móvil.

## R3 — UX mobile-first

El sistema DEBE presentar el form técnico con targets táctiles ≥ 44px, controles de acción frecuente en zona inferior alcanzable con el pulgar y tipografía legible en viewport ≥ 375px de ancho.

**Verificación:** `e2e/form-tecnico.spec.ts` — viewport 375×812; assert de `min-height`/`min-w` en botones primarios y segmented controls.

## R4 — Datos del briefing precargados

CUANDO existen filas `audit_response` con `source = 'cliente'` para ítems de la plantilla, el sistema DEBE mostrar esos valores ya completados en el formulario del técnico, marcados visualmente como «precargado» y editables por el técnico.

**Verificación:** `tests/form-preload.test.ts` — load incluye respuestas cliente con flag `preloaded: true`; cambio del técnico persiste con `source = 'tecnico'`.

## R5 — Navegación por secciones en orden libre

El sistema DEBE mostrar una sección por pantalla con navegación libre entre secciones (sin orden obligatorio) y una barra de progreso que refleje el porcentaje de ítems respondidos o marcados N/A sobre el total de ítems `filled_by ∈ {tecnico, admin}` de la auditoría.

**Verificación:** `tests/form-section-nav.test.ts` — saltar de sección A2 a A5 sin bloqueo; barra = ítems completos / total × 100.

## R6 — Autosave debounced e inmediato

CUANDO el técnico modifica un ítem, el sistema DEBE enviar upsert con debounce de 500–800 ms en campos de texto (`text`, `list`, observaciones) e inmediatamente en `bool`, `tri`, `select`, `multiselect`, `date`, `datetime`, `number`, `money` y cambios de filas en `table`.

**Verificación:** `tests/form-autosave.test.ts` — mock fetch: un keystroke en `text` no dispara save antes de 500 ms; toggle `tri` dispara save en ≤ 100 ms.

## R7 — Upsert idempotente source técnico

CUANDO el autosave confirma en servidor, el sistema DEBE hacer upsert en `audit_response` por `(audit_id, item_id)` con `source = 'tecnico'`, `updated_by = user.id`, `updated_at` actualizado y valor validado según `field_type`.

**Verificación:** `tests/api/audit-form-save.test.ts` — dos PATCH del mismo ítem actualizan una fila; campos `source` y `updated_by` correctos.

## R8 — Cola de reintentos ante fallo de red

SI una petición de autosave falla por error de red o HTTP 5xx, ENTONCES el sistema DEBE encolar el cambio en almacenamiento local persistente (IndexedDB o equivalente) y reintentar automáticamente al detectar conectividad restaurada, sin duplicar filas en servidor.

**Verificación:** `tests/form-retry-queue.test.ts` — simular offline, acumular 3 cambios, reconectar y verificar un upsert por ítem; `e2e/form-tecnico.spec.ts` — escenario offline/online con datos recuperados.

## R9 — Indicador de guardado

MIENTRAS el formulario está activo, el sistema DEBE mostrar un indicador persistente con exactamente uno de estos estados: «Guardando…», «Guardado ✓» o «Sin conexión — se reintenta».

**Verificación:** `tests/form-save-indicator.test.ts` — transiciones de estado según mock de fetch y `navigator.onLine`; `e2e/form-tecnico.spec.ts` — texto visible tras editar campo.

## R10 — Export JSON de respaldo

CUANDO el técnico solicita exportar respaldo, el sistema DEBE descargar un archivo JSON con `schema_version`, `audit_id`, `exported_at` y el listado de respuestas `{ item_id, value, na, notes }` de la auditoría actual (incluida cola pendiente no sincronizada).

**Verificación:** `tests/form-export-import.test.ts` — export produce JSON válido contra schema Zod; incluye respuesta en cola local no enviada.

## R11 — Import JSON de respaldo

CUANDO el técnico importa un JSON exportado válido para la misma `audit_id`, el sistema DEBE validar el schema, upsertar las respuestas en servidor (o encolar si offline) y refrescar el estado del formulario sin pérdida de ítems no incluidos en el archivo.

**Verificación:** `tests/form-export-import.test.ts` — import de fixture JSON restaura valores; JSON de otra auditoría rechazado con error claro.

## R12 — Subida de fotos vía presigned PUT

CUANDO el técnico captura o selecciona una imagen para un ítem `file_ref` o fila de inventario, el sistema DEBE solicitar presigned PUT a `storage_r2` (#6), subir el binario directo a R2 y confirmar creando `attachment` vinculado al `item_id` correspondiente.

**Verificación:** `tests/form-photo-upload.test.ts` — mock presign → PUT → confirm; `attachment` y `audit_response` actualizados.

## R13 — Compresión cliente antes de subir

ANTES de solicitar presigned PUT para imágenes, el sistema DEBE redimensionar el lado largo a ≤ 1600 px, comprimir JPEG con calidad 0,8 y convertir HEIC/HEIF a JPEG en el cliente.

**Verificación:** `tests/form-image-compress.test.ts` — fixture HEIC produce blob `image/jpeg`; dimensiones ≤ 1600; `content_type` enviado a presign es `image/jpeg`.

## R14 — Cámara por fila de inventario

CUANDO el ítem es `field_type = table` con grilla de equipos (`options.inventory = true` o equivalente en plantilla), cada fila DEBE exponer un botón de cámara que abre captura nativa y vincula la foto a esa fila (`row_id`) dentro del valor JSON del ítem, permitiendo varias fotos por fila.

**Verificación:** `tests/form-table-camera.test.ts` — agregar fila + foto actualiza `value.rows[n].attachment_ids`; foto no queda en `_general` ni en otro ítem.

## R15 — Score por sección en vivo solo lectura

MIENTRAS el técnico edita respuestas de una sección, el sistema DEBE recalcular y mostrar en solo lectura el score 0–100 de esa sección usando el motor determinístico de rúbrica (`template_item.options`) sin permitir edición manual del score.

**Verificación:** `tests/form-live-score.test.ts` — cambiar ítem scored actualiza score visible; input manual de score no existe en DOM.

## R16 — Semáforo de score por sección

El sistema DEBE mostrar el score por sección con semáforo visual: verde para 70–100, naranja para 40–69 y rojo para 0–39.

**Verificación:** `tests/form-live-score.test.ts` — scores 75, 55 y 30 mapean a clases/tokens `green`, `amber`, `red`.

## R17 — Secciones N/A sin penalización

CUANDO todos los ítems scored de una sección están marcados N/A o la sección está declarada N/A completa, el sistema DEBE excluir esa sección del cálculo de score en vivo y del progreso de scoring (sin contar como 0).

**Verificación:** `tests/form-live-score.test.ts` — sección 100 % N/A muestra «N/A» en lugar de score numérico y no reduce índice parcial.

## R18 — N/A y observaciones por ítem

DONDE `template_item.allow_na = true`, el sistema DEBE permitir marcar N/A con un toque sin exigir valor. Las observaciones por ítem DEBEN mostrarse colapsadas por defecto y expandibles bajo demanda.

**Verificación:** `tests/form-item-ux.test.ts` — toggle N/A limpia validación required; observaciones ocultas hasta expandir.

## R19 — Etiqueta de método de relevamiento

El sistema DEBE mostrar junto a cada ítem la etiqueta o ícono del método (`method ∈ {O, E, C, X}`) definido en `template_item.method`.

**Verificación:** `tests/form-field-renderer.test.ts` — ítem con `method='E'` renderiza badge «Entrevista» o ícono acordado.

## R20 — Finalizar relevamiento

CUANDO el técnico confirma «Relevamiento completo», el sistema DEBE transicionar `audit.status` a `en_cierre` tras validación blanda que advierte ítems `required` sin respuesta ni N/A sin bloquear la acción.

**Verificación:** `tests/api/audit-form-complete.test.ts` — transición a `en_cierre`; ítems pendientes generan warning en respuesta pero no impiden submit.

## R21 — PWA manifest SyS

El sistema DEBE servir `manifest.webmanifest` con nombre «SyS Auditorías», íconos de marca SyS, `display: standalone` y `theme_color` según skill `sys-brand`.

**Verificación:** `tests/pwa-manifest.test.ts` — GET `/manifest.webmanifest` retorna JSON válido con campos requeridos e íconos referenciados en `static/`.

## R22 — Service worker shell

El sistema DEBE registrar un service worker que precachee el shell de la app (HTML, CSS, JS estáticos) y aplique estrategia network-first para peticiones de datos (`/api/*`, load de formulario).

**Verificación:** `tests/pwa-sw.test.ts` — SW registrado; precache incluye `/`; fetch mock a `/api/` no sirve desde cache-only en primera petición online.

## R23 — Layout desktop adaptativo

DONDE el viewport es ≥ 1024px, el sistema DEBE mostrar listado de secciones en panel lateral y contenido de la sección activa en panel principal, reutilizando el mismo motor de render mobile.

**Verificación:** `e2e/form-tecnico.spec.ts` — viewport 1280×800 muestra nav lateral + contenido; misma sección activa que en mobile.

## R24 — Tests de integración API

El sistema DEBE incluir tests vitest en `tests/api/` y `tests/form-*.test.ts` que cubran carga, autosave, cola, export/import, fotos y transición a `en_cierre`.

**Verificación:** `pnpm test` ejecuta la suite `form-*` y `audit-form-*` con exit code 0.

## R25 — E2E Playwright del form técnico

El sistema DEBE incluir `e2e/form-tecnico.spec.ts` que recorra el flujo feliz mobile: login técnico → abrir auditoría → completar campo → ver indicador guardado → navegar sección → ver score en vivo.

**Verificación:** `pnpm exec playwright test e2e/form-tecnico.spec.ts` pasa contra servidor de test con fixture de auditoría en `briefing_completo`.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #7) | Requirements |
|---|---|
| Render data-driven de 12 field_type mobile-first | R2, R3, R19 |
| Datos briefing precargados visibles al técnico | R4 |
| Autosave debounced + cola reintentos + export/import JSON | R6, R7, R8, R10, R11 |
| Indicador Guardando/Guardado/Sin conexión | R9 |
| Fotos: presigned PUT, compresión 1600px/0.8, HEIC→JPEG | R12, R13 |
| Cámara desde grilla inventario enlaza foto a fila | R14 |
| Score en vivo solo lectura por sección con semáforo | R15, R16, R17 |
| Secciones orden libre, barra progreso | R5 |
| PWA: manifest SyS, SW shell, network-first datos | R21, R22 |
| Tests y e2e form pasan | R24, R25 |

## Fuera de alcance (v2+)

- Offline-first completo con sync bidireccional prolongado (v1: cola + export/import JSON).
- Edición manual de `audit_section_score` por el técnico (score autocalculado).
- Scoring de índices IT/ERP/global (feature `cierre_scoring` #8).
- Preview de informe y pantalla de cierre (#8).
- Compresión configurable por el técnico en UI.
