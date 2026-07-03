# Design — 55_informe_html_manual

> Cómo se guarda, versiona, sirve y entrega el HTML manual. Decisiones D1–D7
> con justificación y alternativas descartadas. Base: requirements.md R1–R37.

## 1. Estado actual (lo relevante)

```
Panel interno                         Entrega pública
/auditorias/[id]/informe/[version]    /informe/[token]  (+page Svelte)
  ├── modelo: buildInformeRenderModel   ├── resolveShareByToken (share→report)
  ├── descarga #31: /api/.../html       ├── ReportWebRender (modelo IA)
  ├── share #15: /api/.../share         └── SurveyBlock #47 (?/responder)
  └── enviar #51: /api/.../enviar
```

- `audit_report`: versionado `UNIQUE (audit_id, version)`, `canonical_json`
  NOT NULL, estados `pendiente→generando→borrador→aprobado / error`.
- `audit_report_share`: token opaco 256-bit atado a UN report (una versión);
  un share activo por report; revocación lógica; contador de vistas.
- `resolveShareByToken` rechaza hoy `!report.clientDraft` — hay que hacerlo
  consciente del `source`.
- Workflow real hoy: `#31 descargar → pulir a mano → subir a CDN R2 → link por
  WhatsApp/email fuera del app`. Sin token, sin vistas, sin encuesta.

## 2. Decisiones

### D1 — Almacenamiento del HTML: columna `text` en Postgres — **DECISIÓN: DB**

`audit_report.html_manual text`, en la misma fila de la versión.

Justificación:

- **Tamaño trivial para Postgres.** El HTML ronda 90 KB (gold de referencia) y
  el techo operativo definido es 5 MiB (R12); TOAST lo maneja sin fricción. La
  misma tabla ya carga `canonical_json` jsonb de peso comparable por fila.
- **Atomicidad.** Versión + contenido en un solo INSERT: no hay estados
  parciales (fila sin objeto, objeto sin fila), ni limpieza de huérfanos en R2,
  ni fallas de red a mitad de subida.
