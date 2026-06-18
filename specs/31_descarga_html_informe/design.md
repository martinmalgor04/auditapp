# Design — 31_descarga_html_informe

> Cómo se expone como descarga `.html` el mismo informe que el panel interno
> renderiza hoy, **reutilizando** la cadena de render existente. Es plomería de
> entrega: un endpoint server GET + un botón. No toca render, scoring ni share.
> Decisiones de la puerta humana (2026-06-18) incorporadas; ver requirements.md.

## 1. Estado actual verificado

```
src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts
  requireUser(locals) → getAuditForReport(id) → getReportByAuditVersion(audit.id, v)
  guard admin/técnico (403/redirect)
  model = buildInformeRenderModel(report)        ← HOY sin timestamps (a corregir)
       ↓ (PageData.model)
src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte
  <ReportRender {model} />  →  renderInformeHtml(model, { editMode:false })  →  {@html}
```

- `buildInformeRenderModel(report, timestamps?)` (`src/lib/server/informe/model.ts`):
  arma el view-model público (vía `stripInternalFindings`). El 2º argumento
  `{ startedAt, finishedAt }` es opcional; cuando se pasa y hay `finishedAt`,
  agrega `model.visita = { inicio, fin, duracionMin }` (vía `formatVisita`). Sin
  argumento, `visita` queda `undefined`. **HOY el panel llama sin `timestamps`**,
  así que el bloque de visita no se ve; esta feature lo corrige (decisión de la
  puerta 2026-06-18, R18/R19).
