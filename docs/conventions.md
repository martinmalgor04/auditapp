# Convenciones de código — auditapp

> Homogeneidad extrema. El repo debe parecerse a sí mismo en todas partes.

## TypeScript

- **Strict mode** habilitado (`strict: true` en tsconfig).
- **Tipos explícitos** en fronteras (API, DB, props públicas). Inferencia OK en locals.
- **Sin `any`** salvo justificación documentada en spec.
- **Imports:** externos primero, luego `$lib/`, luego relativos.
- Líneas máximo 100 caracteres.

## Nombres

| Tipo | Convención | Ejemplo |
|---|---|---|
| Archivos TS/Svelte | `kebab-case` | `audit-response.ts`, `+page.svelte` |
| Tipos / interfaces | `PascalCase` | `AuditResponse`, `FieldType` |
| Funciones / variables | `camelCase` | `loadAuditById`, `sectionScore` |
| Constantes | `UPPER_SNAKE` | `MAX_UPLOAD_BYTES` |
| Tablas SQL | `snake_case` | `audit_response`, `template_item` |
| Migraciones | `NNN_slug.sql` | `001_initial_schema.sql` |

## SvelteKit

- `+page.server.ts` / `+layout.server.ts` para data loading server-side.
- `hooks.server.ts` para auth (`event.locals.user`).
- Form actions o `+server.ts` para mutaciones — nunca lógica de DB en `.svelte`.
- Componentes pequeños (<200 líneas). Extraer si crece.

## Base de datos

- SQL parametrizado siempre (`sql\`...\`` con postgres.js).
- PK `uuid` default `gen_random_uuid()`.
- Timestamps `timestamptz`. Borrado lógico con `archived_at` donde aplique.
- Una migración por cambio de schema, idempotente donde sea posible.

## Tests

- Unit: `tests/<modulo>.test.ts` con vitest.
- Integration API: `tests/api/<ruta>.test.ts`.
- E2E: `e2e/<flujo>.spec.ts` con playwright.
- Nombres descriptivos: `returns 401 when session expired`.
- Fixtures en `tests/fixtures/`. No mocks de DB en integration — usar test DB o transacciones.

## Manejo de errores

```typescript
// Errores de dominio tipados
export class AuditNotFoundError extends Error {
  readonly code = 'AUDIT_NOT_FOUND';
}

// API envelope
export function apiError(message: string, status = 400) {
  return json({ success: false, data: null, error: message }, { status });
}
```

Nunca exponer stack traces al cliente. Loguear contexto en server.

## Comentarios

Por defecto **no**. Solo para invariantes no obvios o decisiones de negocio SyS.

## Seguridad

- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`.
- Rate limit en `/login`.
- Presigned URLs R2 con TTL corto.
- Validar rol server-side en cada acción sensible.
