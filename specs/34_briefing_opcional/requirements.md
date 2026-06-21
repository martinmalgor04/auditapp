# Requirements — 34_briefing_opcional

> La página de detalle de auditoría ya muestra y guarda todos los ítems CAB
> (incluyendo `filled_by='cliente'`) via `CabSectionForm` + action `update`.
> El formulario es editable en todos los estados excepto `cerrada`.
> Lo único que falta es un botón que transite el estado a `briefing_completo`
> desde el backoffice, sin requerir que el cliente responda el link externo.

## Contexto verificado

- **`getAuditById` (`src/lib/server/backoffice/audits.ts`):** la query de
  `cabItems` NO filtra por `filled_by` — trae TODOS los ítems de las secciones
  `CAB` (incluyendo `filled_by='cliente'`). Esos ítems se exponen a la UI via
  `data.audit.cabItems`.
- **`CabSectionForm` (`src/lib/components/backoffice/cab-section-form.svelte`):**
  renderiza todos los `cabItems` como campos editables (o readonly si cerrada).
- **Action `update` (`/auditorias/[id]/+page.server.ts`):** llama `parseCabResponses`
  + `updateAudit` sin verificar estado; guarda las respuestas CAB como
  `audit_response` y sincroniza a la tabla `empresa`. Funciona desde `borrador`
  y `briefing_enviado`.
- **`{#if !data.readonly}` en el svelte:** `readonly = audit.status === 'cerrada'`.
  El form CAB ya es editable en `borrador` y `briefing_enviado`.
- **Transiciones disponibles:** `borrador → briefing_enviado` (vía
  `generateBriefingLink`); `briefing_enviado → briefing_completo` (solo desde
  el cliente vía `/briefing/[token]`). No existe transición directa a
  `briefing_completo` desde el backoffice.
- **`FORM_OPEN_STATUSES`** (`src/lib/server/db/audit-form.ts`):
  `['briefing_completo', 'en_relevamiento', 'en_cierre']`. El relevamiento
  técnico (form + botón "Abrir relevamiento técnico") queda desbloqueado
  cuando la auditoría llega a `briefing_completo`.

## Requerimientos

**R1** — El sistema DEBE permitir transicionar una auditoría desde `borrador`
directamente a `briefing_completo` mediante una acción interna del backoffice,
sin generar ni requerir `public_token`.

**R2** — El sistema DEBE permitir transicionar una auditoría desde
`briefing_enviado` a `briefing_completo` mediante la misma acción interna, sin
invalidar el `public_token` existente.

**R3** — SI la auditoría está en cualquier estado distinto de `borrador` o
`briefing_enviado`, el sistema DEBE rechazar la acción con un error descriptivo
y dejar el estado sin cambios.

**R4** — La acción DEBE requerir rol `staff` (admin o técnico); no es pública.

**R5** — MIENTRAS la auditoría está en `borrador`, la sección "Briefing" de la
página de detalle DEBE mostrar la acción "Completar briefing internamente" junto
a la acción existente "Generar link de briefing".

**R6** — MIENTRAS la auditoría está en `briefing_enviado`, la sección "Briefing"
de la página de detalle DEBE mostrar la acción "Completar briefing internamente"
(el cliente no respondió y el staff completa los datos).

**R7** — El link de briefing externo (`/briefing/[token]`) NO DEBE modificarse:
sigue funcionando como hoy.

**R8** — El motor de scoring, el render del informe y el modelo de cierre NO
DEBEN modificarse.

## Trazabilidad requerida

| R | Test mínimo |
|---|---|
| R1 | Acción desde `borrador` → estado `briefing_completo`; `public_token` nulo |
| R2 | Acción desde `briefing_enviado` → estado `briefing_completo`; `public_token` intacto |
| R3 | Acción desde `briefing_completo`, `en_relevamiento`, etc. → error, sin cambio |
| R4 | Sin sesión → rechazado |
| R5/R6 | Verificación manual (UI) |
| R7 | Test existente del briefing externo sigue verde |
