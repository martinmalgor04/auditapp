# Requirements — #15 15_entrega_informe

> Entrega real del informe aprobado (#14) al cliente: link público de solo lectura con token,
> revocable y con expiración (patrón briefing), registro de enviado y de vistas, embed Loom y
> vista PDF con CSS print branded. Solo el render cliente: nunca material interno.
> Fuente: plan lead magnet §7.5 Salida 1 + etapa 7 — fase 2 declarada en
> `specs/14_informe_ia/requirements.md` («Publicación en CDN con token público»).
> **Contrato visual de la vista web:** `docs/plantillas/informe/template_informe_web_v2.html`
> (hero dark con gauge animado, score-rows con barras, reveal on scroll, CTA final).
> **Contrato visual del PDF:** se reutiliza el render A4 de #14 (`report-render.svelte`).
> Depende de: `14_informe_ia` (#14, done) — tabla `audit_report`, view-model
> `buildInformeRenderModel`, render A4 — y del patrón de token público de `05_briefing_externo`.

## R1 — Ruta pública renderiza solo informes aprobados

CUANDO un visitante sin sesión abre `GET /informe/[token]` con un token vigente (existente, no
revocado, no expirado) cuyo informe está en estado `aprobado`, el sistema DEBE renderizar la
vista web del informe cliente con branding SyS sin requerir autenticación ni mostrar chrome de
la app (sin navegación interna, sin datos de sesión).

**Verificación:** `tests/api/informe-share-public.test.ts` — GET con token vigente y reporte
`aprobado` responde 200 con el contenido del informe sin sesión; `e2e/entrega-informe.spec.ts`
— el link abre en contexto sin login.

## R2 — Token inválido, revocado, expirado o informe no apto → pantalla amable

SI el token no existe, fue revocado, está expirado, o el informe asociado no está en estado
`aprobado`, ENTONCES `GET /informe/[token]` DEBE responder con una pantalla amable branded
(mensaje «Este enlace ya no está disponible», contacto SyS) con status HTTP `404`, sin
distinguir externamente la causa (no filtrar si el token existió) y sin exponer ningún dato del
informe ni del cliente.

**Verificación:** `tests/api/informe-share-public.test.ts` — token inexistente, revocado,
expirado y token de informe en `borrador` devuelven el mismo 404 con la pantalla amable; el
body no contiene razón social ni textos del draft.

## R3 — Persistencia del share: un link activo por informe

CUANDO un admin genera un link de entrega, el sistema DEBE insertar una fila en
`audit_report_share` con `report_id`, `token` único de al menos 256 bits de entropía
(`randomBytes(32).toString('base64url')`, patrón briefing), `expires_at` (nullable),
`created_by` y `created_at`; el sistema DEBE garantizar a nivel de base de datos que existe a
lo sumo un share activo (no revocado) por `report_id`.

**Verificación:** `tests/api/informe-share-admin.test.ts` — el POST crea fila con token de 43
caracteres base64url y metadatos; intentar insertar un segundo share activo para el mismo
report falla por el índice único parcial (verificado vía regeneración atómica, R5).

## R4 — Operaciones de share: solo admin y solo informes aprobados

CUANDO un usuario solicita generar, consultar (metadatos/estadísticas) o revocar el link de
entrega de un informe, el sistema DEBE responder `401` sin sesión válida y `403` si el rol no
es `admin`; SI el informe no está en estado `aprobado`, ENTONCES el POST de generación DEBE
responder `409` sin crear fila.

**Verificación:** `tests/api/informe-share-admin.test.ts` — sin sesión 401; rol `tecnico` 403
en POST/DELETE/GET de share; POST sobre informe `borrador` 409 y conteo de
`audit_report_share` sin cambios.

## R5 — Regenerar revoca el link anterior

CUANDO un admin regenera el link de un informe que ya tiene un share activo, el sistema DEBE
marcar `revoked_at` en el share anterior y crear el nuevo en la misma transacción; el token
anterior DEBE dejar de resolver (pantalla amable R2) inmediatamente.

**Verificación:** `tests/api/informe-share-admin.test.ts` — segundo POST devuelve token nuevo,
el share previo queda con `revoked_at` poblado; `tests/api/informe-share-public.test.ts` — GET
con el token viejo responde 404 amable.

## R6 — Revocación explícita

CUANDO un admin revoca el link activo de un informe (`DELETE`), el sistema DEBE marcar
`revoked_at = now()` sin borrar la fila (trazabilidad) y el token DEBE dejar de resolver; SI no
hay share activo, ENTONCES el DELETE DEBE responder `404`.

**Verificación:** `tests/api/informe-share-admin.test.ts` — DELETE revoca (fila persiste con
`revoked_at`), segundo DELETE 404; GET público posterior 404 amable.

## R7 — Expiración configurable

CUANDO el admin genera el link, el sistema DEBE aceptar una expiración configurable
(`expires_in_days` entero entre 1 y 365, o `null` = sin vencimiento) con default
`INFORME_SHARE_DEFAULT_DAYS` (90), persistir `expires_at` calculado server-side, y la
validación pública DEBE rechazar tokens con `expires_at < now()` (pantalla amable R2).

**Verificación:** `tests/informe-share.test.ts` — cálculo de `expires_at` por días y caso
`null`; `tests/api/informe-share-admin.test.ts` — `expires_in_days: 0` y `400` Zod;
`tests/api/informe-share-public.test.ts` — share con `expires_at` en el pasado responde 404.

## R8 — Registro de enviado visible en backoffice

MIENTRAS un informe tiene o tuvo un link de entrega, la pantalla de revisión del informe
(`/auditorias/[id]/informe/[version]`) DEBE mostrar al admin quién generó el link y cuándo
(`created_by` resuelto a nombre, `created_at`), la URL completa con acción copiar, su
expiración y su estado (activo / revocado / expirado).

**Verificación:** `tests/api/informe-share-admin.test.ts` — GET de share devuelve
`created_by_name`, `created_at`, `expires_at`, `revoked_at`, `url`;
`e2e/entrega-informe.spec.ts` — la sección «Entrega al cliente» muestra el link generado y los
metadatos.

## R9 — Registro de vistas: primera vez y contador

CUANDO la ruta pública sirve el informe con éxito (R1), el sistema DEBE incrementar
`view_count` de forma atómica y registrar `first_viewed_at` (solo la primera vez) y
`last_viewed_at`; estos datos DEBEN ser visibles para el admin en el backoffice junto al link.
Las cargas fallidas (R2) NO DEBEN contar vistas.

**Verificación:** `tests/api/informe-share-public.test.ts` — dos GET exitosos dejan
`view_count = 2`, `first_viewed_at` fijo en la primera carga, `last_viewed_at` actualizado; GET
con token revocado no incrementa; `tests/api/informe-share-admin.test.ts` — GET admin de share
incluye `view_count` y `first_viewed_at`.

## R10 — Vista web según template oficial v2

CUANDO la ruta pública renderiza el informe, el sistema DEBE implementar el template web
oficial (`docs/plantillas/informe/template_informe_web_v2.html`) como componente Svelte con los
datos de `buildInformeRenderModel` (client_draft + snapshot canónico): (1) hero dark con logo
vertical CDN R2, tag período, cliente, CUIT, gauge SVG animado del índice general con color y
badge por semáforo, meta de fecha/sistema; (2) resumen ejecutivo con lead, 3 cards con
contadores animados (`data-count`), recomendación central y callout de fortalezas; (3)
hallazgos por circuito como score-rows (nombre, dimensiones Doc./Controles/Madurez, barra de
score animada y valor del snapshot canónico vía `seccion_code`) + frase legend; (4) riesgos
priorizados en cards numeradas con evidencia; (5) qué cambia en el día a día; (6) el plan con
etapas; (7) CTA final con mailto «Coordinar próximos pasos», datos de contacto SyS fijos y
footer de confidencialidad; con barra de progreso de scroll, reveal on scroll
(IntersectionObserver), colores con tokens `--sys-*` y los semáforos/scores/índices tomados
SIEMPRE del snapshot canónico (`indexToSemaphore`), nunca del texto del draft.

**Verificación:** `tests/informe-web-render.test.ts` — snapshot del componente con fixture
estable contiene hero con logo `sys_vertical_w.png`, gauge con score del canónico, las
secciones 01–05 + CTA, score-rows con valores del fixture canónico (no del draft), contadores
`data-count`, clases `reveal`, tokens `--sys-*` y footer de confidencialidad.

## R11 — Embed Loom en la vista pública

DONDE el informe tiene `loom_url` cargada, la vista web pública DEBE embeber el video Loom
(iframe `https://www.loom.com/embed/...`) en una sección propia entre el hero y el resumen
ejecutivo; sin `loom_url` la sección NO DEBE renderizarse; la vista PDF/print NO DEBE incluir
el bloque Loom.

**Verificación:** `tests/informe-web-render.test.ts` — snapshot con y sin `loom_url` (iframe
presente/ausente); la vista imprimir pública no contiene el iframe.

## R12 — Render público sin material interno

El render público (web y PDF) DEBE construirse exclusivamente con `client_draft` + datos
públicos del snapshot (`stripInternalFindings`, vía `buildInformeRenderModel`) y NO DEBE
contener `upsell_findings`, recomendaciones internas de presupuesto, `internal_draft`,
`error_message` ni identificadores internos (ids de usuario, prompt_version).

**Verificación:** `tests/informe-web-render.test.ts` — render de fixture con `upsell_findings`
e `internal_draft` poblados no contiene ninguno de sus textos (test explícito del acceptance);
`tests/api/informe-share-public.test.ts` — el HTML público no contiene textos del
`internal_draft`.

## R13 — Vista PDF con CSS print branded

CUANDO el visitante abre `GET /informe/[token]/imprimir` con token vigente (mismas reglas R1 y
R2), el sistema DEBE servir el render A4 oficial de #14 (`report-render.svelte`, 7 páginas,
`@media print`) sin chrome de app, con un botón «Descargar PDF» visible solo en pantalla que
invoca `window.print()`; la vista web (R10) DEBE enlazar a esta vista como acción de descarga.
La generación de PDF server-side queda fuera de alcance (decisión de diseño: print optimizado,
ver design).

**Verificación:** `tests/api/informe-share-public.test.ts` — GET imprimir con token vigente 200
con las 7 páginas y regla `@media print`; con token revocado 404 amable;
`e2e/entrega-informe.spec.ts` — desde la vista web se navega a imprimir y el botón existe.

## R14 — Protección de la ruta pública: noindex y rate limit

La ruta pública (web e imprimir) DEBE responder con `X-Robots-Tag: noindex, nofollow` y meta
robots equivalente, y DEBE aplicar rate limit por IP a la resolución de tokens (patrón
`briefing-rate-limit`) respondiendo `429` al exceder el límite, para mitigar enumeración de
tokens.

**Verificación:** `tests/api/informe-share-public.test.ts` — respuesta 200 incluye header y
meta noindex; ráfaga sobre tokens inválidos termina en 429.

## R15 — Tests unitarios e integración

El sistema DEBE incluir tests vitest en `tests/informe-share*.test.ts`,
`tests/informe-web-render.test.ts` y `tests/api/informe-share-*.test.ts` que cubran generación
y unicidad de token, expiración, revocación, permisos, contador de vistas, exclusión de
material interno y snapshot del render web, ejecutables sin servicios externos.

**Verificación:** `pnpm test` ejecuta la suite share/web-render en verde.

## R16 — E2E flujo aprobar → compartir → ver

El sistema DEBE incluir `e2e/entrega-informe.spec.ts` que recorra: informe `aprobado` (fixture
del flujo #14 con Claude fake) → generar link de entrega → copiar URL → abrir la ruta pública
en contexto sin sesión y ver el informe (hero + secciones) → verificar contador de vistas en
backoffice → revocar → la URL pública muestra la pantalla amable.

**Verificación:** `pnpm exec playwright test e2e/entrega-informe.spec.ts` pasa en CI.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #15) | Requirements |
|---|---|
| Ruta pública `/informe/[token]` sin auth, solo `aprobado`, branding SyS y embed Loom | R1, R2, R10, R11 |
| Token único por informe: generar/regenerar (revoca el anterior) y expiración configurable; inválido → pantalla amable | R2, R3, R4, R5, R6, R7, R14 |
| Registro de enviado (quién/cuándo) y de vistas (primera vez y contador) en backoffice | R8, R9 |
| Export o vista PDF con CSS print branded | R13 |
| Render público sin upsell_findings ni recomendaciones internas (test explícito) | R12 |
| Tests de token, permisos y e2e aprobar → compartir → ver | R15, R16 |

Nota sobre «token firmado» del description: se implementa como token opaco aleatorio de 256
bits almacenado en DB (patrón briefing ya validado en producción), no como JWT/HMAC — la
revocación y expiración server-side exigen consulta a DB de todos modos, y un token firmado no
agregaría seguridad. Ver alternativa descartada y open question 1 en design.

## Fuera de alcance (no implementar)

- Generación de PDF server-side (puppeteer/playwright en prod) — MVP: vista print optimizada
  (R13); revisar si algún cliente lo pide.
- Envío automático del link al cliente (mail/WhatsApp) — el admin copia y envía por su canal.
- Analytics de lectura por sección, tiempo en página o identificación del visitante.
- Múltiples links activos simultáneos por informe (uno solo, regenerar revoca).
- Protección por contraseña/PIN del link público.
- Publicación en CDN estático (el render se sirve desde la app, mismo origen).
