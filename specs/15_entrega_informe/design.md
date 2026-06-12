# Design — #15 15_entrega_informe

## Alcance

Entrega del informe aprobado (#14) al cliente final: link público de solo lectura con token
opaco revocable y con expiración (patrón briefing), vista web según
`template_informe_web_v2.html` (gauge animado, score-rows, reveal on scroll), embed Loom,
vista PDF print branded reutilizando el render A4 de #14, registro de enviado y contador de
vistas en backoffice.

| Incluido (MVP) | Excluido |
|---|---|
| Tabla `audit_report_share` (token, expiración, revocación, vistas) | PDF server-side (puppeteer) |
| API admin: generar / regenerar / revocar / consultar share | Envío automático mail/WhatsApp |
| Ruta pública `/informe/[token]` (web v2) + `/informe/[token]/imprimir` (A4) | Analytics finos / identificación del visitante |
| Embed Loom en la vista web pública | Múltiples links activos por informe |
| Contador de vistas + primera/última vista | Password/PIN en el link |
| noindex + rate limit por IP en ruta pública | Publicación CDN estática |

## Dependencias (todas `done`)

| Feature | Contrato usado |
|---|---|
| `14_informe_ia` (#14) | `audit_report` (`status = 'aprobado'`, `client_draft`, `loom_url`), `getReportByAuditVersion`/`getReportById` (`src/lib/server/db/informe-reports.ts`), `buildInformeRenderModel` (`src/lib/server/informe/model.ts` — ya aplica `stripInternalFindings`), `report-render.svelte` + `src/lib/informe/render.ts` (render A4), `getAuditForReport` + `informeErrorResponse` (`access.ts`), `requireAdminApi` (`src/lib/server/api/guards.ts`) |
| `05_briefing_externo` (#5) | Patrón token público: `randomBytes(32).toString('base64url')` (`src/lib/server/backoffice/briefing-link.ts`), mensaje «Este enlace ya no está disponible» (`briefing-token.ts`), rate limit por IP (`src/lib/server/briefing/rate-limit.ts`), layout público sin chrome (`src/routes/briefing/`) |
| `11_ui_branding_sys` | Tokens `--sys-*` (`src/lib/styles/brand.css`), Montserrat ya servida |
| Template oficial | `docs/plantillas/informe/template_informe_web_v2.html` — contrato visual de la vista web (secciones 01–05, hero con gauge, prog bar, reveal, CTA). No se modifica: el componente Svelte lo implementa |

Modelo de referencia externo: share links de presupuestossys (token por documento, regenerar
revoca, contador de vistas) — misma semántica, adaptada al patrón briefing ya existente acá.

## Arquitectura

```
revisión informe (admin, status = aprobado)
        │  POST /api/audits/[id]/report/[version]/share   { expires_in_days }
        ▼
TX: UPDATE share activo → revoked_at = now()   (si existe, R5)
    INSERT audit_report_share (token 256 bits, expires_at, created_by)   (R3, R7)
        │  → { url: PUBLIC_APP_URL/informe/<token>, ... }
        ▼
admin copia y envía el link por su canal (mail/WhatsApp manual)
        │
        ▼
cliente abre GET /informe/[token]            (sin auth)
   resolveShareByToken: existe + !revoked + !expirado + report aprobado   (R1, R2)
   ├─ inválido → pantalla amable 404 (sin filtrar causa)                  (R2)
   └─ válido  → registerView (view_count++, first/last_viewed_at)         (R9)
               → buildInformeRenderModel(report)  [stripInternalFindings] (R12)
               → report-web-render.svelte (template v2 + Loom)            (R10, R11)
               → link «Descargar PDF» → /informe/[token]/imprimir         (R13)
backoffice: GET share → url, enviado por/cuándo, vistas, estado           (R8, R9)
            DELETE share → revoked_at                                     (R6)
```

Capas: DB (`src/lib/server/db/informe-shares.ts`), dominio
(`src/lib/server/informe/share.ts`), API admin bajo el segmento existente
`/api/audits/[id]/report/[version]/`, rutas públicas top-level `src/routes/informe/[token]/`
(hermanas de `src/routes/briefing/`, fuera del grupo `(app)`).

## Cambios de schema (migración `006_entrega_informe.sql`)

### `audit_report_share`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| report_id | uuid NOT NULL FK → audit_report | el share es por informe (versión), no por auditoría |
| token | text NOT NULL UNIQUE | `randomBytes(32).toString('base64url')` — 256 bits |
| expires_at | timestamptz | NULL = sin vencimiento (R7) |
| revoked_at | timestamptz | NULL = activo; nunca se borra la fila (R6) |
| created_by | uuid NOT NULL FK → app_user | «enviado por» (R8) |
| created_at | timestamptz NOT NULL default now() | «enviado cuándo» (R8) |
| view_count | int NOT NULL default 0 CHECK (view_count >= 0) | (R9) |
| first_viewed_at | timestamptz | solo primera carga exitosa (R9) |
| last_viewed_at | timestamptz | (R9) |

```sql
CREATE UNIQUE INDEX audit_report_share_active_uq
  ON audit_report_share (report_id) WHERE revoked_at IS NULL;   -- un activo por informe (R3)
CREATE INDEX audit_report_share_report_idx ON audit_report_share (report_id);
-- token ya tiene índice por UNIQUE; el lookup público es por token.
```

Sin UPDATE de `token` ni DELETE de filas: regenerar = revocar + insertar (historial de envíos
queda trazable). El índice único parcial es la red de seguridad de «un activo por informe»;
la transacción de regeneración lo hace atómico.

## Archivos a crear/modificar

### Migración y DB

| Archivo | Propósito |
|---|---|
| `migrations/006_entrega_informe.sql` | Tabla `audit_report_share` + índices (R3, R6, R9) |
| `src/lib/server/db/informe-shares.ts` | `createShareRevokingPrevious` (TX: revoca activo + INSERT, R3/R5), `getActiveShareByReport`, `listSharesByReport`, `findShareByToken` (join a `audit_report.status`), `revokeShare` (UPDATE `revoked_at` WHERE activo), `registerShareView` (UPDATE atómico `view_count + 1`, `COALESCE(first_viewed_at, now())`, `last_viewed_at = now()`, R9) |

### Dominio (`src/lib/server/informe/`)

| Archivo | Propósito |
|---|---|
| `share.ts` | `generateShareToken()` (patrón briefing), `computeExpiresAt(days)` (R7), `buildShareUrl(token)` (`PUBLIC_APP_URL/informe/<token>`), `resolveShareByToken(token)` → `{ ok: true, share, report } \| { ok: false }` — valida no revocado, no expirado y `report.status === 'aprobado'` sin distinguir causa hacia afuera (R1, R2); `createReportShare(reportId, userId, expiresInDays)` con guard `aprobado` (R4) |
| `schemas.ts` (extender) | `createShareSchema = z.object({ expires_in_days: z.number().int().min(1).max(365).nullable().default(90) }).strict()` (R7) |
| `errors.ts` (extender) | `InformeShareNotFoundError` (404), `InformeReportNotApprovedError` (`INFORME_REPORT_NOT_APPROVED`, 409) — mapeados en `informeErrorResponse` |

`INFORME_SHARE_DEFAULT_DAYS = 90` como constante de dominio (no env): default del schema Zod,
visible en la UI como preselección.

### API routes (solo admin, envelope estándar, guard `requireAdminApi`)

| Ruta | Método | Propósito | Códigos |
|---|---|---|---|
| `/api/audits/[id]/report/[version]/share` | POST | Generar link; si hay activo lo revoca y crea nuevo (R3, R5, R7) | 201 · 400 (Zod) · 401 · 403 · 404 · 409 (status ≠ aprobado, R4) |
| `/api/audits/[id]/report/[version]/share` | GET | Share actual (o último) + historial: url, created_by_name, created_at, expires_at, revoked_at, view_count, first/last_viewed_at, estado derivado `activo\|revocado\|expirado` (R8, R9) | 200 (data `null` si nunca hubo) · 401 · 403 · 404 |
| `/api/audits/[id]/report/[version]/share` | DELETE | Revocar el activo (R6) | 200 · 401 · 403 · 404 (sin activo) |

El segmento ya valida auditoría (`getAuditForReport`) y reporte (`getReportByAuditVersion`)
como las rutas hermanas de #14; errores vía `informeErrorResponse`.

### Rutas públicas (sin auth, fuera de `(app)`, patrón `src/routes/briefing/`)

| Archivo | Propósito |
|---|---|
| `src/routes/informe/[token]/+layout.svelte` | Layout público mínimo: sin nav de app, fondo dark del template, meta `robots noindex,nofollow` (R14) |
| `src/routes/informe/[token]/+page.server.ts` | Rate limit por IP (reuso patrón `briefing/rate-limit.ts` → 429, R14), `resolveShareByToken`; inválido → `error(404, ...)` con pantalla amable; válido → `registerShareView` + `buildInformeRenderModel(report)` (R1, R2, R9); header `X-Robots-Tag` vía `setHeaders` |
| `src/routes/informe/[token]/+page.svelte` | Monta `report-web-render.svelte` + botón flotante/CTA «Descargar PDF» → `informe/[token]/imprimir` (R10, R13) |
| `src/routes/informe/[token]/+error.svelte` | Pantalla amable branded: «Este enlace ya no está disponible», contacto SyS (R2) |
| `src/routes/informe/[token]/imprimir/+page.server.ts` | Misma validación (sin registrar vista doble — decisión: imprimir NO incrementa `view_count`, ya contó la vista web; si se entra directo sí cuenta — flag `from` no: simplificar, imprimir SÍ cuenta como vista. Ver open question 3) |
| `src/routes/informe/[token]/imprimir/+page.svelte` | `report-render.svelte` (A4 de #14, sin cambios) + botón «Descargar PDF» (`window.print()`) visible solo pantalla, `@media print` ya provisto por el componente (R13) |

### UI backoffice

| Archivo | Propósito |
|---|---|
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` (extender) | Cargar share actual si `status = 'aprobado'` y rol admin |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` (extender) | Montar sección «Entrega al cliente» visible solo admin + `aprobado` |
| `src/lib/components/informe/share-panel.svelte` | Panel: generar link (selector expiración 30/90/365 días/sin vencimiento, default 90), URL con botón copiar, estado (activo/revocado/expirado), enviado por/cuándo, vistas (`view_count`, primera/última), acciones Regenerar (confirm: invalida el anterior) y Revocar (R5, R6, R8, R9) |
| `src/lib/components/informe/report-web-render.svelte` | Componente del template web v2 (detalle abajo, R10, R11, R12) |
| `src/lib/client/informe/web-effects.ts` | Efectos client-side del template: scroll progress, IntersectionObserver de `.reveal`, `animateCount`, animación del gauge (portado del `<script>` del template; testeable la parte pura: color/badge por semáforo, dashoffset) |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/informe-share.test.ts` | R3 (token 43 chars base64url, unicidad), R7 (`computeExpiresAt`), lógica `resolveShareByToken` (revocado/expirado/no aprobado) |
| `tests/informe-web-render.test.ts` | R10 (snapshot: hero, gauge canónico, secciones 01–05, score-rows del snapshot, `data-count`, `.reveal`, tokens `--sys-*`, footer confidencial), R11 (Loom con/sin), R12 (sin textos internos) |
| `tests/api/informe-share-admin.test.ts` | R3, R4 (401/403/409), R5 (regenerar revoca), R6 (DELETE), R7 (400 Zod), R8 (metadatos GET), R9 (stats en GET) |
| `tests/api/informe-share-public.test.ts` | R1 (200 sin sesión), R2 (404 amable indistinguible, sin datos), R5/R6 (token viejo 404), R7 (expirado 404), R9 (contador, fallidas no cuentan), R12 (HTML sin internal), R13 (imprimir 200/404), R14 (noindex, 429) |
| `e2e/entrega-informe.spec.ts` | R16 (aprobar → compartir → ver sin sesión → vistas en backoffice → revocar → amable), R8, R13 |

Fixtures: reutilizar el golden canónico y el flujo Claude fake (`INFORME_FAKE=1`) de #14 para
llegar a `aprobado` en e2e.

## Firmas principales

```typescript
// src/lib/server/informe/share.ts
export const INFORME_SHARE_DEFAULT_DAYS = 90;

export function generateShareToken(): string;          // randomBytes(32).toString('base64url')
export function computeExpiresAt(days: number | null, now?: Date): Date | null;   // R7
export function buildShareUrl(token: string): string;  // `${PUBLIC_APP_URL}/informe/${token}`

export async function createReportShare(input: {
  reportId: string;
  createdBy: string;
  expiresInDays: number | null;
}): Promise<AuditReportShareRow>;
// guard: report.status === 'aprobado' → InformeReportNotApprovedError (409, R4)
// TX: revoca activo previo + INSERT nuevo (R5); UNIQUE parcial como red (R3)

export type ShareResolution =
  | { ok: true; share: AuditReportShareRow; report: AuditReportRow }
  | { ok: false };   // causa NO expuesta (R2); log server-side con la razón

export async function resolveShareByToken(token: string): Promise<ShareResolution>;

// src/lib/server/db/informe-shares.ts
export type AuditReportShareRow = {
  id: string; reportId: string; token: string;
  expiresAt: Date | null; revokedAt: Date | null;
  createdBy: string; createdAt: Date;
  viewCount: number; firstViewedAt: Date | null; lastViewedAt: Date | null;
};
export async function registerShareView(shareId: string): Promise<void>;
// UPDATE ... SET view_count = view_count + 1,
//   first_viewed_at = COALESCE(first_viewed_at, now()), last_viewed_at = now()  (R9, atómico)
```

## Render web (`report-web-render.svelte`) — mapeo template v2

Mismo criterio que el A4 de #14: el componente implementa el HTML/CSS del template; los datos
salen de `InformeRenderModel` (sin cambios de tipo — ya trae todo lo necesario).

| Template v2 | Fuente |
|---|---|
| Hero: logo `sys_vertical_w.png` (CDN R2, misma URL que #14) | Fijo |
| Hero: tag «Auditoría ERP · [MES AÑO]» | `tipoAuditoria` + `periodo` |
| Hero: cliente / CUIT / meta fecha+sistema | `cliente.*`, `fechaInforme`, `sistema` |
| Hero: gauge animado (color, badge, número) | Canónico: `draft.indices` (sobrescritos en #14) + `indexToSemaphore`; mapeo `green→verde/ok`, `amber→naranja/warn`, `red→rojo/bad` (mismos umbrales 40/70) |
| [NUEVA] Sección Loom (hero → resumen) | `loomUrl` → iframe embed; ausente → no se renderiza (R11) |
| 01 resumen: lead, interpretación, recomendación, fortalezas | `draft.resumen.*` |
| 01 cards `data-count`: índice / circuitos con controles / módulos | Canónico (índice, módulos) + `draft.resumen.circuitos_con_controles` (null → card omitida; el informe ya pasó revisión humana) |
| 02 score-rows: nombre, `[doc] · [controles] · [madurez]`, barra + valor | `secciones` (score/semáforo del snapshot, R12 estructural) + `draft.hallazgos.circuitos` join por `seccion_code`; solo secciones presentes en el draft (el template trae 9 fijas de ejemplo) |
| 02 legend | `draft.hallazgos.lectura_transversal` (título de la primera o concatenación corta — implementer: usar los 3–4 items como bloques, fiel al patrón visual) |
| 03 riesgos: cards numeradas + evidencia | `draft.riesgos.*` |
| 04 día a día | `draft.dia_a_dia.*` («hoy N/100» del snapshot vía `seccion_code`) |
| 05 plan: etapas, necesitamos/no incluye | `draft.plan.*` |
| CTA: mailto con subject `[CLIENTE]`, contacto SyS, footer confidencial | Fijo + `cliente.razonSocial`, `periodo` |
| Efectos: prog bar, reveal, counters, gauge | `web-effects.ts` (onMount; sin dependencia externa) |

El `@import` de Google Fonts del template no se replica (Montserrat ya servida, #11). Paleta
1:1 con tokens `--sys-*` (verificado en #14, mismo set de colores).

## Errores de dominio (extensión `errors.ts`)

| Clase | code | HTTP |
|---|---|---|
| `InformeShareNotFoundError` | `INFORME_SHARE_NOT_FOUND` | 404 (DELETE sin activo, R6) |
| `InformeReportNotApprovedError` | `INFORME_REPORT_NOT_APPROVED` | 409 (POST share sobre no aprobado, R4) |

Ruta pública: nunca lanza errores tipados hacia el cliente — toda falla de resolución es el
mismo `error(404)` con la pantalla amable (R2); la causa real se loggea server-side.

## Variables de entorno

Ninguna nueva obligatoria. Se reutiliza `PUBLIC_APP_URL` (ya existe para el link de briefing).
El default de expiración es constante de dominio (90 días), no env — cambiarlo es decisión de
producto, no de despliegue.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Token firmado (JWT/HMAC) como dice el description | Revocación y contador exigen DB en cada hit igual; un token opaco de 256 bits es imposible de enumerar y es el patrón briefing ya validado. La firma agregaría gestión de secreto sin quitar ninguna consulta. «Firmado» se interpreta como «no adivinable ni manipulable» — cumplido (open question 1 para la puerta) |
| PDF server-side (puppeteer/playwright en el contenedor) | Misma decisión que #14: dependencia pesada (~300 MB) en la imagen Docker para un volumen bajísimo; `@media print` del render A4 produce el mismo PDF desde el navegador del cliente o del admin. Si un cliente real no logra imprimir, se reabre como feature propia |
| Share por auditoría (token sobre la última versión aprobada) | El cliente debe ver exactamente la versión que el admin decidió enviar; un share por `report_id` congela eso. Enviar una versión nueva = generar link de esa versión (y revocar el viejo si corresponde) |
| Múltiples links activos por informe (por destinatario) | Sin caso de uso hoy (un interlocutor por cliente); complica revocación y métricas. El índice único parcial lo deja explícito |
| Columna `public_token` en `audit_report` (patrón briefing literal) | Mezcla ciclo de vida: el share tiene metadatos propios (expiración, vistas, revocación, historial de envíos) que no son del informe; tabla aparte mantiene `audit_report` inmutable post-aprobación (R23 de #14) |
| Tabla de eventos `audit_report_view` (una fila por vista) | Para «primera vez + contador» alcanzan 3 columnas con UPDATE atómico; el log evento-a-evento es analytics fuera de alcance |
| Dedupe de vistas por IP/cookie | Aproximado y frágil (NAT, modo incógnito); el contador simple comunica «lo abrieron y cuántas veces», que es lo que pide el acceptance |
| Reusar `report-render.svelte` (A4) también para la vista web | El contrato visual web es otro template (scroll continuo, animaciones, CTA); forzar el A4 a web daría una página de 7 hojas sin los efectos. Se comparte el view-model, no el markup |
| Servir el HTML como archivo estático publicado en R2/CDN | Pierde revocación inmediata, expiración y contador server-side; además los logos/fonts ya resuelven desde la app. La app es el origen |
| Rate limit con infraestructura nueva (redis) | El patrón in-memory de `briefing/rate-limit.ts` ya está y la app corre en un solo proceso (decisión #10 deploy) |

## Open questions (puerta humana)

1. **«Token firmado» del description:** se propone token opaco aleatorio de 256 bits en DB
   (patrón briefing) en lugar de JWT/HMAC. ¿OK con esta interpretación?
2. **Default de expiración:** propuesto 90 días, opciones 30/90/365/sin vencimiento.
   ¿Confirmás el default y el set de opciones?
3. **Conteo de vistas en `/imprimir`:** propuesto que la vista de impresión pública también
   incremente el contador (es una vista real del cliente; evita lógica de dedupe). ¿OK, o
   preferís contar solo la vista web?
4. **Card «circuitos con controles» en la vista web:** si el campo quedó `null` tras la
   revisión humana (placeholder «a editar» del A4 nunca debería llegar aprobado, pero el
   schema lo permite), la vista pública omite la card en vez de mostrar el placeholder.
   ¿OK? (Alternativa: bloquear approve en #14 con el campo en null — tocaría #14, no
   recomendado acá.)
5. **PDF:** ¿confirmás print-optimizado (botón «Descargar PDF» → `window.print()` sobre el
   render A4) sin PDF server-side en esta feature?
6. **Revocación al regenerar versión del informe (#14):** si el admin regenera y aprueba una
   versión nueva, el link de la versión vieja sigue activo hasta que lo revoque manualmente o
   genere link de la nueva. ¿Querés auto-revocar los shares de versiones anteriores al
   aprobar una nueva? (Propuesto: NO auto-revocar — explícito mejor que mágico; el panel
   muestra el estado.)
