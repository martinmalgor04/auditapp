# Requirements — 31_descarga_html_informe

> Exponer como **descarga `.html`** el mismo informe que el panel interno ya
> muestra con `{@html}`. Es solo plomería de entrega: un endpoint server GET que
> reusa `buildInformeRenderModel()` + `renderInformeHtml(model)` (los que ya
> alimentan `report-render.svelte`) y los devuelve con
> `Content-Disposition: attachment`, más un botón en el panel de versión. No
> cambia el render, ni el scoring, ni el sistema de share público.

## Contexto verificado

- **Cadena de render reutilizada (NO se crea una nueva):**
  ```
  AuditReportRow
    → buildInformeRenderModel(report, timestamps)  (src/lib/server/informe/model.ts)
    → InformeRenderModel
    → renderInformeHtml(model, opts)          (src/lib/informe/render.ts → render-erp/it/mixto)
  ```
  El panel interno arma el modelo en `+page.server.ts` y lo pinta en
  `report-render.svelte` vía `renderInformeHtml(model, { editMode })`. La
  descarga debe producir **ese mismo string**.
- **Bloque de visita (#27) ahora incluido en ambos lados (decisión de la
  puerta 2026-06-18).** `buildInformeRenderModel(report, timestamps)` ya acepta
  un segundo argumento opcional `{ startedAt, finishedAt }` y, cuando hay fin,
  agrega `model.visita`. El render (`render-erp/it/mixto`, `web-render`) **ya
  tiene el slot** y pinta `model.visita` si está presente (`<p class="visita">…`).
  Hoy ese bloque NO se muestra: el panel llama `buildInformeRenderModel(report)`
  sin `timestamps`. La decisión es **incluir la visita en el informe descargado**
  y, para que el archivo siga siendo idéntico al panel, **mostrarla también en el
  panel interno**: AMBOS lados (el `+page.server.ts` del panel y el nuevo endpoint
  de descarga) DEBEN pasar `timestamps` con los `started_at`/`finished_at` de la
  auditoría (`migrations/018_hora_inicio_fin.sql`, columnas `audit.started_at` /
  `audit.finished_at`), leídos frescos vía el loader de acceso del informe.
- **`editMode` NO aplica a la descarga.** El editor inline
  (`data-field`/`contenteditable`) es para edición en pantalla. La descarga es el
  informe final: se renderiza con `renderInformeHtml(model)` (opts por defecto,
  `editMode` falso), igual que `report-render.svelte` cuando no está editando.
- **Logos por CDN (decisión de la puerta 2026-06-18).** `render-shared.ts` ya
  sirve `LOGO_VERT_URL` / `LOGO_COLOR_URL` desde el CDN R2. El HTML descargado
  hereda esas URLs **tal cual**; NO se embeben en base64. El archivo NO pretende
  ser offline-autocontenido.
- **Permisos del panel interno.** El acceso a un informe se resuelve con
  `getAuditForReport()` + el guard `requireReportReadAccess(locals, audit, report)`
  de `src/lib/server/api/guards.ts`: admin siempre; técnico asignado solo si el
  informe está `aprobado`; sin sesión → 401; resto → 403. La descarga DEBE usar
  ese mismo guard. El endpoint vive bajo `/api/audits/[id]/...` (rutas internas,
  no públicas). El share público `/informe/[token]` NO se toca.
- **Datos para el filename.** El modelo (`InformeRenderModel`) ya expone
  `cliente.razonSocial`, `fechaInforme` y `tipoAuditoria` (`'erp' | 'it' |
  'mixta'`, derivado en `src/lib/server/informe/tipo.ts`); el canónico tiene
  `closed_at` y `types`. La convención de nombres del repo (CLAUDE.md padre) es
  `[YYYY-MM-DD]_[tipo]_[cliente]_[slug]_[v].[ext]`. El token de tipo del filename
  se deriva del tipo de auditoría (`it` / `erp` / `mixta`), no de un literal fijo.
- **Patrón de endpoint de descarga existente.** `src/routes/api/audits/[id]/bundle/export/+server.ts`
  y `src/routes/api/crm/empresas/export/+server.ts` ya devuelven respuestas con
  `Content-Disposition: attachment; filename="…"`. Se sigue ese mismo patrón.

## Decisiones tomadas (puerta humana 2026-06-18 — NO re-preguntar)

1. **Solo panel interno.** No se toca el link público `/informe/[token]` ni el
   sistema de share. No se crea ninguna vía pública nueva.
2. **HTML "tal cual se ve".** Logos como URL al CDN R2 (no base64). El archivo
   no es offline-autocontenido.
3. **Reuso exacto.** Mismo `buildInformeRenderModel` + `renderInformeHtml` que la
   vista interna. No se crea un render nuevo ni se altera el existente.