- **R2 no ahorraría nada en el serving.** El documento público SIEMPRE pasa por
  el server (gate de token #15 + inyección de encuesta #47): no se puede servir
  directo del CDN. Guardar en R2 solo agregaría un fetch de red y sus modos de
  error a cada vista.
- **Round-trip byte a byte (R30) verificable con un `SELECT`.**

Mitigación del peso en listados: `html_manual` **NO** entra en
`REPORT_COLUMNS` ni en `AuditReportRow`; se lee solo vía
`getReportManualHtml(reportId)` en los dos puntos que lo sirven (público y
descarga #31). `listReportsByAudit` y el panel no arrastran el documento.

**Alternativa descartada — objeto en R2** (`audits/{auditId}/_informe/vN.html`):
evita bytes en la DB, pero introduce estado distribuido (fila+objeto), presign
o fetch server-side en cada vista pública, limpieza de huérfanos y un modo de
falla nuevo (bucket caído ≠ DB caída) — todo costo sin beneficio al tamaño
real. Además el CDN público NO puede servirlo directo (perdería token gating,
vistas y encuesta), que es justamente el gap que esta feature cierra.

### D2 — Serving público en `/informe/[token]`: intercepción en `hooks.server.ts` — **DECISIÓN**

SvelteKit enruta los GET de navegador (Accept prioriza `text/html`) a la
`+page` aunque exista `+server.ts` en la misma carpeta → **no hay forma de
devolver un documento HTML crudo en exactamente esa URL desde el sistema de
rutas**. Se intercepta en `handle` (hooks.server.ts), ANTES de `resolve`,
delegando en un helper de dominio:

```
handle → handleManualInformeRequest(event)
  ├── no matchea ^/informe/[^/]+(/imprimir)?$ con GET → null (sigue resolve)
  ├── rate limit (#15) → 429
  ├── resolveShareByToken → !ok → null (la página existente responde su 404 amable)
  ├── report.source !== 'manual' → null (flujo IA intacto, R28)
  ├── /imprimir → 303 a /informe/[token]  (R27)
  └── base → getReportManualHtml + inyección encuesta + registerShareView
            → Response 200 text/html + X-Robots-Tag  (R18, R20, R26)
```

- Cuando devuelve `null`, el request sigue su curso normal (página Svelte para
  IA, 404 de la página para tokens inválidos): una sola fuente de mensajes de
  error, cero regresión (R25, R28).
- Costo aceptado: para informes IA el token se resuelve dos veces (hook +
  load). Son dos SELECTs indexados por request público; se documenta y no se
  micro-optimiza (pasar el resultado por `event.locals` queda como mejora
  futura si molesta).

**Alternativas descartadas:**

- **`redirect(303)` desde el load a una subruta `/informe/[token]/doc`
  (+server.ts crudo):** funciona, pero el documento vive en otra URL pública
  (dos URLs para lo mismo, bookmarks del cliente sobre `/doc`), y el acceptance
  pide que `/informe/[token]` sirva el documento.
- **`{@html}` dentro de la página Svelte:** anida un documento completo
  (`<!doctype>`, `<head>` con estilos propios) dentro del body de la app —
  HTML inválido, CSS/JS del autor en conflicto con el shell; viola la puerta 4.
- **iframe / sanitización:** explícitamente descartados por la puerta 4 (el
  script de animaciones debe sobrevivir).

### D3 — La versión manual nace `aprobado`, fuera de la máquina de estados — **DECISIÓN**

`insertManualReport` inserta directamente `status='aprobado'` +
`approved_by/approved_at` (cumple el CHECK `approved_coherence`). La máquina
de #14 (`assertInformeTransition`) regula TRANSICIONES de filas IA; la fila
manual nace en su estado final y **no transiciona nunca** (no hay retry, ni
edición de draft, ni re-aprobación — R34). Corregir un manual = subir otra
versión (R4).

`canonical_json`/`schema_version` se copian de la última versión existente
(cualquier status: `canonical_json` es NOT NULL en todas) para satisfacer el
schema y alimentar `informeHtmlFilename` (#31). Sin versión previa → 409 (R7):
el workflow siempre parte de una descarga #31, así que la base existe.

### D4 — Vigencia derivada del versionado; sin auto-revocación de shares — **DECISIÓN (ver OQ-1)**

"Pasa a ser la vigente" (puerta 3) se materializa así, sin columna nueva:

- La manual recibe `version = MAX+1` y nace `aprobado` →
  `getLatestApprovedReport` (usado por #16 y quien pida "la vigente") la
  devuelve (R15).
- El listado de versiones la muestra primera, con badge `manual` (R33).
- La entrega es explícita por versión (como siempre en #15/#51): el admin
  genera el share / manda el email desde el panel de la versión manual (R16).

Los shares activos de versiones IA anteriores **no** se revocan
automáticamente (R17): en #15 cada token está atado a la versión exactamente
entregada (el cliente sigue viendo lo que se le entregó), y la revocación
manual ya existe en el panel. Ver OQ-1.

### D5 — Encuesta #47 en el documento manual: fragmento estático + endpoint plano — **DECISIÓN**

El documento manual no es una página Svelte → `SurveyBlock` (form action
`?/responder`) no aplica. Se agrega:

- `renderSurveyBlockHtml(state, token, flash)`: fragmento HTML autocontenido
  (contenedor `#sys-encuesta` con `<style>` scopeado bajo ese id para no pisar
  el CSS del autor), mismas preguntas (`SURVEY_QUESTIONS`), form HTML plano
  `POST /informe/[token]/encuesta` — funciona sin JavaScript (R22). Estado
  `respondida` → resumen sin form (R24). `flash` (`invalida` | `limite`)
  muestra el mensaje de error tras el redirect.
- `injectBeforeBodyClose(html, fragment)`: inserción en la **última**
  ocurrencia case-insensitive de `</body>` (R20; la subida garantiza que
  existe por R13; defensivamente, si faltara, se apendea al final).
- `POST /informe/[token]/encuesta` (+server.ts): formData →
  `submitSurveyResponse` (reusa rate limit → resolve → Zod → INSERT UNIQUE de
  #47) → `303` a `/informe/[token]` (`?encuesta=invalida` / `?encuesta=limite`
  en errores; duplicado y éxito no llevan flag: el bloque re-renderiza
  `respondida`). Token no resoluble → mismo 404 amable de #15 (R23, R25).

El flujo IA sigue usando la form action existente — sin cambios (R28).

### D6 — Descarga #31 y previsualización — **DECISIÓN**

`GET /api/audits/[id]/report/[version]/html` gana una rama: si
`report.source === 'manual'` → cuerpo = `getReportManualHtml(report.id)` tal
cual, SIN encuesta (la encuesta pertenece a la ENTREGA, no al documento), con
los mismos guards (`requireReportReadAccess`) y filename (`informeHtmlFilename`
funciona porque la fila manual tiene canónico copiado, D3). Round-trip
subir→descargar idéntico byte a byte (R29, R30).

Previsualización interna antes de entregar: mismo endpoint con `?inline=1` →
`Content-Disposition: inline` (R31). Sin ruta nueva, sin guard nuevo. Nota: la
preview muestra el documento SIN encuesta (fiel a lo subido).

### D7 — Guard de subida a nivel auditoría — **DECISIÓN**

La subida no tiene fila de informe destino → guard nuevo
`requireReportUploadAccess(locals, audit)` en `api/guards.ts`: admin siempre;
`tecnico` si es líder (`assigned_tech_id`) o figura en `audit_assignment`
(mismo conjunto que arma `requireReportReadAccess`, sin la condición de
`aprobado` porque no aplica a una fila que aún no existe). Cliente/no
asignados → 403 (R11). El botón del panel es visible para quien ve el panel
(admin; el técnico asignado hoy es redirigido a `imprimir` — el endpoint
igualmente lo autoriza, R32).

## 3. Fotos y assets del HTML manual servido públicamente (puerta 2)

Verificado en el gold de referencia y en la config de deploy:

- Las fotos apuntan a
  `https://auditapp.auditoriaserviciosysistemas.com.ar/audits/{auditId}/{seccion}/{attachmentId}`.
  Ese host es **`R2_PUBLIC_BASE_URL`**: el custom domain público del bucket R2
  (`deploy/app.env.example`), el mismo que `buildPublicObjectUrl` usa para las
  fotos del inventario #45 en el render IA público. El path es el `r2_key`
  (`audits/{auditId}/{seccion}/{uuid}`, `r2-keys.ts`).
- **Cargan sin sesión**: el bucket se sirve por su dominio público, no pasa por
  la app ni por `hooks.server.ts`. Es exactamente el mecanismo existente del
  render #45 → no hay que reescribir nada (puerta 2) y el documento manual
  público muestra las fotos igual que el render IA.
- Los logos van al CDN `pub-….r2.dev` (decisión #31): también públicos.
- Edge documentado: si el autor pegara URLs **presignadas** (con firma y TTL)
  en vez de públicas, expirarían — responsabilidad del autor del HTML (modelo
  de confianza de la puerta 4). El sistema no valida ni reescribe URLs (R14).
  En dev sin `R2_PUBLIC_BASE_URL` las fotos del HTML de producción no cargan;
  es el comportamiento esperado de un documento con URLs absolutas.

## 4. Cambios de schema (migración `029_informe_html_manual.sql`)

```sql
-- #55 R1–R3: origen de la versión + documento manual. Idempotente.
ALTER TABLE audit_report
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ia',
  ADD COLUMN IF NOT EXISTS html_manual text;

ALTER TABLE audit_report DROP CONSTRAINT IF EXISTS audit_report_source_check;
ALTER TABLE audit_report ADD CONSTRAINT audit_report_source_check
  CHECK (source IN ('ia', 'manual'));

ALTER TABLE audit_report DROP CONSTRAINT IF EXISTS audit_report_manual_coherence;
ALTER TABLE audit_report ADD CONSTRAINT audit_report_manual_coherence
  CHECK ((source = 'manual') = (html_manual IS NOT NULL));
```

Sin índices nuevos (los accesos van por PK / `audit_id` ya indexados). Bundle
export/import (#20) no incluye `audit_report` → sin impacto.

## 5. Archivos a crear / modificar

### Crear

| Archivo | Contenido |
|---|---|
| `migrations/029_informe_html_manual.sql` | §4 (R1–R3) |
| `src/lib/server/informe/manual.ts` | dominio manual: validación de subida, inyección de encuesta, serving público (D2, D5) |
| `src/routes/api/audits/[id]/report/manual/+server.ts` | POST subida multipart (R9–R15) |
| `src/routes/informe/[token]/encuesta/+server.ts` | POST encuesta sin JS (R22–R23) |
| `tests/informe-manual.test.ts` | unit dominio: validación, inyección, render encuesta estática |
| `tests/api/informe-manual-upload.test.ts` | endpoint subida: guards, validación, versionado |
| `tests/api/informe-manual-public.test.ts` | serving público, encuesta, imprimir, invariante, round-trip |

### Modificar

| Archivo | Cambio |
|---|---|
| `src/lib/server/db/informe-reports.ts` | `source` en `REPORT_COLUMNS`/`AuditReportRow`; `insertManualReport`; `getReportManualHtml` (R1–R8) |
| `src/lib/server/informe/errors.ts` | `InformeManualHtmlInvalidError`, `InformeManualSinBaseError` |
| `src/lib/server/informe/access.ts` | mapear los errores nuevos en `informeErrorResponse` (400 / 409) |
| `src/lib/server/informe/share.ts` | `resolveShareByToken`: check de contenido consciente del `source` (manual no exige `clientDraft`) |
| `src/lib/server/api/guards.ts` | `requireReportUploadAccess` (D7, R11) |
| `src/hooks.server.ts` | delegar en `handleManualInformeRequest` antes de `resolve` (D2) |
| `src/routes/api/audits/[id]/report/[version]/html/+server.ts` | rama manual + `?inline=1` (R29, R31) |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` | exponer `source`; datos de la manual (subida por / fecha) |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` | acción "Subir HTML", badge manual, gating de acciones IA, descarga/preview (R32–R35) |
| `src/routes/(app)/auditorias/[id]/+page.svelte` (listado de versiones) | badge `manual` (R33) |

**No se toca:** `pipeline.ts`, `prompts/`, `claude.ts`, `scoring/`,
`render.ts`, `render-erp/it/mixto`, `web-render.ts`, `model.ts`, plantillas de
email #49/#51 (R36, R37).

## 6. Firmas nuevas

```ts
// src/lib/server/db/informe-reports.ts
export type AuditReportSource = 'ia' | 'manual';
// AuditReportRow gana: source: AuditReportSource  (html_manual NO entra al row, D1)

/** INSERT atómico MAX+1, nace 'aprobado', copia canónico de la última versión.
 *  null ⇔ la auditoría no tiene versión base (→ InformeManualSinBaseError). */
export async function insertManualReport(input: {
  auditId: string;
  htmlManual: string;
  uploadedBy: string;
}): Promise<AuditReportRow | null>;

export async function getReportManualHtml(reportId: string): Promise<string | null>;

// src/lib/server/informe/manual.ts
export const MAX_INFORME_MANUAL_HTML_BYTES = 5_242_880; // 5 MiB (R12)

/** Lanza InformeManualHtmlInvalidError (vacío, > MAX, sin </body>) (R12, R13). */
export function validateManualHtml(input: { bytes: number; html: string }): void;

/** Inserta el fragmento antes de la ÚLTIMA '</body>' case-insensitive (R20). */
export function injectBeforeBodyClose(html: string, fragment: string): string;

export type SurveyFlash = 'invalida' | 'limite' | null;
/** Bloque #47 autocontenido (form plano POST /informe/[token]/encuesta) (R22, R24). */
export function renderSurveyBlockHtml(
  state: SurveyState,
  token: string,
  flash?: SurveyFlash
): string;

/** Intercepción de hooks (D2): Response para manual, null para seguir el flujo normal. */
export async function handleManualInformeRequest(
  event: RequestEvent
): Promise<Response | null>;

// src/lib/server/api/guards.ts
/** Admin siempre; técnico líder o con audit_assignment. 401/403 en Response (R10, R11). */
export function requireReportUploadAccess(
  locals: App.Locals,
  audit: { assignedTechId: string | null; assignedTechIds?: string[] }
): AppUser | Response;
```

Rutas nuevas:

- `POST /api/audits/[id]/report/manual` — multipart campo `file` → envelope
  `{ success, data: { id, version } }`.
- `POST /informe/[token]/encuesta` — formData de la encuesta → `303`.

## 7. Errores

| Error | Código HTTP | Cuándo |
|---|---|---|
| `InformeManualHtmlInvalidError` (nuevo, `INFORME_MANUAL_HTML_INVALID`) | 400 | archivo vacío / > 5 MiB / sin `</body>` (R12, R13) |
| `InformeManualSinBaseError` (nuevo, `INFORME_MANUAL_SIN_BASE`) | 409 | auditoría sin versión previa de informe (R7) |
| `AuditNotFoundError` (reuso) | 404 | auditoría inexistente/archivada |
| 401/403 vía `requireReportUploadAccess` (reuso patrón guards) | 401/403 | sin sesión / sin permiso (R10, R11) |
| 404 amable `INFORME_SHARE_UNAVAILABLE_MESSAGE` (reuso #15) | 404 | token inválido en serving/encuesta (R25) |

Ambos errores nuevos se agregan al mapa de `informeErrorResponse`.

## 8. Flujo completo (post-#55)

```
1. Admin descarga v3 (#31) → pule a mano → "Subir HTML" en el panel
2. POST /api/audits/[id]/report/manual → v4 (source=manual, aprobado)
3. Panel v4: badge manual · preview (?inline=1) · Descargar HTML
4. "Generar link" (#15) → share sobre v4 · "Enviar email" (#51) → link al cliente
5. Cliente abre /informe/[token] → hooks sirve el documento tal cual
   (+ encuesta antes de </body>) · vista registrada · animaciones OK
6. Cliente responde la encuesta (form plano, sin JS) → 303 → "gracias"
```

## 9. Open questions (puerta humana)

- **OQ-1 — Shares activos de versiones IA anteriores al subir la manual.**
  Decisión por defecto tomada en D4/R17: **NO se revocan automáticamente**
  (coherente con #15: cada token sirve exactamente la versión que se entregó;
  la revocación manual ya existe en el panel). La lectura alternativa de la
  puerta 3 ("pasa a ser la vigente para entregar") sería revocar los links
  viejos para que nadie siga viendo el informe superado — pero rompería links
  ya enviados a clientes. Confirmar el default o pedir auto-revocación.

No hay otras open questions: las cuatro decisiones de puerta del 2026-07-02
cubren entrega, fotos, versionado y modo de serving.
