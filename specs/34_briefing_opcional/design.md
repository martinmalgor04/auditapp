# Design — 34_briefing_opcional

## Diagnóstico

La feature es mínima: la entrada de datos ya existe (el admin llena y guarda
los campos CAB en la página de detalle con el botón "Guardar cambios"). Solo
falta un botón que transite el estado a `briefing_completo`.

No hay cambio de schema, no hay nuevo componente de formulario, no hay cambio
al render ni al scoring.

---

## Cambios por archivo

### `src/lib/server/backoffice/briefing-link.ts`

Nueva función pública:

```ts
export async function completarBriefingInternamente(auditId: string): Promise<void>
```

- Reutiliza el helper privado `getAuditForBriefing(auditId)`.
- Valida `status IN ('borrador', 'briefing_enviado')`; si no,
  lanza `InvalidStateTransitionError`.
- `UPDATE audit SET status = 'briefing_completo' WHERE id = $auditId`.
- NO modifica `public_token` (puede quedar nulo o con el token previo; ambos
  son válidos).

### `src/routes/(app)/auditorias/[id]/+page.server.ts`

Nueva action:

```ts
completarBriefingInternamente: async ({ locals, params }) => {
  requireStaff(locals);
  try {
    await completarBriefingInternamente(params.id);
    return { success: true };
  } catch (e) {
    return failFromError(e);
  }
}
```

### `src/routes/(app)/auditorias/[id]/+page.svelte`

En la sección "Briefing", añadir el botón cuando el estado lo permite:

```svelte
{#if data.audit.status === 'borrador'}
  <form method="POST" action="?/generateBriefingLink">
    <button …>Generar link de briefing</button>
  </form>
  <form method="POST" action="?/completarBriefingInternamente" class="mt-2">
    <button type="submit" class="text-sm text-sys-medio hover:text-sys-electrico hover:underline">
      Completar briefing internamente
    </button>
  </form>
{:else if data.audit.status === 'briefing_enviado' || data.audit.status === 'briefing_completo'}
  {#if data.briefingUrl}…{/if}
  {#if data.audit.status === 'briefing_enviado'}
    <form method="POST" action="?/completarBriefingInternamente" class="mt-2">
      <button type="submit" class="text-sm text-sys-medio hover:text-sys-electrico hover:underline">
        Completar briefing internamente
      </button>
    </form>
  {/if}
{/if}
```

---

## Flujo operativo resultante

**Con link al cliente (como hoy):**
```
borrador → [Generar link] → briefing_enviado → [cliente responde] → briefing_completo → en_relevamiento
```

**Sin link al cliente (nuevo):**
```
borrador → [llenar CAB en detalle + Guardar] → [Completar briefing internamente] → briefing_completo → en_relevamiento
```

**Mixto (link enviado pero cliente no respondió):**
```
borrador → [Generar link] → briefing_enviado → [staff llena CAB en detalle + Completar briefing internamente] → briefing_completo → en_relevamiento
```

---

## Alternativa descartada

**Combinado "Guardar + Completar" en un solo botón:** requeriría una action
separada que parsee el form completo Y transite el estado. Más código, mismo
efecto UX porque el admin ya sabe que tiene que guardar antes de avanzar
(el flujo normal tiene ese patrón). Dos acciones separadas son más claras.
