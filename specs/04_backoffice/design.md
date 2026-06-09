# Design — #4 04_backoffice

## Alcance

Interfaz autenticada bajo `(app)/` para operar el pipeline de auditorías antes y durante el relevamiento. Admin y técnico comparten tablero y CRUD de auditorías; acciones sensibles (usuarios, plantillas, archivar) quedan en admin según matriz de `03_auth_roles` (#3).

| Incluido (v1) | Excluido |
|---|---|
| Tablero filtrable + búsqueda + badges + % avance | Export CSV/PDF |
| CRUD auditorías + cabecera CAB | Reabrir `cerrada` → `en_cierre` (#8) |
| Generar/regenerar link briefing | Scoring en vivo / cierre (#7, #8) |
| ABM usuarios + reset pass (admin) | Versionado completo plantillas (clonar fila) |
| Editor ítems existentes (5 campos) | Crear/reordenar secciones o ítems |
| Layout tabla desktop / cards mobile | Dashboard métricas agregadas (v2) |
| Paginación tablero (50/página) | Borrado físico R2 al archivar (#6 encola) |

## Dependencias

| Feature | Qué aporta |
|---|---|
| `02_modelo_datos` (#2) | Tablas `audit`, `client`, `app_user`, `template*`, `audit_response`; estados §4 07a |
| `03_auth_roles` (#3) | `event.locals.user`, guards `requireAdmin`, `requireAuth`, cookie sesión |
| `05_briefing_externo` (#5) | Consume URL `/briefing/{public_token}` generada acá |

Permisos alineados con PRD 07b v2: técnico ve tablero completo y crea/edita auditorías; admin exclusivo en usuarios, plantillas y archivar.

## Rutas SvelteKit

```
src/routes/(app)/
├── +layout.server.ts          # requireAuth; nav según rol
├── +layout.svelte             # shell backoffice (nav: Tablero, Usuarios*, Plantillas*)
├── tablero/
│   ├── +page.server.ts        # load list + filtros + paginación
│   └── +page.svelte           # AuditTable / AuditCardList responsive
├── auditorias/
│   ├── new/
│   │   ├── +page.server.ts    # load clients, techs, templates activas
│   │   ├── +page.svelte
│   │   └── +page.server.ts actions: create
│   └── [id]/
│       ├── +page.server.ts    # load audit + progress + CAB responses
│       ├── +page.svelte
│       └── actions: update, archive, generateBriefingLink, regenerateBriefingLink
├── plantillas/
│   └── [id]/
│       ├── +page.server.ts    # requireAdmin; load template tree
│       ├── +page.svelte       # editor ítems (solo campos permitidos)
│       └── actions: updateItem
└── usuarios/
    ├── +page.server.ts        # requireAdmin; list users
    ├── +page.svelte
    └── actions: create, update, deactivate, resetPassword
```

`*` enlaces visibles solo si `user.role === 'admin'`.

## Archivos de dominio (`src/lib/server/`)

| Archivo | Responsabilidad |
|---|---|
| `backoffice/dashboard.ts` | Query listado, filtros, búsqueda, orden, paginación, join client/tech |
| `backoffice/progress.ts` | Cálculo % avance por audit_id |
| `backoffice/audits.ts` | create/update/archive audit; congelar template_ids; CAB upserts |
| `backoffice/briefing-link.ts` | generate/regenerate `public_token`; transiciones de estado |
| `backoffice/users.ts` | CRUD app_user; reset password con argon2id |
| `backoffice/templates.ts` | Load plantilla; updateItem campos acotados |
| `backoffice/status-colors.ts` | Mapa estado → clase Tailwind badge |
| `auth/guards.ts` | (desde #3) `requireAuth`, `requireAdmin`, `assertCanEditAudit` |

Queries SQL viven en funciones anteriores o en `src/lib/server/db/queries/` si el repo ya fragmentó por dominio — no duplicar capa repository.

## Firmas principales

### `backoffice/progress.ts`

```typescript
export type AuditProgress = {
  completed: number;
  total: number;
  percent: number; // 0–100 entero
};

/** Ítem completado si na=true o value no vacío según field_type. */
export function computeAuditProgress(
  items: Array<{ id: string; field_type: string }>,
  responses: Array<{ item_id: string; value: unknown; na: boolean }>
): AuditProgress;
```

### `backoffice/audits.ts`

```typescript
export type CreateAuditInput = {
  clientId?: string;
  newClient?: { razonSocial: string; cuit: string; rubro: string };
  types: Array<'it' | 'erp-tango' | 'erp-estandar'>;
  segment: 'A' | 'B' | 'C';
  assignedTechId: string;
  scheduledAt: string; // ISO date
  cabResponses: Record<string, unknown>; // item_id → value
};

export async function createAudit(
  input: CreateAuditInput,
  createdBy: string
): Promise<{ id: string }>;

export async function updateAudit(
  auditId: string,
  input: Partial<CreateAuditInput>,
  userId: string
): Promise<void>;

export async function archiveAudit(auditId: string, adminId: string): Promise<void>;
```

### `backoffice/briefing-link.ts`

```typescript
export async function generateBriefingLink(auditId: string): Promise<{ url: string; token: string }>;

export async function regenerateBriefingLink(auditId: string): Promise<{ url: string; token: string }>;
```

- Token: `crypto.randomBytes(32).toString('base64url')`.
- `generate`: solo desde `borrador` → `briefing_enviado`.
- `regenerate`: solo si `status ∈ {briefing_enviado, briefing_completo}`; nuevo token, anterior inválido.
- URL: `` `${getServerEnv().PUBLIC_APP_URL}/briefing/${token}` ``.

### `backoffice/users.ts`

```typescript
export async function createUser(input: {
  email: string;
  name: string;
  role: 'admin' | 'tecnico';
  temporaryPassword: string;
}): Promise<{ id: string }>;

export async function resetUserPassword(
  userId: string,
  temporaryPassword: string
): Promise<void>;

export async function setUserActive(userId: string, active: boolean): Promise<void>;
```

### Schemas Zod (`src/lib/server/backoffice/schemas.ts`)

- `dashboardFiltersSchema`: `type?`, `status?`, `clientId?`, `q?`, `sort?`, `page?`.
- `createAuditSchema`, `updateAuditSchema`.
- `updateTemplateItemSchema`: pick `label`, `help`, `options`, `method`, `filled_by` only.
- `createUserSchema`, `resetPasswordSchema`.

## Componentes UI (`src/lib/components/backoffice/`)

| Componente | Uso |
|---|---|
| `audit-status-badge.svelte` | Badge coloreado por estado (R5) |
| `audit-progress-bar.svelte` | Barra + % (R6) |
| `audit-table.svelte` | Tabla desktop con filtros inline o toolbar |
| `audit-card-list.svelte` | Cards mobile |
| `audit-filters.svelte` | Filtros tipo/estado/cliente + búsqueda |
| `client-picker.svelte` | Select existente + modal crear cliente |
| `cab-section-form.svelte` | Render ítems CAB data-driven |
| `template-item-editor.svelte` | Form acotado por ítem |
| `copy-link-button.svelte` | Copiar URL briefing |

Usar tokens Tailwind SyS (skill `sys-brand` cuando exista en repo). Breakpoint tabla/cards: `md:` (768px).

## Mapa de colores badge (estado)

| status | Variante Tailwind sugerida |
|---|---|
| `borrador` | `bg-slate-100 text-slate-800` |
| `briefing_enviado` | `bg-blue-100 text-blue-800` |
| `briefing_completo` | `bg-cyan-100 text-cyan-800` |
| `en_relevamiento` | `bg-amber-100 text-amber-800` |
| `en_cierre` | `bg-orange-100 text-orange-800` |
| `cerrada` | `bg-green-100 text-green-800` |

Centralizar en `status-colors.ts` para test unitario (R5).

## Query tablero (pseud SQL)

```sql
SELECT a.id, a.name, a.types, a.segment, a.status, a.scheduled_at,
       c.razon_social, u.name AS tech_name,
       GREATEST(a.created_at, COALESCE(MAX(ar.updated_at), a.created_at)) AS last_activity
FROM audit a
JOIN client c ON c.id = a.client_id
JOIN app_user u ON u.id = a.assigned_tech_id
LEFT JOIN audit_response ar ON ar.audit_id = a.id
WHERE a.archived_at IS NULL
  AND ($type IS NULL OR $type = ANY(a.types))
  AND ($status IS NULL OR a.status = $status)
  AND ($clientId IS NULL OR a.client_id = $clientId)
  AND ($q IS NULL OR c.razon_social ILIKE '%' || $q || '%')
GROUP BY a.id, c.id, u.id
ORDER BY ... 
LIMIT 50 OFFSET $offset;
```

`progress` se calcula en segunda query batch o subquery según performance; preferir función `computeAuditProgress` reutilizable en detalle.

## Congelar plantillas al crear

Según `audit.types`:

| types | template_ids (activas en seed) |
|---|---|
| `{it}` | plantilla IT activa |
| `{erp-tango}` | ERP Tango activa |
| `{erp-estandar}` | ERP Estándar activa |
| combo | IT + ERP correspondiente(s) |

Lógica en `resolveTemplateIdsForTypes(types): uuid[]` — consulta `template WHERE status='active' AND kind IN (...)`.

## Errores de dominio

| Clase | code | HTTP | Cuándo |
|---|---|---|---|
| `ForbiddenError` | `FORBIDDEN` | 403 | Rol insuficiente |
| `AuditNotFoundError` | `AUDIT_NOT_FOUND` | 404 | id inválido o archivada |
| `AuditClosedError` | `AUDIT_CLOSED` | 409 | editar cerrada |
| `InvalidStateTransitionError` | `INVALID_STATE` | 409 | briefing link desde estado incorrecto |
| `ValidationError` | `VALIDATION_ERROR` | 400 | Zod falla |

Respuestas JSON mutaciones vía envelope `{ success, data, error }`. Form actions: `fail()` SvelteKit con mensaje amigable, sin stack.

## Alternativa descartada: editor full de plantillas con versionado

**Descartado en v1:** clonar plantilla activa a nueva fila al publicar cambios.

**Motivo:** PRD 07c acota v1 a editar ítems existentes sobre seed; versionado completo pospone side-effects y UI de drag-and-drop. Riesgo aceptado: cambios en ítems afectan auditorías futuras que usen la misma fila de plantilla; auditorías ya creadas mantienen `template_ids` congelados.

## Alternativa descartada: DataTables / AG Grid

**Descartado:** librería de grilla externa.

**Motivo:** Tailwind + markup Svelte nativo alcanza para ~50 filas paginadas; menos dependencias y coherente con mobile-first cards.

## Alternativa descartada: REST API separada para backoffice

**Descartado:** `/api/backoffice/*` JSON-only sin SSR.

**Motivo:** Convención SvelteKit del proyecto — `+page.server.ts` load + form actions; tests en `tests/api/` pueden invocar handlers exportados o fetch al preview server.

## Notas implementación

- Añadir columna `archived_at timestamptz` en migración si #2 aún no la incluye en `audit`.
- Archivar auditoría: no borrar R2 en v1; documentar hook para #6 (`06_storage_r2`).
- Alta usuario: admin comunica contraseña temporal fuera de banda (sin email automático).
- Detalle auditoría muestra progreso y enlace briefing; no implementar form técnico completo (#7).
- Redirect post-login → `/tablero`.