- **El render ya tiene el slot de visita (feature #27).** `render-erp.ts`,
  `render-it.ts`, `render-mixto.ts` y `web-render.ts` ya emiten
  `<p class="visita">${inicio}–${fin} · ${formatDuracion(duracionMin)}</p>`
  condicionado a `model.visita`. **No hay que tocar el render**: basta con
  alimentar el modelo con `timestamps` y el slot se pinta solo.
- **Origen de los timestamps.** Las columnas `audit.started_at` /
  `audit.finished_at` (`migrations/018_hora_inicio_fin.sql`) se leen frescas. El
  loader compartido `getAuditForReport(auditId)`
  (`src/lib/server/informe/access.ts`) hoy sólo selecciona
  `id, status, assigned_tech_id`; se **extiende** para devolver también
  `startedAt`/`finishedAt`. Como el panel y el endpoint usan el mismo loader,
  ambos obtienen los timestamps de un solo lugar y quedan coherentes.
- `renderInformeHtml(model, opts)` (`src/lib/informe/render.ts`): despacha a
  `render-erp` / `render-it` / `render-mixto`. Logos por CDN ya resueltos en
  `render-shared.ts` (`LOGO_VERT_URL`, `LOGO_COLOR_URL`).
- Guard interno de informes: `requireReportReadAccess(locals, audit, report)`
  (`src/lib/server/api/guards.ts`) → admin siempre; técnico asignado solo en
  `aprobado`; 401 sin sesión; 403 resto. Patrón `loadAuditAndReport` (404s) ya
  existe en `src/routes/api/audits/[id]/report/[version]/+server.ts`.
- Patrón de descarga (`Content-Disposition: attachment`) ya usado en
  `…/bundle/export/+server.ts` y `…/crm/empresas/export/+server.ts`.

## 2. Endpoint nuevo

**Ruta:** `src/routes/api/audits/[id]/report/[version]/html/+server.ts`
(subruta hermana de las acciones de informe existentes; mismo árbol
`/api/audits/...`, NUNCA público).

**Handler:** `GET`.

```ts
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/server/api/envelope';
import { requireReportReadAccess } from '$lib/server/api/guards';
import { getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { getAuditForReport } from '$lib/server/informe/access';
import { buildInformeRenderModel } from '$lib/server/informe/model';
import { renderInformeHtml } from '$lib/informe/render';
import { informeHtmlFilename } from '$lib/server/informe/download-name';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ params, locals }): Promise<Response> => {
  // 1. Cargar audit + report (404s) — mismo orden que loadAuditAndReport.
  const audit = await getAuditForReport(params.id!);
  if (!audit) return apiError('Auditoría no encontrada', 404);              // R12

  const version = Number(params.version);
  if (!Number.isInteger(version) || version < 1) {
    return apiError('Versión inválida', 404);                              // R13
  }
  const report = await getReportByAuditVersion(audit.id, version);
  if (!report) return apiError('Informe no encontrado', 404);              // R13

  // 2. Control de acceso (401/403) — mismo guard que el detalle de informe.
  const userOrResponse = requireReportReadAccess(locals, audit, report);   // R9, R10
  if (userOrResponse instanceof Response) return userOrResponse;

  // 3. Render reutilizado, idéntico al panel interno (con timestamps de visita, sin editMode).
  let html: string;
  try {
    const timestamps = { startedAt: audit.startedAt, finishedAt: audit.finishedAt }; // R18
    const model = buildInformeRenderModel(report, timestamps);             // R2, R3, R18
    html = renderInformeHtml(model);                                       // R2, R3, R4
  } catch (err) {
    logger.error('informe_html_download_failed', { auditId: audit.id, version }, err);
    return apiError('El informe no se puede descargar todavía', 409);      // R14
  }

  // 4. Entrega como descarga.
  const filename = informeHtmlFilename(report);                            // R7
  return new Response(html, {
    status: 200,                                                           // R8
    headers: {
      'Content-Type': 'text/html; charset=utf-8',                         // R5
      'Content-Disposition': `attachment; filename="${filename}"`         // R6
    }
  });
};
```

Notas:
- **`buildInformeRenderModel(report, timestamps)` con `timestamps`** de la
  auditoría (`audit.startedAt`/`audit.finishedAt`), para incluir el bloque de
  visita (R18) e igualar el panel interno byte a byte (R3). El panel
  (`+page.server.ts`) se cambia en el mismo PR para pasar los mismos
  `timestamps` (sección 4.bis, R19): ambos lados usan el loader
  `getAuditForReport` extendido como única fuente.
- `renderInformeHtml(model)` con opts por defecto → `editMode:false`, igual que
  `<ReportRender {model} />` sin edición (R3).
- Manejo de errores: `apiError` (envelope `{ success:false, data:null, error }`)
  para 404/409; nunca se filtra el stack (R14). El único throw esperable de
  `buildInformeRenderModel` es "El informe no tiene borrador para renderizar"
  (cuando falta `client_draft`) → 409.

## 3. Helper de filename

**Archivo nuevo:** `src/lib/server/informe/download-name.ts`

```ts
import type { AuditReportRow } from '$lib/server/db/informe-reports';
import { tipoAuditoria } from '$lib/server/informe/tipo';

/** kebab-case ASCII: minúsculas, sin acentos, [^a-z0-9] → '-', colapsa guiones. */
export function slugify(input: string): string {
  const ascii = input.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const slug = ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'cliente';                                               // R7
}

/** `YYYY-MM-DD_informe_<cliente-slug>_<tipo>_vN.html` (convención del repo, R7). */
export function informeHtmlFilename(report: AuditReportRow): string {
  const closed = report.canonicalJson.closed_at;
  const date = (closed ? new Date(closed) : new Date()).toISOString().slice(0, 10);
  const cliente = slugify(report.canonicalJson.client.razon_social ?? '');
  const tipo = tipoAuditoria(report.canonicalJson.types);   // 'erp' | 'it' | 'mixta'  (R7)
  return `${date}_informe_${cliente}_${tipo}_v${report.version}.html`;
}
```

- Se deriva del `canonicalJson` del `report` (fuente estable; mismo que alimenta
  el modelo), no del `InformeRenderModel`, para no depender de strings ya
  formateados (`fechaInforme` es texto largo en español).
- **Token de tipo (R7):** se reusa `tipoAuditoria(canonical.types)` de
  `src/lib/server/informe/tipo.ts` (misma función que ya alimenta
  `model.tipoAuditoria`), devolviendo `it` / `erp` / `mixta`. Estos tres valores
  ya son ASCII en kebab-safe, así que no requieren slugify. Reemplaza al literal
  fijo `auditoria` anterior. Ej.: `2026-06-02_informe_playadito_it_v3.html`.
- `slugify` se aísla para testearlo en unidad (acentos, símbolos, vacío).

## 3.bis. Timestamps de visita: loader compartido + panel (R18, R19, R20)

Para que la visita aparezca en la descarga **y** en el panel sin duplicar la
fuente de datos, se centraliza la lectura de `started_at`/`finished_at` en el
loader `getAuditForReport`, que ambos lados ya usan.

**Archivo:** `src/lib/server/informe/access.ts` — **modificar**

`getAuditForReport` hoy devuelve `{ id, status, assignedTechId }` y su SELECT no
trae los timestamps. Se extiende el tipo y el SELECT:

```ts
export type AuditForReport = {
  id: string;
  status: string;
  assignedTechId: string | null;
  startedAt: Date | null;    // nuevo
  finishedAt: Date | null;   // nuevo
};

// SELECT id, status, assigned_tech_id, started_at, finished_at FROM audit …
// return { …, startedAt: row.started_at, finishedAt: row.finished_at }
```

**Archivo:** `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts`
— **modificar**

El loader del panel ya tiene `audit` (de `getAuditForReport`) y `report`. Se
cambia la única llamada al modelo para pasar los timestamps, igual que el
endpoint de descarga:

```ts
model:
  report.clientDraft && (report.status === 'borrador' || report.status === 'aprobado')
    ? buildInformeRenderModel(report, {
        startedAt: audit.startedAt,
        finishedAt: audit.finishedAt
      })
    : null
```

- Con esto, `<ReportRender {model} />` pinta el bloque de visita en el panel y el
  string coincide byte a byte con la descarga (R3, R19).
- SI `audit.finishedAt` es null, `buildInformeRenderModel` deja `visita`
  `undefined` y ambos lados omiten el bloque (R20). No hay rama extra que escribir.
- No se toca `report-render.svelte` ni el render.

## 4. Botón en el panel de versión

**Archivo:** `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte`

Se agrega un enlace en la barra de acciones existente (junto a "Vista de
impresión", líneas ~140-142), **solo cuando hay modelo** (status `borrador` o
`aprobado`), satisfaciendo R15/R16:

```svelte
{#if model}
  <a
    href="{base}/{data.version}/html"
    class="sys-btn-secondary"
    data-testid="descargar-html"
  >
    Descargar HTML
  </a>
{/if}
```

- `base` ya existe: `` $derived(`/api/audits/${data.auditId}/report`) `` →
  el href resuelve a `/api/audits/<id>/report/<version>/html`.
- Es un `<a href>` directo (no `fetch`): el navegador respeta
  `Content-Disposition: attachment` y baja el archivo. El download lo cubre el
  header del servidor; no hace falta atributo `download` ni JS.
- Va dentro del bloque `{:else}` (status renderizable), donde `model` puede
  existir. R16 lo refuerza con `{#if model}`.
- No se toca `report-render.svelte` ni el resto del panel.

## 5. Tabla de archivos a tocar

| Archivo | Acción | Cubre |
|---|---|---|
| `src/routes/api/audits/[id]/report/[version]/html/+server.ts` | **crear** — handler GET de descarga (pasa timestamps al modelo) | R1–R6, R8–R14, R18 |
| `src/lib/server/informe/download-name.ts` | **crear** — `slugify` + `informeHtmlFilename` (token de tipo) | R7 |
| `src/lib/server/informe/access.ts` | **modificar** — `getAuditForReport` devuelve `startedAt`/`finishedAt` | R18, R19 |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` | **modificar** — pasar `timestamps` a `buildInformeRenderModel` (visita en el panel) | R19, R20 |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` | **modificar** — botón "Descargar HTML" | R15, R16 |
| `tests/api/report-html-download.test.ts` | **crear** — integración endpoint (200, headers, cuerpo, acceso, errores, visita) | R2–R14, R18, R20 |
| `tests/informe-download-name.test.ts` | **crear** — unit del filename/slug/tipo | R7 |

## 6. Qué NO se toca (no-regresión, R17)

- `src/lib/informe/render.ts`, `render-erp.ts`, `render-it.ts`,
  `render-mixto.ts`, `render-shared.ts`, `web-render.ts` — render intacto.
- `src/lib/server/scoring/` — scoring intacto.
- `src/lib/server/informe/model.ts` — `buildInformeRenderModel` se **reusa** con
  su 2º argumento `timestamps` ya existente (firma sin cambios); no se modifica.
- `src/lib/server/informe/tipo.ts` — `tipoAuditoria` se **reusa** para el token
  de tipo del filename; no se modifica.
- `migrations/**` — la columna `started_at`/`finished_at` ya existe
  (`018_hora_inicio_fin.sql`); no se crea migración nueva.
- `src/routes/(app)/informe/[token]/**` y `src/lib/server/db/informe-shares.ts`
  — share público intacto; no se crea vía pública nueva (R11).
- `src/lib/components/informe/report-render.svelte` — sin cambios.

## 7. Errores reutilizados

- `apiError(message, status)` (`$lib/server/api/envelope`) — envelope estándar
  para 404/409.
- `requireReportReadAccess` (`$lib/server/api/guards`) — 401/403 ya tipados.
- No se introducen clases de error nuevas.

## 8. Alternativa descartada

- **Construir el HTML en el cliente (`+page.svelte`) con un Blob y
  `URL.createObjectURL`.** Descartada: el modelo ya vive en `PageData` y se
  podría serializar, pero (a) duplicaría la lógica de filename en el cliente,
  (b) no aplicaría el guard server-side a la descarga como recurso propio, y
  (c) se aleja del patrón de descarga del repo (`bundle/export`,
  `empresas/export`), que es server GET con `Content-Disposition`. El endpoint
  server es más simple de testear (status + headers + cuerpo) y consistente.
- **Reusar el endpoint detalle `…/report/[version]` con un query `?format=html`.**
  Descartada: ese handler devuelve envelope JSON (`apiSuccess`) y mezclar dos
  content-types en un handler complica el guard y los tests. Una subruta `/html`
  dedicada es más legible y aislada.
