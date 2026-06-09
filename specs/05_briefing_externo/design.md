# Design — #5 05_briefing_externo

## Alcance

Implementar el formulario público del cliente en `/briefing/[token]`: validación de token, render data-driven de ítems `filled_by=cliente`, autosave debounced, envío a `briefing_completo`, UX mobile-first con marca SyS.

| Incluido | Excluido (otras features) |
|---|---|
| Ruta pública + layout briefing | Auth interna, login (#3) |
| Validación `public_token` + estados | Generación/regeneración de token (#4 04_backoffice) |
| Upsert `audit_response` `source=cliente` | Form técnico completo, PWA (#7) |
| Submit → `briefing_completo` | Upload R2 / `file_ref` (#6) |
| Componentes field_type usados en briefing | Scoring, cierre (#8) |
| Tests API + e2e | WHOIS/DNS prefill (v2) |

## Dependencias previas

| Feature | Contrato usado |
|---|---|
| `02_modelo_datos` (#2) | Tablas `audit`, `audit_response`, `template_item`, `client`; UNIQUE `(audit_id, item_id)` |
| `03_auth_roles` (#3) | Resolución de token; `hooks.server.ts` NO exige sesión en `/briefing/*` |
| `04_backoffice` | Auditoría en `briefing_enviado` con `public_token` y `token_expires_at` poblados |

## Arquitectura

```
GET /briefing/[token]
  └─ validateBriefingToken(token) → audit + client + items cliente
  └─ +page.svelte renderiza Field* + SaveIndicator

PATCH /api/briefing/[token]/responses
  └─ saveBriefingResponse(token, itemId, value) → upsert audit_response

POST /briefing/[token]?/submit (form action)
  └─ submitBriefing(token) → audit.status = briefing_completo
```

Capas (ver `docs/architecture.md`):

- `src/lib/server/briefing/` — dominio (token, load, save, submit).
- `src/lib/server/db/briefing.ts` — SQL parametrizado.
- `src/routes/briefing/[token]/` — UI + load/actions.
- `src/routes/api/briefing/[token]/responses/` — autosave JSON.
- `src/lib/components/form/` — renderers reutilizables (subset MVP).

## Archivos a crear o modificar

### Dominio server

| Archivo | Propósito |
|---|---|
| `src/lib/server/briefing/errors.ts` | Errores tipados (ver abajo) |
| `src/lib/server/briefing/validate-token.ts` | Resuelve token → contexto o error |
| `src/lib/server/briefing/load-form.ts` | Ítems `filled_by=cliente` + respuestas existentes |
| `src/lib/server/briefing/save-response.ts` | Upsert con validación Zod + guard `filled_by` |
| `src/lib/server/briefing/submit.ts` | Transición a `briefing_completo` |
| `src/lib/server/briefing/rate-limit.ts` | Limiter por IP + token (reutilizar patrón de login) |
| `src/lib/server/db/briefing.ts` | Queries: `findAuditByToken`, `listClienteItems`, `upsertResponse`, `setStatus` |

### Validación Zod

| Archivo | Propósito |
|---|---|
| `src/lib/server/briefing/schemas.ts` | `briefingSaveSchema`, `valueSchemaByFieldType` (mapa parcial de 12 tipos; briefing MVP usa `text`, `number`, `bool`, `tri`, `select`, `multiselect`, `date`, `list` — excluir `file_ref`, `table` salvo que seed los incluya) |

### Rutas SvelteKit

| Archivo | Propósito |
|---|---|
| `src/routes/briefing/[token]/+layout.svelte` | Shell mobile-first, logo SyS, CSS tokens marca |
| `src/routes/briefing/[token]/+page.server.ts` | `load`, action `submit` |
| `src/routes/briefing/[token]/+page.svelte` | Form, wizard condicional, autosave client-side |
| `src/routes/api/briefing/[token]/responses/+server.ts` | `PATCH` autosave, envelope JSON |

### Componentes UI

| Archivo | Propósito |
|---|---|
| `src/lib/components/briefing/briefing-unavailable.svelte` | Pantalla R5 |
| `src/lib/components/briefing/briefing-header.svelte` | «Hola, {razon_social}» |
| `src/lib/components/briefing/briefing-confirm.svelte` | Post-envío R9 |
| `src/lib/components/briefing/save-indicator.svelte` | Guardando / Guardado / Error |
| `src/lib/components/briefing/briefing-wizard.svelte` | Paginación 2–3 pasos si >8 ítems |
| `src/lib/components/form/field-renderer.svelte` | Switch por `field_type` |
| `src/lib/components/form/fields/*.svelte` | Controles mobile-first por tipo |

### Estáticos / estilo

| Archivo | Propósito |
|---|---|
| `static/brand/sys-logo.svg` | Logo SyS (copiar desde assets de marca o placeholder documentado) |
| `src/lib/styles/brand.css` | Variables CSS `--sys-primary`, etc. (skill `sys-brand`) |

### Hooks

| Archivo | Cambio |
|---|---|
| `src/hooks.server.ts` | Asegurar que rutas `/briefing` y `/api/briefing` no redirijan a login |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/briefing-token.test.ts` | R8 |
| `tests/briefing-form.test.ts` | R2, R10, R13 |
| `tests/briefing-validation.test.ts` | R12 |
| `tests/api/briefing-load.test.ts` | R1, R5 |
| `tests/api/briefing-save.test.ts` | R3, R7 |
| `tests/api/briefing-submit.test.ts` | R4, R9 |
| `tests/api/briefing-rate-limit.test.ts` | R11 |
| `tests/fixtures/briefing-audit.ts` | Auditoría + ítems cliente para tests |
| `e2e/briefing.spec.ts` | R1, R5, R6, R9, R15 |

## Firmas

### `validateBriefingToken`

```typescript
export type BriefingContext = {
  audit: { id: string; status: 'briefing_enviado' | 'briefing_completo'; tokenExpiresAt: Date };
  client: { razonSocial: string };
};

export function validateBriefingToken(token: string): Promise<BriefingContext>;
// Lanza BriefingUnavailableError si token inválido, expirado o estado no permitido
```

### `loadBriefingForm`

```typescript
export type BriefingItem = {
  id: string;
  label: string;
  helpText: string | null;
  fieldType: FieldType;
  options: unknown;
  required: boolean;
  allowNa: boolean;
  sortOrder: number;
  value: unknown | null;
  na: boolean;
};

export function loadBriefingForm(ctx: BriefingContext): Promise<{
  items: BriefingItem[];
  stepCount: 1 | 2 | 3;
}>;
```

### `saveBriefingResponse`

```typescript
export function saveBriefingResponse(
  token: string,
  itemId: string,
  payload: { value: unknown; na?: boolean }
): Promise<{ updatedAt: string }>;
// Lanza BriefingItemNotAllowedError (403), BriefingUnavailableError, ZodError → 400
```

### `submitBriefing`

```typescript
export function submitBriefing(token: string): Promise<void>;
// Idempotente si ya está en briefing_completo
```

### API PATCH `/api/briefing/[token]/responses`

Request:

```json
{ "itemId": "uuid", "value": "...", "na": false }
```

Response (envelope):

```json
{ "success": true, "data": { "updatedAt": "2026-06-08T12:00:00Z" }, "error": null }
```

### Form action `submit`

Action name: `submit`. Redirect o render `BriefingConfirm` vía `+page.svelte` con `form?.success`.

## Errores de dominio

```typescript
export class BriefingUnavailableError extends Error {
  readonly code = 'BRIEFING_UNAVAILABLE';
}

export class BriefingItemNotAllowedError extends Error {
  readonly code = 'BRIEFING_ITEM_NOT_ALLOWED';
}
```

Mapeo HTTP:

| Error | HTTP | UI |
|---|---|---|
| `BriefingUnavailableError` | 200 + componente unavailable (GET) / 403 (PATCH) | Copy amable R5 |
| `BriefingItemNotAllowedError` | 403 | Sin cambio en DB |
| Zod validation | 400 | Toast / inline, no stack trace |
| Rate limit | 429 | «Demasiados intentos, esperá un momento» |

## Autosave (cliente)

- Debounce **600 ms** en inputs de texto; **inmediato** en `bool`, `tri`, `select`.
- Fetch `PATCH` al API route; indicador optimista (R3).
- Reintento simple: **1 retry** tras 2 s si falla red (sin IndexedDB en MVP; cola completa queda para #7).
- Recarga de página restaura valores desde server (`load` incluye respuestas guardadas).

## UX / marca SyS

- Viewport mobile-first; `max-w-lg mx-auto`, padding generoso.
- Logo arriba, saludo R10, campos con `label` + `help_text` sin jerga.
- Botón «Enviar» fijo o sticky al pie en mobile.
- Paleta y tipografía según skill `sys-brand` (azul SyS, fondo claro, bordes redondeados).
- Wizard: agrupar ítems por `sort_order` en bloques de ~4 ítems cuando `items.length > 8`.

## Seguridad

- Token no enumerable (ya generado en #4); validación solo server-side.
- SQL parametrizado en todas las queries.
- Rate limit R11 en PATCH (y opcionalmente en submit).
- Load NO incluye: scores, `audit_section_score`, ítems no-cliente, otras auditorías.
- Errores al cliente sin stack traces (convenciones).

## Alternativa descartada

**Form actions únicas para autosave y envío (sin API route).**

Descartada porque el debounce client-side requiere fetch asíncrono frecuente; un `+server.ts` PATCH mantiene el envelope JSON consistente (`docs/conventions.md`) y evita recargas completas de página. El envío sí usa form action SvelteKit para accesibilidad y progressive enhancement.

## Trazabilidad R → tests (plantilla impl)

Documentar en `progress/impl_05_briefing_externo.md`:

| R | Test principal |
|---|---|
| R1 | `briefing-load.test.ts`, `e2e/briefing.spec.ts` |
| R2 | `briefing-form.test.ts` |
| R3 | `briefing-save.test.ts` |
| R4 | `briefing-submit.test.ts` |
| R5, R8 | `briefing-load.test.ts`, `briefing-token.test.ts`, e2e token inválido |
| R6 | `e2e/briefing.spec.ts` viewport móvil |
| R7 | `briefing-save.test.ts` |
| R9 | `briefing-submit.test.ts`, e2e confirmación |
| R10 | `briefing-form.test.ts`, e2e header |
| R11 | `briefing-rate-limit.test.ts` |
| R12 | `briefing-validation.test.ts` |
| R13 | `briefing-form.test.ts` |
| R14 | suite `tests/api/briefing-*` |
| R15 | `e2e/briefing.spec.ts` flujo feliz |
