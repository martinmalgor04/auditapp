# Requirements — 55_informe_html_manual

> Subir el HTML del informe pulido a mano y que ese HTML sea la versión vigente
> entregable al cliente. Internaliza el workflow real de hoy: descargar (#31) →
> pulir a mano → subir al CDN R2 → mandar el link POR FUERA del app (sin token,
> sin registro de vistas, sin encuesta). Después de #55: descargar (#31) →
> pulir → **subir al app** → entregar por `/informe/[token]` (#15) con encuesta
> (#47) y envío por email (#51). No toca el generador IA (#14) ni el scoring:
> el HTML subido reemplaza el informe en la ENTREGA, no en el pipeline.

## Contexto verificado

- **Versionado existente (#14).** `audit_report` versiona por auditoría con
  `UNIQUE (audit_id, version)` e INSERT atómico `COALESCE(MAX(version),0)+1`
  (`insertReport`, `src/lib/server/db/informe-reports.ts`). `canonical_json` y
  `schema_version` son `NOT NULL`. El estado `aprobado` exige
  `approved_by`/`approved_at` (CHECK `audit_report_approved_coherence`).
- **Entrega pública (#15).** `audit_report_share` ata cada token a un
  `report_id` concreto (una versión exacta); a lo sumo un share activo por
  informe (índice único parcial). `resolveShareByToken`
  (`src/lib/server/informe/share.ts`) valida existencia + no revocado + no
  expirado + informe `aprobado` y **hoy además rechaza si
  `!report.clientDraft`** — la versión manual no tiene `client_draft`, así que
  ese check debe volverse consciente del origen.
- **Ruta pública actual.** `/informe/[token]` es una página Svelte
  (`+page.server.ts` + `+page.svelte`) que arma `buildInformeRenderModel` y
  pinta `ReportWebRender` + `SurveyBlock` (#47). SvelteKit enruta los GET de
  navegador (Accept: text/html) SIEMPRE a la página aunque exista un
  `+server.ts` hermano → para servir un **documento HTML completo tal cual** en
  esa misma URL hay que interceptar en `hooks.server.ts` (ver design §D2).
- **Encuesta (#47).** `submitSurveyResponse` (`src/lib/server/informe/survey.ts`)
  ya encapsula rate limit → resolve token → Zod → INSERT (UNIQUE por share).
  Hoy el POST entra por la form action `?/responder` de la página; para el
  documento manual hace falta un endpoint plano (el documento no es una página
  Svelte). Campos: `valoracion_global`, `claridad_informe`,
  `conforme_hallazgos`, `comentario` (`SURVEY_QUESTIONS`).
- **Fotos y logos.** Las imágenes del HTML gold de referencia
  (`~/Downloads/2026-informe-grupo_agros_formosa-auditoria-erp-it.html`, 1311
  líneas, ~90 KB) apuntan a
  `https://auditapp.auditoriaserviciosysistemas.com.ar/audits/{auditId}/{seccion}/{attachmentId}`:
  ese dominio es `R2_PUBLIC_BASE_URL` (custom domain **público** del bucket R2,
  ver `.env.example` y `deploy/app.env.example`), el mismo que usa
  `buildPublicObjectUrl` para las fotos del render #45. **Cargan sin sesión**:
  no hace falta reescribir nada (decisión de puerta 2). Los logos van al CDN
  `pub-….r2.dev` (#31).
- **Script de animaciones.** El HTML de referencia trae UN `<script>` al final
  del `<body>` (reveal-on-scroll con IntersectionObserver, barras, contador y
  gauge SVG + `beforeprint`). Cualquier sanitización lo rompería → se sirve
  como documento directo (decisión de puerta 4).
- **Descarga (#31).** `/api/audits/[id]/report/[version]/html` devuelve el
  render con `Content-Disposition: attachment` y filename
  `YYYY-MM-DD_informe_<slug>_<tipo>_vN.html` (`informeHtmlFilename`, derivado
  de `canonical_json` + `report.version`).
- **Email (#51).** `enviarInforme` usa el share activo del report (lo crea si
  falta, requiere `aprobado`) y manda `informeUrl` + `pdfUrl`
  (= `informeUrl + '/imprimir'`). Guard del endpoint:
  `requireReportReadAccess` + status `aprobado` → funciona con la versión
  manual sin cambios, siempre que `/informe/[token]/imprimir` responda algo
  razonable para un informe manual.
- **Permisos.** `requireReportReadAccess` (`src/lib/server/api/guards.ts`):
  admin siempre; técnico asignado (líder o `audit_assignment`) solo informes
  `aprobado`. La subida necesita un guard a nivel auditoría (todavía no hay
  fila de informe manual): admin o técnico asignado.
- **Bundle export/import (#20).** No incluye `audit_report` → las columnas
  nuevas no afectan compatibilidad de bundles.

## Decisiones tomadas (puerta humana 2026-07-02, Martín — NO re-abrir)

1. **Entrega al cliente.** El HTML subido se entrega en el link público
   `/informe/[token]` (#15), no solo en el panel interno.
2. **Sin reescritura de fotos.** El HTML se guarda y sirve TAL CUAL; las
   imágenes apuntan a URLs de attachments del propio app (`/audits/{id}/...`
   sobre el dominio público R2) y se resuelven con el mecanismo existente.
3. **Versionado.** Subir HTML crea una NUEVA versión de `audit_report` marcada
   como manual (`source = 'manual'`), que pasa a ser la vigente para descargar
   (#31) y entregar (#15), sin borrar las versiones IA.
4. **Documento directo.** Se sirve como documento HTML directo: NO iframe
   sandbox, NO sanitización que rompa el script de animaciones. La encuesta de
   conformidad (#47) se inyecta antes de `</body>`. Modelo de confianza: solo
   admin/técnico asignado sube.

## Invariante heredada (#14/#15)

El render público **nunca** inyecta material interno (`internal_draft`,
`upsell_findings`, recomendaciones internas). En la versión manual el contenido
del documento es responsabilidad del autor que lo subió; el sistema solo agrega
el bloque de encuesta #47.

## Historias

- **H1 — Como Martín (admin)**, quiero subir el HTML del informe que pulí a
  mano y que quede como nueva versión vigente, para entregarlo con el link
  tokenizado del app en vez de subirlo al CDN y mandar el link a mano.
- **H2 — Como cliente**, quiero abrir `/informe/[token]` y ver el informe
  pulido con sus animaciones y fotos, y responder la encuesta al pie, igual
  que con un informe generado.
- **H3 — Como responsable de seguridad**, quiero que la subida esté restringida
  a admin/técnico asignado y que el link público conserve token firmado,
  revocación, expiración y registro de vistas.

## Requirements (EARS estricto)

### A. Modelo de datos y versionado

**R1.** El sistema DEBE persistir en `audit_report` el origen de cada versión
en una columna `source` con valores `'ia' | 'manual'` y default `'ia'`
(migración idempotente; las filas existentes y las del pipeline #14 quedan
`'ia'`).

**R2.** El sistema DEBE persistir el documento subido, byte a byte, en una
columna `audit_report.html_manual` (`text`) de la fila de la versión manual.

**R3.** El sistema DEBE imponer por CHECK la coherencia
`(source = 'manual') = (html_manual IS NOT NULL)`.

**R4.** CUANDO un usuario autorizado sube un HTML válido, el sistema DEBE crear
una nueva fila de `audit_report` con `version = COALESCE(MAX(version),0)+1` de
esa auditoría, en un único INSERT atómico (mismo patrón que `insertReport`).

**R5.** CUANDO se crea la versión manual, el sistema DEBE crearla directamente
en `status = 'aprobado'` con `approved_by` = uploader y `approved_at = now()`
(nace aprobada; no pasa por la máquina de estados de #14 y no admite
transiciones posteriores).

**R6.** CUANDO se crea la versión manual, el sistema DEBE copiar
`canonical_json` y `schema_version` desde la versión de informe existente más
reciente de la misma auditoría (base para filename #31 y metadatos).

**R7.** SI la auditoría no tiene ninguna versión previa de informe ENTONCES el
sistema DEBE rechazar la subida con `409` (envelope estándar) sin crear fila.

**R8.** El sistema NO DEBE modificar ni borrar las versiones IA existentes al
crear una versión manual (siguen listables en el panel con su historial).

### B. Subida (endpoint y validación)

**R9.** El sistema DEBE exponer un endpoint interno
`POST /api/audits/[id]/report/manual` (multipart/form-data, campo `file`) que
crea la versión manual y responde el envelope estándar con
`{ id, version }` de la nueva versión.

**R10.** SI la petición de subida no tiene sesión ENTONCES el sistema DEBE
responder `401` sin crear fila.

**R11.** SI el usuario autenticado no es admin ni técnico asignado a la
auditoría (líder `assigned_tech_id` o `audit_assignment`) ENTONCES el sistema
DEBE responder `403` sin crear fila.

**R12.** SI el archivo subido está vacío o supera
`MAX_INFORME_MANUAL_HTML_BYTES` (5 MiB) ENTONCES el sistema DEBE responder
`400` (envelope estándar) sin crear fila.

**R13.** SI el contenido subido no contiene `</body>` (case-insensitive,
necesario para la inyección determinística de la encuesta) ENTONCES el sistema
DEBE responder `400` sin crear fila.

**R14.** El sistema NO DEBE reescribir, sanitizar ni alterar el HTML subido al
guardarlo: ni URLs de imágenes, ni `<script>`, ni estilos (decisiones de
puerta 2 y 4).

### C. Vigencia

**R15.** CUANDO existe una versión manual (que por R4 tiene el mayor número de
versión y por R5 está `aprobado`), el sistema DEBE devolverla como última
versión aprobada en `getLatestApprovedReport` (vigencia derivada del
versionado existente, sin columna nueva de "vigente").

**R16.** El panel de la versión manual DEBE ofrecer las mismas acciones de
entrega que una versión IA aprobada: generar/revocar link público (#15),
enviar por email (#51) y ver la encuesta (#47).

**R17.** El sistema NO DEBE revocar automáticamente los shares activos de
versiones anteriores al crear la versión manual (semántica de #15: cada token
sirve exactamente la versión entregada; la revocación manual sigue disponible
en el panel — ver Open question OQ-1 del design).

### D. Entrega pública `/informe/[token]`

**R18.** CUANDO un GET a `/informe/[token]` resuelve a un share válido cuyo
informe tiene `source = 'manual'`, el sistema DEBE responder el documento
`html_manual` como documento HTML directo (`Content-Type: text/html;
charset=utf-8`, status 200), sin iframe, sin sanitización y sin reescritura,
con la única modificación de la inyección del bloque de encuesta (R20).

**R19.** El cuerpo público de la versión manual DEBE construirse exclusivamente
a partir de `html_manual` y del bloque de encuesta #47; el sistema NO DEBE
incluir contenido derivado de `internal_draft`, `upsell_findings` ni de ningún
otro material interno (invariante #14/#15).

**R20.** CUANDO se sirve el documento manual público, el sistema DEBE inyectar
el bloque de encuesta #47 inmediatamente antes de la **última** ocurrencia de
`</body>` del documento.

**R21.** El documento manual servido DEBE conservar intactos los `<script>` del
archivo subido (el script de animaciones reveal-on-scroll/gauge funciona en el
render público).

**R22.** El bloque de encuesta inyectado DEBE funcionar sin JavaScript: un
`<form method="POST">` HTML plano hacia `/informe/[token]/encuesta` con los
mismos campos (`valoracion_global`, `claridad_informe`, `conforme_hallazgos`,
`comentario`) y la misma validación (`submitSurveyResponse`) que la encuesta
#47, y con CSS aislado bajo un contenedor propio para no pisar los estilos del
autor.

**R23.** CUANDO el POST a `/informe/[token]/encuesta` se procesa con éxito o
falla por validación/duplicado/rate-limit, el sistema DEBE responder `303` de
vuelta a `/informe/[token]` (con flag de error en querystring cuando
corresponda), de modo que el documento recargado refleje el estado.

**R24.** MIENTRAS la encuesta del share ya está respondida, el bloque inyectado
DEBE mostrar el estado "respondida" (resumen, sin form), igual que #47.

**R25.** Los guards del token de #15 DEBEN aplicar igual a la versión manual:
token inexistente, revocado, expirado o informe no `aprobado` responden el
mismo `404` indistinguible, y el rate limit responde `429`.

**R26.** CUANDO se sirve el documento manual público, el sistema DEBE registrar
la vista (`registerShareView`: contador, primera y última vista) y fijar el
header `X-Robots-Tag: noindex, nofollow`.

**R27.** CUANDO un GET a `/informe/[token]/imprimir` corresponde a un informe
manual, el sistema DEBE responder `303` hacia `/informe/[token]` (el documento
manual es su propia vista imprimible vía `beforeprint`; mantiene vivo el
`pdfUrl` de los emails #51).

**R28.** El sistema NO DEBE alterar el comportamiento existente de
`/informe/[token]` ni de `/informe/[token]/imprimir` para versiones con
`source = 'ia'` (no-regresión de #15/#47).

### E. Descarga (#31) y round-trip

**R29.** CUANDO el endpoint de descarga `#31`
(`/api/audits/[id]/report/[version]/html`) recibe una versión manual, el
sistema DEBE devolver `html_manual` byte a byte (SIN encuesta inyectada), con
los mismos guards, headers y convención de filename de #31.

**R30.** El sistema DEBE garantizar el round-trip descargar→subir: el cuerpo
descargado de una versión manual DEBE ser idéntico, byte a byte, al archivo
que se subió para crearla.

**R31.** CUANDO el endpoint de descarga #31 recibe el query param `inline=1`,
el sistema DEBE responder con `Content-Disposition: inline` (mismos guards y
cuerpo) para la previsualización interna del documento antes de entregarlo.

### F. Panel interno

**R32.** El panel de versión del informe
(`src/routes/(app)/auditorias/[id]/informe/[version]`) DEBE ofrecer una acción
"Subir HTML" (input de archivo `.html`) que dispare el POST de subida y, tras
éxito, navegue al panel de la nueva versión manual.

**R33.** El panel de versión y el listado de versiones de la auditoría DEBEN
distinguir visualmente la versión manual (badge/etiqueta "manual") de las
versiones IA.

**R34.** MIENTRAS la versión mostrada es manual, el panel NO DEBE ofrecer las
acciones del pipeline IA que no aplican (edición de borrador, aprobación,
reintento de generación).

**R35.** El panel de la versión manual DEBE ofrecer la acción "Descargar HTML"
(#31) y la previsualización del documento (R31).

### G. Alcance y no-regresión

**R36.** El sistema NO DEBE modificar el generador IA (#14: `pipeline.ts`,
prompts, `claude.ts`), el motor de scoring (`src/lib/server/scoring/`) ni los
renders existentes (`render.ts`, `render-erp/it/mixto`, `web-render.ts`).

**R37.** El envío por email (#51) DEBE funcionar con la versión manual sin
cambios en la plantilla ni en `enviarInforme` (share activo del report manual;
`informeUrl` sirve el documento y `pdfUrl` redirige a él por R27).

## Criterios de verificación (resumen R ↔ test)

| R | Verificación concreta |
|---|---|
| R1–R3 | test schema: migración 2x sin error; `source` default `'ia'`; CHECK viola con `source='manual'` sin html y con `source='ia'` con html |
| R4 | test db: dos `insertManualReport` seguidos → versiones consecutivas MAX+1 |
| R5 | test db: fila manual nace `aprobado` con `approved_by`/`approved_at` |
| R6 | test db: `canonical_json`/`schema_version` iguales a la última versión previa |
| R7 | test api: auditoría sin informes → `409` envelope, sin fila nueva |
| R8 | test db: tras subir, `listReportsByAudit` conserva todas las versiones IA |
| R9, R15* | test api: subida OK → `200` envelope `{ id, version }` (*R15: `getLatestApprovedReport` devuelve la manual) |
| R10 | test api: sin sesión → `401` |
| R11 | test api: técnico no asignado / rol cliente → `403`, sin fila |
| R12 | test: archivo vacío o > 5 MiB → `400` |
| R13 | test: HTML sin `</body>` → `400` |
| R14, R30 | test round-trip: subir fixture → descargar #31 → cuerpos idénticos byte a byte |
| R16 | revisión + test: share/enviar/encuesta operativos sobre report manual |
| R17 | test: share activo de versión IA previa sigue `activo` tras subir manual |
| R18 | test: GET público con report manual → 200, `text/html`, cuerpo = documento (no página Svelte) |
| R19 | test invariante: cuerpo servido === inyección(html_manual, bloque encuesta); no contiene strings de `internal_draft`/`upsell_findings` del fixture |
| R20 | test unit: `injectBeforeBodyClose` inserta antes de la última `</body>` (fixture con `</body>` en un string intermedio) |
| R21 | test: el cuerpo servido contiene el `<script>` del fixture sin modificación |
| R22 | test: bloque inyectado contiene `<form method="POST" action="/informe/<token>/encuesta">` y los 4 campos |
| R23 | test api: POST encuesta válido → `303` a `/informe/[token]`; inválido → `303` con flag |
| R24 | test: con `survey_response` existente, el bloque muestra estado respondida sin `<form>` |
| R25 | test: token revocado/expirado/inexistente → `404` mismo mensaje; rate limit → `429` |
| R26 | test: `view_count` incrementa y header `X-Robots-Tag` presente |
| R27 | test: GET `/informe/[token]/imprimir` manual → `303` Location `/informe/[token]` |
| R28 | tests existentes de #15/#47 verdes sin cambios de comportamiento IA |
| R29 | test api: descarga de versión manual → cuerpo = `html_manual`, headers #31, sin encuesta |
| R31 | test api: `?inline=1` → `Content-Disposition: inline` |
| R32–R35 | revisión de `+page.svelte`/`+page.server.ts`: acción subir, badge, gating de acciones IA, descarga/preview |
| R36 | revisión del diff: no toca `pipeline.ts`, `scoring/`, `render*.ts`, `web-render.ts` |
| R37 | test: `enviarInforme` con report manual → `ok`, share activo creado sobre la versión manual |
