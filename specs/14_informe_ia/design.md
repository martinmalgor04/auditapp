# Design — #14 14_informe_ia

## Alcance

Pipeline en-app que toma el JSON canónico de una auditoría `cerrada` (#9), genera un borrador
estructurado de informe con la API de Claude (job asíncrono), exige revisión/edición/aprobación
humana de un admin, y renderiza HTML branded SyS apto impresión a PDF. La salida interna
(recomendaciones de presupuesto + `upsell_findings`) vive en una vista separada que nunca toca
el informe cliente.

| Incluido (MVP) | Excluido (fase 2 — ver requirements) |
|---|---|
| Tabla `audit_report` versionada con snapshot canónico | RAG Tango como contexto del prompt |
| Job async in-process + guard de timeout | Publicación CDN con token público |
| Adapter Claude (`@anthropic-ai/sdk`, salida estructurada) | PDF server-side (MVP: imprimir desde navegador) |
| Schemas Zod strict cliente + interno | Envío automático al cliente (mail/WhatsApp) |
| Prompt versionado con reglas SyS (jerga, líneas/rangos) | Benchmark del rubro |
| UI revisión: edición por sección, retry, regenerar, aprobar | Few-shot con informes previos / catálogo precios |
| Edición inline por bloque sobre el render + autosave con historial (`audit_report_edit`) | Edición del borrador por chat con IA (segunda iteración) |
| Render imprimible = template A4 oficial, tokens `--sys-*`, logos CDN R2, Loom solo pantalla | Template IT propio → feature #19 `19_template_informe_it` |
| Técnico asignado: lectura del render `aprobado` | Render web interactivo (`template_informe_web_v2.html` → feature #15) |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `08_cierre_scoring` (#8) | `indexToSemaphore` (`src/lib/server/scoring/semaphore.ts`), auditoría llega a `cerrada` |
| `09_contrato_datos` (#9) | `buildCanonicalAuditJson(auditId, { allowOpen: false })` (`src/lib/server/canonical/build.ts`), `CANONICAL_SCHEMA_VERSION` (`version.ts`), `assertSchemaVersionMatchesConstant` y tipos (`schema.ts`), `stripInternalFindings` (`preview.ts`) |
| `03_auth_roles` (#3) | Sesión en `locals.user`, rol `admin` |
| `11_ui_branding_sys` (#11 / id 10) | Tokens `--sys-*` en `src/lib/styles/brand.css` |
| Template oficial | `docs/plantillas/informe/template_informe_pdf_a4_v1.html` — contrato visual del render imprimible (estructura de 7 páginas, clases, gauge, semáforos). No se modifica desde código: el componente Svelte lo implementa |

**Prerrequisito duro:** #3, #8, #9, #11 en `done` (lo están).

## Arquitectura

```
auditoría cerrada (detalle admin)
        │  POST /api/audits/[id]/report
        ▼
INSERT audit_report (version = max+1, status = pendiente,
                     canonical_json snapshot + schema_version)
        │  respuesta inmediata { report_id, version, status: 'pendiente' }   (R6)
        │
        ▼ (background, fire-and-forget)
runInformePipeline(reportId)
        │  pendiente → generando                                              (R7)
        │  1. valida snapshot: schema_version == CANONICAL_SCHEMA_VERSION     (R5)
        │  2. prompt = buildInformePrompt(canonical)  [versionado]            (R9)
        │  3. Claude API: model env, output_config.format (JSON schema Zod)   (R8)
        │  4. valida reportClientDraftSchema + reportInternalDraftSchema      (R10, R11)
        │  5. sobrescribe índices/semáforos con canónico (indexToSemaphore)   (R12)
        │  6. persiste drafts → generando → borrador                          (R24)
        │      └─ fallo en 3/4 → generando → error + error_message            (R13)
        ▼
UI revisión (admin): polling /status                                          (R15)
   editar por sección (PATCH) · regenerar (nueva versión) · retry (error)
        │  aprobar (acción humana explícita)                                  (R23)
        ▼
borrador → aprobado (inmutable) ──► render imprimible branded (+ Loom)        (R25, R26)
```

Capas (`docs/architecture.md`):

- `src/lib/server/db/informe-reports.ts` — SQL parametrizado (postgres.js).
- `src/lib/server/informe/` — dominio: máquina de estados, pipeline, adapter, schemas, prompts.
- `src/routes/api/audits/[id]/report/` — API JSON (mismo segmento `[id]` que `export`).
- `src/routes/(app)/auditorias/[id]/informe/` — UI revisión y render.

## Cambios de schema (migración `004_informe_ia.sql`)

### `audit_report`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| audit_id | uuid NOT NULL FK → audit | |
| version | int NOT NULL CHECK (version >= 1) | incremental por auditoría |
| status | text NOT NULL default `'pendiente'` | CHECK (status IN ('pendiente','generando','borrador','aprobado','error')) |
| canonical_json | jsonb NOT NULL | snapshot del insumo consumido (R4) |
| schema_version | text NOT NULL | del snapshot, ej. `'1.0'` |
| client_draft | jsonb | NULL hasta `borrador` (R13) |
| internal_draft | jsonb | NULL hasta `borrador` (R13) |
| prompt_version | text | persistido al correr el pipeline (R9) |
| model | text | ídem (R9) |
| error_message | text | no vacío cuando `status = 'error'` (R13) |
| loom_url | text | URL Loom validada con Zod, editable solo en `borrador` (R25) |
| requested_by | uuid NOT NULL FK → app_user | admin que disparó |
| edited_by | uuid FK → app_user | última edición humana (R20) |
| edited_at | timestamptz | ídem |
| approved_by | uuid FK → app_user | (R23) |
| approved_at | timestamptz | (R23) |
| created_at | timestamptz NOT NULL default now() | |
| updated_at | timestamptz NOT NULL default now() | el guard de timeout compara contra esta columna (R14) |

Constraints e índices:

```sql
CONSTRAINT audit_report_audit_version_uq UNIQUE (audit_id, version),
CONSTRAINT audit_report_status_check CHECK (
  status IN ('pendiente', 'generando', 'borrador', 'aprobado', 'error')
),
CONSTRAINT audit_report_approved_coherence CHECK (
  status <> 'aprobado' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
),
CONSTRAINT audit_report_error_coherence CHECK (
  status <> 'error' OR (error_message IS NOT NULL AND error_message <> '')
);

CREATE INDEX audit_report_audit_idx ON audit_report (audit_id);
CREATE INDEX audit_report_inflight_idx ON audit_report (status, updated_at)
  WHERE status IN ('pendiente', 'generando');
```

`version` se asigna de forma atómica en el INSERT (`SELECT COALESCE(MAX(version), 0) + 1 ...`
en la misma sentencia) para evitar carreras entre dos POST concurrentes; la UNIQUE actúa de
red de seguridad (retry simple si colisiona).

### `audit_report_edit` (historial de ediciones, R31)

Adaptación del modelo de versiones append-only de presupuestossys: ahí cada guardado crea una
«versión» del documento; acá `audit_report.version` ya significa *generación* (regenerar =
`version + 1`, R21), así que el historial de ediciones vive en una tabla aparte.
`audit_report.client_draft` es siempre el estado vigente; las entradas son inmutables.

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| report_id | uuid NOT NULL FK → audit_report | |
| seq | int NOT NULL CHECK (seq >= 1) | incremental por report, atómico como `version` |
| client_draft | jsonb NOT NULL | snapshot del draft resultante de la edición |
| change_summary | text NOT NULL | `'Edición inline'` (futuro: `'Edición con IA'`) |
| edited_by | uuid NOT NULL FK → app_user | |
| edited_at | timestamptz NOT NULL default now() | |

```sql
CONSTRAINT audit_report_edit_seq_uq UNIQUE (report_id, seq);
CREATE INDEX audit_report_edit_report_idx ON audit_report_edit (report_id);
```

Sin límite de retención (decisión puerta: versiones ilimitadas). Solo INSERT y SELECT — no
existe UPDATE ni DELETE en la capa DB.

## Máquina de estados (`src/lib/server/informe/state.ts`)

```
pendiente ──► generando ──► borrador ──► aprobado
                  │  ▲
                  ▼  │ (retry, R22)
                 error
```

```typescript
export type InformeStatus = 'pendiente' | 'generando' | 'borrador' | 'aprobado' | 'error';

const VALID_TRANSITIONS: Record<InformeStatus, readonly InformeStatus[]> = {
  pendiente: ['generando'],
  generando: ['borrador', 'error'],
  error: ['generando'],
  borrador: ['aprobado'],
  aprobado: []
};

export function assertInformeTransition(from: InformeStatus, to: InformeStatus): void;
// lanza InformeInvalidTransitionError (R7); no existe generando→aprobado (R24)
```

`updateReportStatus` en la capa DB ejecuta `UPDATE ... WHERE id = $1 AND status = $2(from)` y
verifica `count = 1` — la transición es atómica también ante concurrencia (dos retries
simultáneos: uno gana, el otro recibe `InformeInvalidTransitionError`).

`aprobado` es terminal e inmutable: ni PATCH, ni retry, ni re-approve (R23). Regenerar nunca
muta una fila: crea `version + 1` (R21).

## Archivos a crear/modificar

### Migración y DB

| Archivo | Propósito |
|---|---|
| `migrations/004_informe_ia.sql` | Tabla `audit_report` + constraints + índices |
| `migrations/004_informe_ia.sql` (cont.) | Tabla `audit_report_edit` + UNIQUE `(report_id, seq)` (R31) |
| `src/lib/server/db/informe-reports.ts` | insert (version atómica), get por audit+version, list por audit, `updateReportStatus` (transición atómica), saveDrafts, saveClientDraftEdit, saveLoomUrl, approve, `expireStaleGenerating`, `appendEditEntry` (seq atómico) y `listEditHistory` (R31) |

### Dominio informe (`src/lib/server/informe/`)

| Archivo | Propósito |
|---|---|
| `state.ts` | `InformeStatus`, `assertInformeTransition` (R7) |
| `errors.ts` | Errores tipados de dominio (tabla abajo) |
| `schemas.ts` | `reportClientDraftSchema` (strict), `reportInternalDraftSchema` (strict), `loomUrlSchema`, `patchReportSchema` (R10, R11, R16, R25) |
| `prompts/generate-report.ts` | `INFORME_PROMPT_VERSION`, `buildInformePrompt(canonical)` — jerga prohibida (R19), regla líneas/rangos sin producto cerrado (R18) |
| `claude.ts` | Adapter `@anthropic-ai/sdk`: cliente, modelo de env, `output_config.format`, errores tipados (R3, R8) |
| `pipeline.ts` | `runInformePipeline(reportId)` + `createReport(auditId, userId)` — orquestación completa (R5, R6, R12, R13, R24) |
| `guard.ts` | `expireStaleGenerating(reportRow)` — timeout `generando` (R14) |

### API routes (operaciones solo admin; lectura de `aprobado` también técnico asignado — R1)

| Ruta | Método | Propósito | Códigos |
|---|---|---|---|
| `/api/audits/[id]/report` | POST | Crear versión + disparar pipeline (también «regenerar», R21) | 201 · 401 · 403 · 404 · 409 (no cerrada, R2) · 503 (sin `ANTHROPIC_API_KEY`, R3) |
| `/api/audits/[id]/report` | GET | Listar versiones (version, status, fechas, approved_by) (R27) | 200 · 401 · 403 · 404 |
| `/api/audits/[id]/report/[version]` | GET | Detalle: client_draft + internal_draft + loom_url + metadatos (R17) | 200 · 401 · 403 · 404 |
| `/api/audits/[id]/report/[version]` | PATCH | Editar `client_draft` por sección y/o `loom_url` (R20, R25) | 200 · 400 (Zod) · 401 · 403 · 404 · 409 (status ≠ borrador) |
| `/api/audits/[id]/report/[version]/status` | GET | Estado para polling; aplica guard timeout (R14, R15) | 200 · 401 · 403 · 404 |
| `/api/audits/[id]/report/[version]/retry` | POST | `error → generando`, re-ejecuta pipeline misma fila (R22) | 202 · 401 · 403 · 404 · 409 (status ≠ error) · 503 |
| `/api/audits/[id]/report/[version]/approve` | POST | `borrador → aprobado` + approved_by/at (R23) | 200 · 401 · 403 · 404 · 409 (status ≠ borrador) |

Envelope estándar `{ success, data, error }` (`src/lib/server/api/envelope.ts`). El guard de
auth replica el patrón de `src/routes/api/audits/[id]/export/+server.ts` (`requireAdminApi`):
se extrae ese helper a `src/lib/server/api/guards.ts` y lo reutilizan export e informe
(401 sin sesión, 403 rol ≠ admin), sin cambiar el comportamiento del export.

**Excepción de lectura (decisión puerta 3):** en los GET de listado, detalle y la ruta de
render imprimible, un `tecnico` asignado a la auditoría accede en solo lectura **únicamente**
a informes `aprobado`; el detalle para técnico omite siempre `internal_draft` (R17) y el
listado le muestra solo versiones aprobadas. POST/PATCH/retry/approve siguen siendo solo
admin. Guard nuevo: `requireReportReadAccess(locals, audit, report)` en `guards.ts`.

Adicional R31: `GET /api/audits/[id]/report/[version]/edits` (solo admin) lista el historial
append-only (`seq`, `change_summary`, `edited_by`, `edited_at`). El PATCH acepta un flag
`origin: 'inline' | 'form'` en el body (`patchReportSchema`); con `'inline'` registra la
entrada `audit_report_edit` con summary «Edición inline».

### UI

| Archivo | Propósito |
|---|---|
| `src/routes/(app)/auditorias/[id]/+page.server.ts` / `+page.svelte` | Sección «Informe IA» en detalle: listado de versiones con estado y CTA «Generar informe» solo si `status = 'cerrada'` y rol admin (R27); indicador de estado con polling (R15) |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` | Load del informe (guard admin server-side), redirect si no existe |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` | Pantalla de revisión: tabs «Informe cliente» / «Vista interna» (R17), edición por sección (R20), campo Loom (R25), acciones Aprobar / Regenerar / Reintentar |
| `src/routes/(app)/auditorias/[id]/informe/[version]/imprimir/+page.svelte` | Vista de impresión: render limpio sin chrome de app, `@media print` (R26) |
| `src/lib/components/informe/report-render.svelte` | Componente puro de render cliente: implementa el template A4 oficial (7 páginas) con `client_draft` + datos públicos del canónico (`stripInternalFindings`) + `loom_url`; única fuente del HTML branded — la usan la ruta imprimir y el snapshot test (R16, R26) |
| `src/lib/components/informe/report-status-badge.svelte` | Badge de estado `{pendiente, generando, borrador, aprobado, error}` (R15) |
| `src/lib/components/informe/section-editor.svelte` | Textarea/inputs por sección con guardar (PATCH, `origin: 'form'`) |
| `src/lib/components/informe/inline-editor.svelte` | Modo edición inline estilo presupuestossys (R30, R31): envuelve `report-render`, activa `contenteditable` en los bloques con `data-field`, autosave con debounce 1 s → PATCH `origin: 'inline'`, feedback «Guardado (edición N)», botón «Listo» para salir (sin botón guardar) |
| `src/lib/client/informe/inline-edit.ts` | Mapeo `data-field` ↔ path del `client_draft`, serialización a texto plano (strip de HTML pegado), debounce |
| `src/lib/components/informe/internal-view.svelte` | Vista interna: `upsell_findings` del snapshot + recomendaciones de `internal_draft` (R17) |
| `src/lib/client/informe/polling.ts` | Polling a `/status` cada 3 s mientras `pendiente|generando` |

Patrones de UI: seguir `src/routes/(app)/auditorias/[id]/cierre/` (load server-side con guard,
componentes `<200` líneas, tokens `--sys-*`, mobile-first).

### Tests

| Archivo | Cubre |
|---|---|
| `tests/informe-state-machine.test.ts` | R7, R24 |
| `tests/informe-schemas.test.ts` | R10, R11, R16, R25 |
| `tests/informe-prompt.test.ts` | R9, R18, R19 |
| `tests/informe-pipeline.test.ts` | R5, R8, R9, R12, R13, R24 |
| `tests/informe-render.test.ts` | R16, R25, R26, R30 (snapshot + data-field) |
| `tests/api/informe-create.test.ts` | R1, R2, R3, R4, R6, R21, R27 |
| `tests/api/informe-status.test.ts` | R14, R15 |
| `tests/api/informe-review.test.ts` | R1 (técnico lee aprobado), R17, R20, R22, R23, R30, R31 |
| `tests/fixtures/informe-claude-mock.ts` | Mock del adapter (respuesta válida, inválida, error, promesa colgada) |
| `tests/fixtures/informe-canonical-golden.json` | Canónico estable para pipeline/render (reusa golden de #9 si alcanza) |
| `e2e/informe.spec.ts` | R15, R27, R29 |

Toda la suite corre sin `ANTHROPIC_API_KEY` real (R28): el adapter se inyecta/mockea
(`vi.mock` de `claude.ts` o inyección de dependencia en `runInformePipeline`).

## Firmas principales

### Pipeline

```typescript
export async function createReport(input: {
  auditId: string;
  userId: string;
}): Promise<{ reportId: string; version: number; status: 'pendiente' }>;
// 1. assertAnthropicConfigured()                       → 503 (R3)
// 2. audit existe y status === 'cerrada'               → 409 (R2)
// 3. canonical = await buildCanonicalAuditJson(auditId, { allowOpen: false })  (R5)
// 4. INSERT audit_report (snapshot, version atómica)   (R4)
// 5. void runInformePipeline(reportId)  — fire-and-forget, respuesta inmediata (R6)

export async function runInformePipeline(
  reportId: string,
  deps?: { claude?: InformeClaudeAdapter }   // inyectable para tests
): Promise<void>;
// pendiente|error → generando → (borrador | error). Nunca → aprobado (R24).
// Valida assertSchemaVersionMatchesConstant(snapshot) antes de armar el prompt (R5).
// Sobrescribe client_draft.indices con los del canónico + indexToSemaphore (R12).
// Ante throw o Zod inválido: status='error', error_message, drafts NULL (R13).
```

### Adapter Claude (`claude.ts`)

```typescript
export const INFORME_DEFAULT_MODEL = 'claude-opus-4-8';

export function assertAnthropicConfigured(): void;  // lanza InformeNotConfiguredError (R3)

export interface InformeClaudeAdapter {
  generateDraft(input: {
    prompt: { system: string; user: string };
    model: string;                       // de INFORME_CLAUDE_MODEL, default arriba (R8)
  }): Promise<unknown>;                  // JSON crudo; el pipeline valida con Zod
}

export function createClaudeAdapter(): InformeClaudeAdapter;
// client.messages.create({
//   model,
//   max_tokens: 16000,
//   thinking: { type: 'adaptive' },
//   system: prompt.system,
//   messages: [{ role: 'user', content: prompt.user }],
//   output_config: { format: zodOutputFormat(reportDraftEnvelopeSchema) }   (R8)
// })
```

Una sola llamada genera ambas salidas bajo un envelope
`{ cliente: ReportClientDraft, interna: ReportInternalDraft }`; el pipeline valida cada mitad
con su schema y las persiste en columnas separadas. Nota: la API de structured outputs no
garantiza constraints numéricos (`max(5)` de riesgos) server-side — `zodOutputFormat` los
remueve del JSON schema enviado — por eso la validación Zod propia del pipeline corre siempre
y es la fuente de verdad (R10, R11).

### Schemas Zod (`schemas.ts`)

El shape cubre 1:1 los campos editables (`✏️`/placeholders) del template A4 (R10). Lo que el
template toma del relevamiento (portada, scores, módulos) NO vive en el draft: ver «Mapeo
canónico → template A4».

```typescript
const semaphoreSchema = z.enum(['green', 'amber', 'red']);  // mismo dominio que indexToSemaphore

const indexWithSemaphoreSchema = z.object({
  valor: z.number().int().min(0).max(100),
  semaforo: semaphoreSchema
}).strict();

// ── Página 2: resumen ejecutivo ──
const resumenSchema = z.object({
  diagnostico: z.string().min(1).max(90),          // h2: diagnóstico central en UNA línea
  lead: z.string().min(1),                          // párrafo lead bajo el h2
  circuitos_con_controles: z.object({               // stat-card 2: «N de T»
    n: z.number().int().min(0),
    total: z.number().int().min(1)
  }).strict().nullable(),                           // null = sin evidencia → render muestra «a editar» (decisión puerta 8)
  interpretacion: z.string().min(1),                // interpretación del índice e impacto
  recomendacion_central: z.string().min(1),         // «Nuestra recomendación: <strong>…»
  fortalezas: z.string().min(1).nullable()          // callout «lo que está bien»; null = no se renderiza
}).strict();

// ── Página 3: hallazgos por circuito ──
const dimensionSchema = z.string().min(1).max(24);  // ej. «No», «Parcial», «Manual», «—»

const hallazgoCircuitoSchema = z.object({
  seccion_code: z.string().min(1),                  // join con canonical.sections: título y score del canónico (R12)
  doc: dimensionSchema,                             // Doc. / Controles / Madurez: la IA las infiere
  controles: dimensionSchema,                       // de items/observations de la sección; «—» sin evidencia
  madurez: dimensionSchema
}).strict();

const lecturaTransversalSchema = z.object({
  titulo: z.string().min(1),                        // <strong> de la observación
  detalle: z.string().min(1)                        // explicación breve con evidencia numérica
}).strict();

// ── Página 4: riesgos priorizados ──
const riesgoSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().min(1),                   // qué puede pasar y por qué importa
  evidencia: z.string().min(1),                     // dato concreto del relevamiento
  severidad: z.enum(['baja', 'media', 'alta', 'critica'])  // ordena las cards; alineado a topRiskSchema (#9)
}).strict();

// ── Página 5: recomendación + plan ──
const etapaPlanSchema = z.object({
  semana: z.string().min(1).max(12),                // «Sem 1», «Sem 4–5»
  titulo: z.string().min(1),
  descripcion: z.string().min(1)
}).strict();

const planSchema = z.object({
  titulo: z.string().min(1),                        // h2 «[Título del plan de acción]»
  descripcion: z.string().min(1),                   // callout: qué se hace, por qué, qué queda funcionando
  etapas: z.array(etapaPlanSchema).min(2).max(6),   // timeline horizontal (grid se adapta)
  necesitamos_cliente: z.array(z.string().min(1)).min(1).max(6),
  no_incluye: z.array(z.string().min(1)).min(1).max(6)
}).strict();

// ── Página 6: qué cambia en el día a día ──
const circuitoDiaADiaSchema = z.object({
  seccion_code: z.string().min(1),                  // «hoy N/100» sale del canónico vía code (R12)
  funcionalidades: z.array(z.object({
    nombre: z.string().min(1),                      // funcionalidad Tango existente
    que_resuelve: z.string().min(1)
  }).strict()).length(3)                            // el template pide 3 por card
}).strict();

export const reportClientDraftSchema = z.object({
  resumen: resumenSchema,
  indices: z.object({
    it: indexWithSemaphoreSchema.optional(),
    erp: indexWithSemaphoreSchema.optional()
  }).strict(),                                      // sobrescritos siempre por el pipeline (R12)
  hallazgos: z.object({
    circuitos: z.array(hallazgoCircuitoSchema).min(1),
    lectura_transversal: z.array(lecturaTransversalSchema).min(3).max(4)
  }).strict(),
  riesgos: z.object({
    intro: z.string().min(1),                       // párrafo gris bajo el h2
    items: z.array(riesgoSchema).min(3).max(5)      // default 4 (grid 2×2 del template); ver alternativas
  }).strict(),
  plan: planSchema,
  dia_a_dia: z.object({
    intro: z.string().min(1),                       // «No hace falta desarrollo a medida…»
    circuitos: z.array(circuitoDiaADiaSchema).min(2).max(4),
    callout_transversal: z.string().min(1).nullable()  // ej. Tango Live; null = no se renderiza
  }).strict(),
  proximos_pasos: z.array(z.string().min(1)).min(3).max(5)  // lista numerada del cierre, con nombre del cliente donde aplique
}).strict();   // strict() rechaza claves upsell/recomendaciones/etc. (R16)

export const reportInternalDraftSchema = z.object({
  recomendaciones_presupuesto: z.array(z.object({
    linea: z.string().min(1),              // línea de solución, nunca producto cerrado (R18)
    rango_estimado: z.string().min(1),     // ej. «USD 3.000–5.000»
    urgencia: z.enum(['baja', 'media', 'alta']),
    probabilidad_cierre: z.enum(['baja', 'media', 'alta']),
    candidato_financiacion: z.boolean(),
    candidato_abono: z.boolean(),
    justificacion: z.string().min(1)
  }).strict()).min(1)
}).strict();   // (R11)

export const loomUrlSchema = z.string().url()
  .refine((u) => /^https:\/\/(www\.)?loom\.com\//.test(u));   // (R25)

export const patchReportSchema = z.object({
  client_draft: reportClientDraftSchema.optional(),
  loom_url: loomUrlSchema.nullable().optional(),
  origin: z.enum(['inline', 'form']).default('form')   // 'inline' → entrada audit_report_edit (R31)
}).refine((v) => v.client_draft !== undefined || v.loom_url !== undefined);
```

El PATCH recibe el draft completo resultante (la UI edita una sección y manda el objeto
entero); el server re-valida con `reportClientDraftSchema`, **re-sobrescribe los índices con
los del snapshot canónico** (R12 también aplica a ediciones) y registra `edited_by`/`edited_at`
(R20).

Validación cruzada contra el snapshot (pipeline y PATCH, R12): todo `seccion_code` de
`hallazgos.circuitos` y `dia_a_dia.circuitos` debe existir en `canonical_json.sections`;
si no, `InformeDraftValidationError`. Los scores numéricos por circuito no existen en el
draft — el render los resuelve por code contra el snapshot, así la IA (o una edición humana)
nunca puede alterarlos.

### Prompt (`prompts/generate-report.ts`)

```typescript
export const INFORME_PROMPT_VERSION = '1.0';

export function buildInformePrompt(canonical: CanonicalAudit): {
  system: string;
  user: string;
};
```

Contenido del system prompt (testeable por texto, R18/R19):

- Rol: consultor IT senior de Servicios y Sistemas (NEA) redactando informe de auditoría.
- Insumo: el JSON canónico completo va en el turno user (datos, secciones, scores, riesgos,
  `upsell_findings`, `market_data`).
- Salida: solo JSON conforme al envelope `{ cliente, interna }` (reforzado por
  `output_config.format`).
- Regla líneas/rangos: «las recomendaciones internas sugieren líneas de solución y rangos de
  precio; NUNCA fijar marca, modelo ni producto específico cerrado» (R18).
- Bloque de jerga prohibida con los seis términos exactos: «solución 360°», «disruptivo»,
  «excelencia», «de la mano de», «transformación digital», «world class» (R19).
- Los valores numéricos de índices son informativos: el sistema los sobrescribe igual (R12).
- Dimensiones Doc./Controles/Madurez por circuito: inferirlas SOLO de `items`/`observations`
  de la sección (valores cortos: «Sí», «No», «Parcial», «Manual», etc.); sin evidencia → «—».
- Riesgos: 4 por defecto (grid 2×2 del template), 3–5 si la evidencia lo justifica; cada
  riesgo con `evidencia` citando un dato concreto del relevamiento, nunca inventada.
- `diagnostico` cabe en una línea de h2 (≤90 caracteres); `lectura_transversal` con evidencia
  numérica; `proximos_pasos` usa la razón social del cliente donde el template la pide.
- Stat «circuitos con controles»: si no hay evidencia suficiente en el relevamiento, devolver
  `null` (el render muestra «a editar» y lo completa el humano; decisión puerta 8).
- Tono: español rioplatense profesional sin voseo hacia el cliente final, concreto, sin
  promesas absolutas (confirmado en puerta 2026-06-12).

### Guard de timeout (`guard.ts`)

```typescript
export const INFORME_GENERATION_TIMEOUT_MS_DEFAULT = 300_000;

export async function expireStaleGenerating(report: AuditReportRow): Promise<AuditReportRow>;
// Si status === 'generando' y (now - updated_at) > INFORME_GENERATION_TIMEOUT_MS:
//   UPDATE a 'error' con error_message de timeout (transición válida generando→error)
//   y devuelve la fila actualizada. El endpoint /status lo invoca en cada GET (R14).
```

Sin worker ni cron en MVP: el job corre in-process (`void runInformePipeline(...)` tras el
INSERT, igual que el patrón de #12) y el guard perezoso en `/status` cubre procesos caídos.

## Errores de dominio (`errors.ts`)

| Clase | code | HTTP |
|---|---|---|
| `InformeNotConfiguredError` | `INFORME_NOT_CONFIGURED` | 503 (R3) |
| `InformeAuditNotClosedError` | `INFORME_AUDIT_NOT_CLOSED` | 409 (R2) |
| `InformeReportNotFoundError` | `INFORME_REPORT_NOT_FOUND` | 404 |
| `InformeInvalidTransitionError` | `INFORME_INVALID_TRANSITION` | 409 (R7, R20, R22, R23) |
| `InformeDraftValidationError` | `INFORME_DRAFT_INVALID` | 400 (PATCH) / interno en pipeline → `error` (R13) |
| `InformeGenerationError` | `INFORME_GENERATION_FAILED` | interno: pipeline → `error` + log server (R13) |

Reutilizados: `AuditNotFoundError` (backoffice) para auditoría inexistente/archivada; 401/403
del guard admin compartido. Nunca exponer stack trace ni payload de Anthropic al cliente.

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (requerida para generar) | Auth API Claude; sin ella POST/retry → 503 (R3) |
| `INFORME_CLAUDE_MODEL` | `claude-opus-4-8` | Modelo del pipeline (R8) |
| `INFORME_GENERATION_TIMEOUT_MS` | `300000` | Guard `generando` colgado (R14) |

Documentar en `.env.example`. Server-only, nunca expuestas al cliente. Dependencia nueva:
`@anthropic-ai/sdk` (más `zodOutputFormat` de `@anthropic-ai/sdk/helpers/zod`; Zod ya está).

## Mapeo canónico → template A4

De dónde sale cada campo del template (`template_informe_pdf_a4_v1.html`). Tres fuentes:
**canónico** (snapshot `canonical_json`, determinístico), **IA** (campos del `client_draft`,
editables por humano) y **fijo** (hardcodeado en el componente, igual que en el template).

| Página · campo del template | Fuente |
|---|---|
| 1 · eyebrow «[MES AÑO]» | Canónico: derivado de `closed_at` (ej. «Junio 2026») |
| 1 · h1 «Auditoría ERP» | Derivado de `types` (`erp-tango`/`erp-estandar` → ERP; ver open question 5 para `it`/mixtas) |
| 1 · cliente / CUIT | Canónico: `client.razon_social`, `client.cuit` |
| 1 · «Módulos relevados: [lista]» | Canónico: `market_data.modulos_tango` |
| 1 · «[DD de mes de AAAA] · Sistema: …» | Canónico: `closed_at` + `market_data.erp_actual` (fallback «Tango Gestión» si erp-tango) |
| 2 · h2 diagnóstico, lead, interpretación, recomendación, fortalezas | IA: `resumen.*` |
| 2 · stat 1: gauge índice general | Canónico: `indices.erp` (o `it`); `stroke-dasharray = valor × 2.514`, color por semáforo (R12) |
| 2 · stat 2: «N de T circuitos con controles» | IA: `resumen.circuitos_con_controles`; sin evidencia → placeholder «a editar» que completan técnicos/admin en revisión (decisión puerta 8) |
| 2 · stat 3: «N módulos en uso: [lista]» | Canónico: `market_data.modulos_tango` (count + lista) |
| 3 · tabla: circuito, score, dot | Canónico: `sections[].title`, `sections[].score` + `indexToSemaphore(score)` (R12) |
| 3 · tabla: Doc. / Controles / Madurez | IA: `hallazgos.circuitos[]` (join por `seccion_code`) |
| 3 · lectura transversal | IA: `hallazgos.lectura_transversal` (3–4) |
| 4 · intro + cards de riesgo (título/descripción/evidencia) | IA: `riesgos.*` (insumo: `top_risks` del canónico) |
| 5 · título, callout, timeline, necesitamos/no incluye | IA: `plan.*` (insumo: `next_step`, `quick_wins`) |
| 6 · intro, cards por circuito débil, callout transversal | IA: `dia_a_dia.*` (insumo: `quick_wins` + secciones con score bajo); «hoy N/100» → canónico vía `seccion_code` (R12) |
| 7 · pasos numerados | IA: `proximos_pasos` (con razón social del cliente donde aplica) |
| 7 · firma «Integral de verdad.» + bloque de contacto | Fijo del template (componente) |
| 1/7 · `__LOGO_VERT__` · 2–6 footer `__LOGO_COLOR__` | CDN R2: `sys_vertical_w.png` / `sys_horizontal_b.png` (ver abajo) |
| 2–6 · número de página del footer | Fijo: posición de la página |

**Semáforos — coherencia verificada:** el template usa `<40 rojo, 40–69 naranja, 70+ verde`;
`indexToSemaphore` (`src/lib/server/scoring/constants.ts`: `SEMAPHORE_GREEN_MIN = 70`,
`SEMAPHORE_AMBER_MIN = 40`) usa exactamente los mismos umbrales. No hay conflicto: solo
difiere el nombre del nivel intermedio. Mapeo visual fijo en el render:
`green → .green/.ok`, `amber → .orange/.warn`, `red → .red/.bad`. Fuente de verdad:
`indexToSemaphore`; las clases CSS del template son su proyección visual.

**Dimensiones Doc./Controles/Madurez — decisión:** el canónico NO trae estas tres dimensiones
como datos estructurados (las secciones tienen `score`, `observations` e `items`; ver
`src/lib/server/canonical/build.ts`). Decisión MVP: la IA las infiere de `items`/`observations`
de cada sección con valores cortos y usa «—» cuando no hay evidencia; el humano las corrige en
revisión (son parte del `client_draft`). Estructurarlas como captura del cierre (#8) queda
para fase 2 (ver open question 6).

## Render imprimible (R26)

`report-render.svelte` **implementa el template A4 oficial como componente Svelte**: mismo
HTML/CSS (7 `section.page`, clases `.cover`, `.stats`, `.risks`, `.timeline`, `.circuitos`,
`.backcover`), datos del view-model armado server-side:

```typescript
export type InformeRenderModel = {
  cliente: { razonSocial: string; cuit: string | null; rubro: string | null };
  periodo: string;               // «Junio 2026», derivado de closed_at
  fechaInforme: string;          // «11 de junio de 2026» — cierre de la auditoría
  tipoAuditoria: 'erp' | 'it' | 'mixta';   // de canonical.types (títulos de portada)
  modulos: string[];             // market_data.modulos_tango ?? []
  sistema: string;               // market_data.erp_actual ?? 'Tango Gestión'
  secciones: { code: string; title: string; score: number | null }[];  // del snapshot (tabla y «hoy N/100», R12)
  draft: ReportClientDraft;      // índices ya sobrescritos (R12)
  loomUrl: string | null;
};
```

- **Paleta:** los colores del template coinciden 1:1 con `src/lib/styles/brand.css`
  (`#0A1929`/`--sys-azul-profundo`, `#102A43`/`--sys-azul-medio`, `#2196F3`/`--sys-azul-electrico`,
  `#A2C6D4`/`--sys-celeste`, `#27AE60`/`--sys-verde`, `#E63946`/`--sys-rojo`,
  `#F39C12`/`--sys-naranja`, `#908A82`/`--sys-gris-neutro`, `#F7F9FB`/`--sys-offwhite`,
  gradient = `--sys-bg-gradient`, Montserrat = `--sys-font`). El componente usa los tokens
  `--sys-*` en lugar de las variables locales del template; sin divergencias detectadas.
  El `@import` de Google Fonts del template no se replica: la app ya sirve Montserrat (#11).
- **Logos (decisión puerta 7):** se usan DIRECTO desde el CDN R2 de SyS (no se descargan a
  `static/brand/`). Reemplazos del template:
  `__LOGO_VERT__` (portada y cierre, fondo dark) →
  `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png`;
  `__LOGO_COLOR__` (footer páginas claras) →
  `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_horizontal_b.png`.
  Sin base64: la impresión del navegador resuelve las URLs remotas (activar «imprimir fondos»
  e imágenes como ya exige el template).
- **Gauge:** SVG del template con `stroke-dasharray = indices.valor × 2.514` y stroke según
  semáforo — calculado del canónico, nunca del texto IA (R12).
- **Riesgos:** grid `1fr 1fr` del template; con 3 o 5 riesgos la grilla se adapta (la quinta
  card ocupa fila propia). QA visual del implementer: verificar que 5 cards no desborden los
  297 mm de la página (el template tiene `overflow: hidden` por página).
- **Loom:** bloque solo en la vista de pantalla, oculto en `@media print` (el template A4 no
  lo incluye; R25). Iframe `https://www.loom.com/embed/...`.
- `@media print`: las reglas del propio template (page-break por `section.page`, sombras off)
  más ocultar el chrome de la app y el bloque Loom.

El componente consume `client_draft` + datos públicos vía `stripInternalFindings(canonical)` —
jamás recibe `internal_draft` ni `upsell_findings` (verificado por snapshot, R16).

## Edición inline del borrador (R30, R31) — adaptación de presupuestossys

Modelo de referencia (`~/presupuestossys`): `contentEditable` nativo sobre el documento
renderizado en iframe sandbox, autosave con debounce de 1 s, cada guardado crea una versión
append-only con `changeSummary`, feedback «Guardado (versión X)», botón «Listo» sin botón
guardar; edición con IA por chat como segundo modo. Sin librerías de editor.

Adaptación a #14 — acá la fuente de verdad es `client_draft` (JSON Zod), no HTML libre:

- **Edición por bloque, no documento libre:** `report-render.svelte` marca cada bloque de
  texto que proviene del draft con `data-field="<path>"` (ej. `resumen.lead`,
  `riesgos.items.1.descripcion`). En modo edición, `inline-editor.svelte` activa
  `contenteditable` solo en esos bloques. Los bloques canónicos (scores, gauge, semáforos,
  portada) no llevan `data-field` y quedan intactos — R12 se mantiene estructural.
- **Serialización:** al guardar se toma `textContent` del bloque (texto plano; el HTML pegado
  se descarta), se aplica al path correspondiente del draft en memoria y se manda el draft
  completo al PATCH existente (R20) con `origin: 'inline'`. El server re-valida con
  `reportClientDraftSchema` y re-sobrescribe índices — la edición inline no abre ninguna
  puerta nueva: es otro cliente del mismo PATCH.
- **Autosave:** debounce 1 s tras el último input; en éxito, feedback «Guardado (edición N)»
  con el `seq` devuelto. Error Zod (ej. vaciar un campo `min(1)`) → el bloque se marca en
  rojo con el mensaje y se revierte al último valor persistido.
- **Historial:** cada PATCH `origin: 'inline'` agrega una fila `audit_report_edit`
  (append-only, summary «Edición inline»). No reemplaza a `edited_by`/`edited_at` de la fila
  principal (R20): los complementa con la traza fina.
- **Sin iframe sandbox:** el render es un componente Svelte de la propia app (no HTML de
  terceros); el sandbox de presupuestossys no aporta acá.
- **Edición con IA por chat: NO va en #14.** Queda como fase 2 (ver «Fuera de alcance» en
  requirements). Justificación: exige un segundo prompt versionado, modal de chat, preview en
  vivo y manejo de costos/errores de otra llamada LLM — duplica medio pipeline para una
  conveniencia que la edición inline + regenerar ya cubren. Cuando se encare, el historial
  (`change_summary = 'Edición con IA'`) y el PATCH ya están preparados.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Reconstruir el canónico on-demand al generar (sin snapshot) | El informe debe quedar atado al insumo exacto consumido (R4); una reapertura/edición posterior cambiaría el insumo y rompería trazabilidad entre versiones |
| Cola externa (BullMQ / n8n webhook) para el job | Una sola llamada LLM por informe, volumen bajísimo; in-process + guard de timeout es suficiente y consistente con #12. Cola es infra nueva sin beneficio en MVP |
| Dos llamadas Claude separadas (cliente / interna) | Duplica costo y latencia y arriesga incoherencia entre ambas salidas; un envelope en una llamada mantiene consistencia y se valida por mitades igual |
| Markdown libre generado por la IA | No validable por sección ni editable estructuradamente; JSON con schema estricto habilita R10/R16/R20 |
| Confiar solo en structured outputs de la API (sin Zod propio) | La API no garantiza constraints numéricos (max 5 riesgos) y los tests deben correr sin SDK real; Zod local es la fuente de verdad (R10, R11, R28) |
| Auto-publicar si la validación pasa | Requisito de negocio: aprobación humana explícita siempre (R23, R24) |
| Editar una versión `aprobado` | Inmutabilidad = confianza en lo que vio el cliente; cambios → regenerar `version + 1` (R21, R23) |
| WebSocket / SSE para estado del pipeline | Polling cada 3 s alcanza para un job de ~1 min; menos infra (mismo criterio que #12) |
| PDF server-side (puppeteer/playwright en prod) | Dependencia pesada en el contenedor; el navegador imprime perfecto con `@media print`. Fase 2 si se necesita automatizar |
| Render con HTML guardado en DB | El HTML se deriva de `client_draft` en render-time; persistirlo duplica fuente de verdad |
| 4 riesgos fijos (como las 4 cards del template) | El acceptance dice «top 5 riesgos»; `min(3).max(5)` con default 4 en el prompt respeta el acceptance, mantiene el layout 2×2 típico y deja flexibilidad cuando la evidencia da para 3 o 5. Trade-off: con 5 cards hay una tercera fila — QA visual obligatorio para no desbordar la página A4 |
| Roadmap `ahora/3_meses/12_meses` (diseño previo) | El template oficial trae timeline de etapas por semana (`plan.etapas`); duplicar ambas estructuras confunde. «Roadmap por fases» del acceptance se cumple con las etapas del plan |
| Scores por circuito dentro del `client_draft` | La IA (o una edición) podría alterarlos; con solo `seccion_code` en el draft, el render resuelve score y semáforo contra el snapshot — R12 estructural |
| Dimensiones Doc./Controles/Madurez como captura estructurada del cierre (#8) | Requiere migración y cambios en el flujo de cierre fuera del alcance de #14; MVP: la IA las infiere con corrección humana (open question 6) |
| Logos embebidos en base64 o copiados a `static/brand/` | Decisión puerta 7: se referencian directo del CDN R2 (fuente única de assets de marca); base64 solo tendría sentido para exportar HTML autocontenido (fase 2 / #15) |
| `contentEditable` sobre el documento completo (modelo presupuestossys literal) | Acá la fuente de verdad es `client_draft` JSON con Zod strict, no HTML libre; edición de documento completo rompería el mapeo campo↔draft y dejaría editar contenido canónico (R12). Edición por bloque `data-field` conserva la UX y la integridad |
| Librería de editor (TipTap/ProseMirror) para la edición inline | presupuestossys valida que `contenteditable` nativo + serialización a texto plano alcanza; una librería agrega peso y un modelo de documento que no se necesita para campos de texto plano |
| Autosave inline como nueva fila `audit_report` (version+1) | `version` significa generación (R21); mezclar ediciones con generaciones rompería la semántica de regenerar y explotaría versiones. Historial separado `audit_report_edit` |
| Edición con IA por chat dentro de #14 | Infla el alcance (segundo prompt, modal, preview vivo, otra llamada LLM); fase 2 — el diseño deja `change_summary` y PATCH listos |

## Decisiones de la puerta humana (Martín, 2026-06-12)

Las 8 open questions quedaron resueltas:

1. **Tono:** confirmado el default — español rioplatense profesional sin voseo hacia el
   cliente final.
2. **Tope de recomendaciones internas:** SIN tope máximo (solo `min(1)`); la IA decide.
3. **Acceso al render aprobado:** el técnico asignado SÍ puede ver el render `aprobado`
   (solo lectura). Generar/editar/aprobar siguen siendo solo admin. → R1 ajustado.
4. **Retención de versiones:** sin límite. Confirmado.
5. **IT vs ERP:** se harán AMBOS templates, pero el template IT propio NO es parte de #14 —
   registrado como feature `19_template_informe_it` (pending) en `feature_list.json`. En #14
   el template ERP parametriza títulos según `types` como estaba propuesto.
6. **Doc./Controles/Madurez:** confirmado el default — la IA las infiere de
   `items`/`observations`, «—» sin evidencia, el humano corrige en revisión.
7. **Logo vertical:** SÍ existe; logos directo del CDN R2 (`sys_vertical_w.png` para
   portada/cierre dark, `sys_horizontal_b.png` para footers claros). Ver sección de render.
8. **Stat «N de T circuitos con controles»:** si la IA no puede inferirlo, el campo queda con
   placeholder «a editar» y lo completan técnicos/admin en revisión (ya es editable del
   `client_draft`). El prompt instruye usar el placeholder ante falta de evidencia.

**Requisito nuevo de la puerta:** edición del borrador estilo presupuestossys → R30/R31 y la
sección «Edición inline del borrador». La edición por chat con IA queda como fase 2.

## Open items

- Feature `19_template_informe_it` (backlog, pending): template A4 propio para auditorías IT
  puras y mixtas; hasta entonces #14 reutiliza el ERP parametrizando títulos.
- Edición del borrador por chat con IA (fase 2; historial y PATCH ya preparados).
