# Design — #16 16_presupuesto_psys

> Integración M2M auditapp → presupuestossys. Auditapp es **cliente HTTP**: arma el payload
> desde el informe aprobado (#14), lo envía a un endpoint nuevo de presupuestossys autenticado
> por API key, y persiste el vínculo. El motor de presupuestos (numeración, templates, clientes,
> HTML, share links) vive exclusivamente en presupuestossys.

## Alcance

| Sí | No |
|---|---|
| Tabla `audit_proposal_link` + migración | Crear/editar el HTML del proposal desde auditapp |
| Cliente HTTP `src/lib/server/psys/` con Zod + idempotencia | Webhook entrante (descartado, ver Alternativas) |
| `POST /api/audits/[id]/proposal` y `GET /api/audits/[id]/proposal` (sync) | Código en el repo presupuestossys (Anexo A = spec de su feature espejo) |
| Card de vínculo en el detalle de auditoría | Duplicar lógica de precios/numeración |

## Arquitectura del flujo

```
admin ─ POST /api/audits/[id]/proposal
  1. requireAdminApi                                            (R1)
  2. último audit_report aprobado o 409                         (R2)
  3. env PSYS_API_URL/PSYS_API_KEY o 503                        (R3)
  4. link activo existente → 200 early return                   (R6)
  5. buildPsysPayload(report) + psysProposalPayloadSchema       (R4, R14, R15)
  6. POST {PSYS_API_URL}/api/m2m/proposals
       Authorization: Bearer <key> · Idempotency-Key            (R5)
  7. 201/200 → upsert audit_proposal_link (UNIQUE parcial)      (R7, R9, R16)
     error    → fila status='error' + 502                       (R8)

admin ─ GET /api/audits/[id]/proposal (detalle / botón Actualizar)
  GET {PSYS_API_URL}/api/m2m/proposals/{proposal_id}            (R10)
  status ∈ enum → update psys_status + synced_at                (R11)
  fallo remoto → sync_error: true, fila intacta                 (R12)
```

## Cambios de schema (migración `006_psys_link.sql`)

### `audit_proposal_link`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| audit_id | uuid NOT NULL FK → audit | |
| report_id | uuid NOT NULL FK → audit_report | versión de informe que originó el proposal |
| status | text NOT NULL default `'activo'` | CHECK (status IN ('activo','error')) |
| proposal_id | uuid | id en presupuestossys; NULL solo si `status='error'` |
| number_display | text | ej. `0000100000123` |
| proposal_url | text | `https://presupuestos.serviciosysistemas.com.ar/presupuestos/<slug>` |
| psys_status | text | enum presupuestossys (R11); NULL si error |
| contract_version | text NOT NULL | `'1.0'` |
| sent_payload | jsonb NOT NULL | snapshot exacto enviado (auditable) |
| error_message | text | no vacío cuando `status='error'` |
| created_by | uuid NOT NULL FK → app_user | |
| synced_at | timestamptz | última sync exitosa |
| created_at / updated_at | timestamptz NOT NULL default now() | |

```sql
CONSTRAINT audit_proposal_link_error_coherence CHECK (
  (status = 'error' AND error_message IS NOT NULL AND error_message <> '')
  OR (status = 'activo' AND proposal_id IS NOT NULL)
);
CREATE UNIQUE INDEX audit_proposal_link_active_uq
  ON audit_proposal_link (audit_id, report_id) WHERE status = 'activo';   -- (R6, R16)
CREATE INDEX audit_proposal_link_audit_idx ON audit_proposal_link (audit_id);
```

Las filas `error` no son únicas (cada intento fallido queda registrado); el early-return de
R6 consulta solo filas `activo`.

## Contrato de integración — v1.0 (R15)

Versionado por `PSYS_CONTRACT_VERSION = '1.0'`. Cambios incompatibles ⇒ bump minor/major
acordado en ambos backlogs.

### Request: `POST {PSYS_API_URL}/api/m2m/proposals`

Headers: `Authorization: Bearer <PSYS_API_KEY>` · `Idempotency-Key: audit:<audit_id>:report:<version>` · `Content-Type: application/json`.

```jsonc
{
  "contract_version": "1.0",
  "source": { "system": "auditapp", "audit_id": "<uuid>", "report_version": 2 },
  "template_slug": "propuesta-comercial-mixta",     // default; ver Open Questions
  "cliente": {                                      // match/alta por CUIT lo hace psys
    "razon_social": "Playadito SA",
    "cuit": "30123456789",                          // dígitos, nullable
    "email": null, "telefono": null, "direccion": null, "provincia": null
  },
  "titulo": "Propuesta post-auditoría — Playadito SA",
  "moneda": "ARS",
  "internal_notes": {                               // (R14) NO se renderiza en el documento
    "recomendaciones_presupuesto": [ /* shape exacto de reportInternalDraftSchema (#14) */ ],
    "upsell_findings": [ { "text": "...", "internal": true } ],
    "indices": { "it": 62, "erp": 48 },
    "informe_url": "https://auditapp.../auditorias/<id>/informe"
  }
}
```

### Responses

| Código | Cuerpo | Semántica |
|---|---|---|
| `201` | `{ "proposal": { "id", "number_display", "status", "url" } }` | creado |
| `200` | ídem | ya existía para esa `Idempotency-Key` (R9) |
| `401` | `{ "error" }` | API key inválida/ausente |
| `422` | `{ "error", "issues" }` | payload no pasa validación |

### Request: `GET {PSYS_API_URL}/api/m2m/proposals/{id}` → `200 { "proposal": { "id", "number_display", "status", "url" } }` · `404`.

## Archivos a crear/modificar (auditapp)

| Archivo | Contenido |
|---|---|
| `migrations/006_psys_link.sql` | Tabla + constraints + índices |
| `src/lib/server/psys/schemas.ts` | `PSYS_CONTRACT_VERSION`, `psysProposalPayloadSchema`, `psysProposalResponseSchema`, `PSYS_PROPOSAL_STATUSES` (R4, R11, R15) |
| `src/lib/server/psys/payload.ts` | `buildPsysPayload(report: AuditReportRow, canonical: CanonicalAudit): PsysProposalPayload` (R4, R14) |
| `src/lib/server/psys/client.ts` | `createPsysProposal(payload, key)` / `getPsysProposal(id)` — fetch con timeout (10 s, `AbortController`), errores tipados `PsysConfigError`, `PsysRemoteError` (R3, R5, R8) |
| `src/lib/server/db/psys-links.ts` | SQL parametrizado: insert activo/error, find activo, update sync (R6, R7, R16) |
| `src/routes/api/audits/[id]/proposal/+server.ts` | POST crear · GET sync (R1–R12) |
| `src/lib/components/auditoria/psys-card.svelte` | Card vínculo + botón «Crear presupuesto» / «Actualizar estado» (R13) |
| `src/routes/(app)/auditorias/[id]/+page.server.ts` (mod) | Carga del link para el detalle (R13) |
| `.env.example` (mod) | `PSYS_API_URL`, `PSYS_API_KEY` |
| `tests/...` | Ver tasks.md; mock de presupuestossys con `vi.stubGlobal('fetch', ...)` o msw |

### Firmas clave

```typescript
export const PSYS_CONTRACT_VERSION = '1.0';
export type PsysProposalPayload = z.infer<typeof psysProposalPayloadSchema>;

export function buildPsysPayload(args: {
  audit: AuditRow; report: AuditReportRow; canonical: CanonicalAudit;
}): PsysProposalPayload;

export async function createPsysProposal(
  payload: PsysProposalPayload,
  opts: { idempotencyKey: string }
): Promise<{ proposal: PsysProposalRef; alreadyExisted: boolean }>;  // lanza PsysConfigError | PsysRemoteError

export type PsysProposalRef = {
  id: string; number_display: string | null; status: string; url: string;
};
```

Errores: se reutiliza el patrón de errores tipados de #14 (`InformeInvalidTransitionError`);
nuevos: `PsysConfigError` (→ 503), `PsysRemoteError` (→ 502), `PsysPayloadError` (→ 500, bug interno).

## Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| **Duplicar el motor de presupuestos en auditapp** | Decisión humana 2026-06-11: una sola fuente de numeración, clientes y templates comerciales. Mantenerlo doble garantiza divergencia. |
| **Webhook presupuestossys → auditapp** para el ciclo de vida | Exige endpoint público autenticado en auditapp + retries + feature extra en psys. El estado solo se mira desde el detalle de auditoría: polling on-demand (al cargar + botón) cubre el caso con cero infraestructura nueva. Webhook queda como fase 2 si se necesita estado en listados. |
| **Reusar `POST /api/proposals` existente de psys con cookie de sesión** | Esa ruta exige sesión NextAuth de usuario; compartir credenciales humanas para M2M es frágil e inauditable. Endpoint M2M dedicado con API key propia y `Idempotency-Key`. |
| **Dedupe solo del lado auditapp (sin Idempotency-Key remota)** | Una caída entre el 201 remoto y el commit local dejaría un proposal huérfano; la key remota hace el reintento seguro (R9). |

---

## Anexo A — Feature espejo requerida en presupuestossys (NO se implementa en este repo)

> Para el backlog propio de `~/presupuestossys` (`feature_list.json` de ese repo).
> Título sugerido: **«API M2M para alta de proposals desde auditapp»**.

### Endpoints a crear

1. **`POST /api/m2m/proposals`** (`src/app/api/m2m/proposals/route.ts`)
   - Auth: header `Authorization: Bearer <AUDITAPP_API_KEY>` contra env `AUDITAPP_API_KEY`
     (comparación timing-safe). Sin NextAuth. 401 si falta/difiere.
   - Middleware: agregar `pathname.startsWith('/api/m2m')` a las rutas públicas de
     `src/middleware.ts` (la autenticación la hace la propia route por API key).
   - Validar body contra el contrato v1.0 (§Contrato). `422` con issues si no valida.
   - **Idempotencia:** nueva columna `external_ref text` en `proposals` (migración Drizzle)
     con UNIQUE parcial (`where external_ref is not null`); guardar la `Idempotency-Key`.
     Si ya existe → `200` con el proposal existente.
   - Crear con la lógica existente `createProposal()` (`src/lib/proposals/create.ts`):
     ya resuelve **match/alta de cliente por CUIT** vía `upsertClientByCuit` cuando
     `inputs.cliente` trae `razon_social`/`cuit`, asigna número por `proposal_number_seq`
     y `formatProposalNumberDisplay`. Mapear `internal_notes` a `inputs.notas_internas`
     (clave que los templates NO renderizan) o a una columna jsonb nueva — decidir allá;
     requisito duro: no aparecer en `html_current`.
   - `createdBy`: NULL o usuario de sistema `integraciones@serviciosysistemas.com.ar`
     (preferido para trazabilidad en la UI de psys).
   - Respuesta `201`: `{ proposal: { id, number_display, status, url } }` donde
     `url = https://presupuestos.serviciosysistemas.com.ar/presupuestos/<slug>`
     (slug = `numberDisplay ?? id`, igual que `getProposalSlug`).

2. **`GET /api/m2m/proposals/[id]`** — misma auth; devuelve `{ proposal: { id, number_display, status, url } }`; `404` si no existe. `status` es el campo `proposals.status` (enum `EDITABLE_PROPOSAL_STATUSES`).

### Notas para su spec

- `template_slug` recibido debe validarse contra `TEMPLATE_SLUGS` (`src/types/import.ts`).
- No generar HTML con IA en el alta M2M: crear el proposal en `status='borrador'` con
  `generateProposalHtml` determinístico (mismo camino que el POST actual); el vendedor lo
  trabaja después en la UI de psys.
- Tests allá: auth 401, contrato 422, idempotencia (misma key → 200 mismo id), upsert de
  cliente por CUIT, `internal_notes` ausente del HTML.

## Open questions (para la puerta humana)

1. **`template_slug` por defecto:** ¿`propuesta-comercial-mixta` para todas las propuestas
   post-auditoría, o elegible por el admin en auditapp al crear? El contrato ya transporta el
   campo; el spec asume default fijo sin selector de UI.
2. **Dónde guarda psys las `internal_notes`:** ¿`inputs.notas_internas` (cero migración extra)
   o columna dedicada? Se decide en el spec de la feature espejo; el contrato no cambia.
3. **Usuario de sistema en psys:** ¿crear perfil `integraciones@…` o aceptar `created_by NULL`?
4. **Re-presupuestar tras regenerar informe:** hoy una nueva versión aprobada de informe permite
   un nuevo proposal (la UNIQUE es por `report_id`). ¿Correcto, o debe archivarse el anterior
   automáticamente en psys? El spec asume que el archivado es manual en psys.