4. **Endpoint server GET** que responde `text/html` con
   `Content-Disposition: attachment` y filename según la convención del repo.
5. **Sin cambios en render, scoring ni share.**
6. **Visita (#27) incluida en la descarga Y en el panel.** El informe descargado
   muestra el bloque de visita (hora inicio/fin/duración). Para que la descarga
   siga siendo idéntica al panel, la visita se muestra también en el panel
   interno: ambos lados pasan `timestamps` a `buildInformeRenderModel`.
7. **Token de tipo en el filename.** El nombre del archivo usa el tipo de
   auditoría (`it` / `erp` / `mixta`) en lugar del literal fijo `auditoria`.

## Definición operativa del filename (regla de negocio, R7)

El filename DEBE seguir la convención del repo
`[YYYY-MM-DD]_informe_[cliente-slug]_[tipo]_v[N].html`:

- `[YYYY-MM-DD]` = fecha de cierre de la auditoría (`canonical.closed_at`) en
  `YYYY-MM-DD` (UTC). SI `closed_at` es nulo ENTONCES se usa la fecha actual.
- `informe` = literal fijo (tipo de documento de la convención del repo).
- `[cliente-slug]` = `cliente.razonSocial` normalizado a kebab-case ASCII
  (minúsculas, sin acentos, espacios y símbolos → `-`, colapsando guiones).
- `[tipo]` = tipo de auditoría: `it`, `erp` o `mixta` (token de tipo del
  informe). Se deriva del tipo de auditoría del informe — `tipoAuditoria` del
  modelo / `tipoAuditoria(canonical.types)` —, NO un literal fijo `auditoria`.
- `v[N]` = `v` + número de versión del informe (`report.version`).
- El filename completo solo contiene `[a-z0-9._-]`; SI la normalización dejara el
  cliente vacío ENTONCES se usa `cliente`.

Ejemplo: `2026-06-02_informe_playadito_it_v3.html`.

## Historias

- **H1 — Como admin/técnico**, quiero un botón "Descargar HTML" en el panel de
  versión del informe para bajar el informe como archivo `.html` idéntico a lo
  que veo en pantalla.
- **H2 — Como responsable de seguridad**, quiero que esa descarga respete los
  mismos permisos que el panel interno y no abra ninguna vía pública.

## Requirements (EARS estricto)

### A. Endpoint de descarga

**R1.** El sistema DEBE exponer un endpoint server GET interno, bajo
`/api/audits/[id]/...`, que devuelva el informe de una auditoría y versión como
documento HTML descargable.

**R2.** CUANDO el endpoint de descarga recibe un `id` de auditoría y una
`version` válidos de un informe existente, el sistema DEBE construir el modelo
con `buildInformeRenderModel(report, timestamps)` —pasando los
`started_at`/`finished_at` de la auditoría como `timestamps`— y renderizar el
cuerpo con `renderInformeHtml(model)`, reutilizando exactamente las mismas
funciones que alimentan `report-render.svelte`.

**R3.** El cuerpo HTML devuelto por la descarga DEBE ser idéntico, byte a byte,
al string que `renderInformeHtml(model)` produce para esa versión en el panel
interno (mismo modelo, construido con los mismos `timestamps` de la auditoría —
incluido el bloque de visita cuando corresponde— y `editMode` falso); el sistema
NO DEBE crear ni invocar un render alternativo.

**R4.** El sistema NO DEBE embeber los logos del informe como `data:` base64 en
el HTML descargado: los logos DEBEN quedar como las URLs del CDN R2
(`LOGO_VERT_URL` / `LOGO_COLOR_URL`) que ya emite el render.

### B. Headers y filename

**R5.** CUANDO la descarga responde con éxito, el sistema DEBE fijar el header
`Content-Type` a `text/html; charset=utf-8`.

**R6.** CUANDO la descarga responde con éxito, el sistema DEBE fijar el header
`Content-Disposition` a `attachment; filename="<nombre>"`.

**R7.** El `<nombre>` del archivo descargado DEBE seguir la convención del repo
`[YYYY-MM-DD]_informe_[cliente-slug]_[tipo]_v[N].html` según la definición
operativa de filename (fecha de cierre, razón social normalizada a kebab-case
ASCII, **tipo de auditoría `it`/`erp`/`mixta` como token de tipo**, versión del
informe).

**R8.** CUANDO la descarga responde con éxito, el sistema DEBE devolver status
HTTP `200`.

### C. Control de acceso

**R9.** SI la petición de descarga no tiene sesión ENTONCES el sistema DEBE
responder `401` y NO DEBE devolver el cuerpo del informe.

**R10.** SI la petición de descarga es de un usuario sin permiso sobre ese
informe (rol no admin que no es el técnico asignado, o técnico asignado sobre un
informe no `aprobado`) ENTONCES el sistema DEBE responder `403` y NO DEBE
devolver el cuerpo del informe, reutilizando `requireReportReadAccess`.

**R11.** El sistema NO DEBE exponer la descarga del informe por ninguna ruta
pública ni a través del sistema de share `/informe/[token]`.

### D. Errores

**R12.** SI la auditoría indicada no existe ENTONCES el sistema DEBE responder
`404` con el envelope de error estándar.

**R13.** SI la `version` no es un entero válido (`≥ 1`) o no existe un informe
para esa auditoría y versión ENTONCES el sistema DEBE responder `404` con el
envelope de error estándar.

**R14.** SI el informe existe pero no tiene `client_draft` para renderizar
ENTONCES el sistema DEBE responder un error controlado (no un `500` con stack
trace expuesto) y NO DEBE devolver un cuerpo parcial.

### E. Botón en el panel y no-regresión

**R15.** El sistema DEBE mostrar en el panel de versión del informe
(`src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte`) una acción
"Descargar HTML" que dispare la descarga del endpoint para esa auditoría y
versión.

**R16.** MIENTRAS el informe de la versión no esté en un estado renderizable
(`borrador` o `aprobado`, es decir, sin modelo disponible), el sistema NO DEBE
ofrecer la acción "Descargar HTML".

**R17.** El sistema NO DEBE modificar el render del informe
(`renderInformeHtml` y sus `render-erp/it/mixto`), el motor de scoring
(`src/lib/server/scoring/`) ni el sistema de share público al agregar esta
descarga.

### F. Visita (#27) en el informe descargado y en el panel

**R18.** CUANDO el endpoint de descarga construye el modelo, el sistema DEBE
pasar `timestamps` con los `started_at`/`finished_at` de la auditoría a
`buildInformeRenderModel`, de modo que el HTML descargado incluya el bloque de
visita (hora inicio/fin/duración) SIEMPRE que la auditoría tenga `started_at` y
`finished_at`.

**R19.** El panel de versión (`+page.server.ts`) DEBE construir el modelo
pasando los mismos `timestamps` (`started_at`/`finished_at` de la auditoría) que
la descarga, de modo que el bloque de visita se muestre también en el panel
interno y la descarga siga siendo idéntica a lo que el admin ve en pantalla.

**R20.** SI la auditoría no tiene `finished_at` (visita no cerrada) ENTONCES
el sistema NO DEBE incluir el bloque de visita ni en la descarga ni en el panel
(comportamiento de `buildInformeRenderModel`: `visita` queda `undefined`), y
ambos lados DEBEN seguir produciendo el mismo HTML.

## Criterios de verificación (resumen R ↔ test)

| R | Verificación concreta |
|---|---|
| R1 | existe `…/report/[version]/html/+server.ts` con handler `GET` |
| R2 | el handler llama `buildInformeRenderModel(report, timestamps)` (con `started_at`/`finished_at`) y `renderInformeHtml(model)` |
| R3 | test: el cuerpo de la respuesta `=== renderInformeHtml(buildInformeRenderModel(report, timestamps))` para un fixture (con visita) |
| R4 | test: el cuerpo contiene `r2.dev/LOGOS/…` y NO contiene `data:image` base64 |
| R5 | test: header `Content-Type` empieza con `text/html` |
| R6 | test: header `Content-Disposition` empieza con `attachment; filename=` |
| R7 | test: filename = `YYYY-MM-DD_informe_<slug>_<tipo>_vN.html` con `tipo ∈ {it,erp,mixta}`; solo `[a-z0-9._-]`; slug sin acentos |
| R8 | test: respuesta de éxito devuelve `200` |
| R9 | test: sin `locals.user` → `401`, cuerpo sin HTML del informe |
| R10 | test: técnico no asignado / informe no aprobado → `403`, sin cuerpo |
| R11 | revisión: no se agrega ninguna ruta bajo `briefing`/`informe/[token]`; solo `/api/audits/...` |
| R12 | test: audit inexistente → `404` envelope |
| R13 | test: version inválida o inexistente → `404` envelope |
| R14 | test: informe sin `client_draft` → error controlado (no 200, sin stack) |
| R15 | el `+page.svelte` renderiza un control que apunta al endpoint de descarga |
| R16 | el control solo aparece cuando `model` existe (status borrador/aprobado) |
| R17 | el diff no toca `render.ts`/`render-erp|it|mixto`, `scoring/`, ni rutas de share |
| R18 | test: con fixture de auditoría con `started_at`/`finished_at`, el cuerpo descargado contiene el bloque de visita (`class="visita"`) |
| R19 | test/revisión: el `+page.server.ts` del panel llama `buildInformeRenderModel(report, timestamps)`; el HTML del panel y el de la descarga coinciden |
| R20 | test: con auditoría sin `finished_at`, ni la descarga ni el panel incluyen el bloque de visita; ambos producen el mismo HTML |
