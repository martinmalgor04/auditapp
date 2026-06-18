# Design — 28_flujo_form_dinamico

> CÓMO. Tres mejoras de UX sobre el form técnico existente: chip de estado por
> ítem, navegación al próximo pendiente y animación del score. Cambios puramente
> de presentación cliente. Sin nuevas dependencias, sin migraciones, sin cambios
> al modelo de datos ni al flujo de guardado.

## 1. Resumen de la arquitectura del cambio

```
+page.svelte
│  sectionScores: Map (ya existe)
│  itemStates: Map<itemId, ItemStatus>  ← nuevo $derived
│  nextPendingItem(): { sectionId, itemId } | null  ← nueva función pura
│
├── SectionNav  (prop nueva: sectionProgress)
│     muestra n/total por sección
│
├── FieldRenderer  (prop nueva: status: ItemStatus)
│     muestra chip de estado
│
└── LiveSectionScore  (prop nueva: animating: boolean)
      pulso al recibir score nuevo del server
```

No se agrega ninguna llamada al servidor nueva. No se cambia el modelo de datos.
La única fuente de verdad del score sigue siendo `onSectionScore` del autosave.

---

## 2. Función pura de estado por ítem

Se extrae a `src/lib/client/form/item-status.ts` para que sea testeable aislada.

```ts
// src/lib/client/form/item-status.ts

export type ItemStatus = 'pendiente' | 'respondido' | 'con_observacion';

/**
 * Determina el estado visual de un ítem del form.
 * Pura: sin efectos, sin I/O. Cubre R1–R4.
 */
export function itemStatus(params: {
  value: unknown;
  na: boolean;
  notes: string | null | undefined;
}): ItemStatus {
  const answered = isAnswered(params.value, params.na);
  if (answered && params.notes && params.notes.trim() !== '') {
    return 'con_observacion';
  }
  if (answered) return 'respondido';
  return 'pendiente';
}

function isAnswered(value: unknown, na: boolean): boolean {
  if (na) return true;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (
    typeof value === 'object' &&
    'rows' in (value as object) &&
    Array.isArray((value as { rows: unknown[] }).rows) &&
    (value as { rows: unknown[] }).rows.length === 0
  ) return false;
  return true;
}

/**
 * Conteo de progreso por sección. Cubre R18–R19.
 */
export function sectionProgress(items: Array<{ value: unknown; na: boolean; notes: string | null | undefined }>): {
  answered: number;
  total: number;
} {
  const answered = items.filter((it) => itemStatus(it) !== 'pendiente').length;
  return { answered, total: items.length };
}
```

---

## 3. Lógica de "próximo pendiente"

Se extrae a `src/lib/client/form/next-pending.ts`. Pura, sin DOM ni I/O. Cubre R9–R13.

```ts
// src/lib/client/form/next-pending.ts

import { itemStatus } from './item-status';

export type PendingTarget = {
  sectionId: string;
  sectionIndex: number;
  itemId: string;
  itemIndex: number;
};

/**
 * Encuentra el próximo ítem pendiente.
 * Busca desde el ítem siguiente al último respondido dentro de la sección
 * activa, luego en las secciones siguientes, luego en las anteriores (circular).
 * Devuelve null si no hay ningún pendiente (R11).
 * Cubre R9–R13.
 */
export function nextPending(
  sections: Array<{
    id: string;
    items: Array<{ id: string; value: unknown; na: boolean; notes: string | null | undefined }>;
  }>,
  activeSectionIndex: number,
  lastVisitedItemIndex: number   // dentro de la sección activa; -1 si ninguno
): PendingTarget | null {
  const n = sections.length;

  // Buscar dentro de la sección activa, desde lastVisitedItemIndex+1 en adelante
  const active = sections[activeSectionIndex];
  if (active) {
    for (let i = lastVisitedItemIndex + 1; i < active.items.length; i++) {
      if (itemStatus(active.items[i]) === 'pendiente') {
        return { sectionId: active.id, sectionIndex: activeSectionIndex, itemId: active.items[i].id, itemIndex: i };
      }
    }
  }

  // Secciones siguientes, luego anteriores (circular, R12)
  for (let offset = 1; offset < n; offset++) {
    const idx = (activeSectionIndex + offset) % n;
    const sec = sections[idx];
    for (let i = 0; i < sec.items.length; i++) {
      if (itemStatus(sec.items[i]) === 'pendiente') {
        return { sectionId: sec.id, sectionIndex: idx, itemId: sec.items[i].id, itemIndex: i };
      }
    }
  }

  // La sección activa desde el inicio (ítems antes de lastVisitedItemIndex)
  if (active) {
    for (let i = 0; i <= lastVisitedItemIndex; i++) {
      if (itemStatus(active.items[i]) === 'pendiente') {
        return { sectionId: active.id, sectionIndex: activeSectionIndex, itemId: active.items[i].id, itemIndex: i };
      }
    }
  }

  return null; // no quedan pendientes (R11)
}
```

---

## 4. Archivos a crear / modificar

| Archivo | Tipo | Cambio |
|---|---|---|
| `src/lib/client/form/item-status.ts` | **crear** | `itemStatus`, `sectionProgress` (funciones puras, R1–R4, R18–R19) |
| `src/lib/client/form/next-pending.ts` | **crear** | `nextPending` (función pura, R9–R13) |
| `src/lib/components/form/field-renderer.svelte` | **modificar** | Prop nueva `status?: ItemStatus`; chip de estado en el markup (R5, R7) |
| `src/lib/components/form/live-section-score.svelte` | **modificar** | Prop nueva `animating?: boolean`; keyframe pulso; `prefers-reduced-motion` (R14, R16–R17) |
| `src/lib/components/form/section-nav.svelte` | **modificar** | Prop nueva `sectionProgress?: Map<string, {answered:number, total:number}>`; conteo n/total por sección (R18, R20) |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | **modificar** | Derivar `itemStates`, `progressBySec`, trigger `animating`, función `goToNextPending`, botón "próximo pendiente" (R6, R8–R10, R14, R20) |
| `tests/form-dynamic-flow.test.ts` | **crear** | Tests puros de `itemStatus`, `sectionProgress`, `nextPending` (R1–R13, R18–R19, R23) |

No se crean componentes nuevos. No se añaden dependencias. No hay migración SQL.

---

## 5. Cambios en +page.svelte

### 5.1 Estado derivado de ítems (R1, R6, R20)

```svelte
<script lang="ts">
  import { itemStatus, sectionProgress } from '$lib/client/form/item-status';
  import { nextPending } from '$lib/client/form/next-pending';
  // ...

  // Mapa reactivo: itemId → ItemStatus
  // Se recalcula cada vez que un ítem cambia (onchange/onnoteschange/onnchange)
  // El estado de cada ítem se actualiza en saveItem/handleNotesChange via itemLocalState
  let itemLocalState = $state(
    new Map(
      data.sections.flatMap((s) =>
        s.items.map((it) => [it.id, { value: it.value, na: it.na, notes: it.notes }])
      )
    )
  );

  const itemStatuses = $derived(
    new Map(
      [...itemLocalState.entries()].map(([id, it]) => [id, itemStatus(it)])
    )
  );

  const progressBySec = $derived(
    new Map(
      data.sections.map((sec) => [
        sec.id,
        sectionProgress(
          sec.items.map((it) => itemLocalState.get(it.id) ?? { value: it.value, na: it.na, notes: it.notes })
        )
      ])
    )
  );
</script>
```

### 5.2 Actualizar estado local al guardar

En `saveItem`, después de llamar a `autosave.patch`, actualizar `itemLocalState`:

```ts
async function saveItem(itemId, fieldType, value, na = false, notes?) {
  // actualizar estado local inmediatamente (para chip reactivo)
  itemLocalState = new Map(itemLocalState).set(itemId, { value, na, notes ?? null });
  // ... resto igual
}
```

Para notes, desde `onnoteschange` en el `{#each}`, también actualizar:
```ts
onnoteschange={(notes) => {
  itemLocalState = new Map(itemLocalState).set(item.id, {
    ...(itemLocalState.get(item.id) ?? { value: item.value, na: item.na }),
    notes
  });
  void saveItem(item.id, item.fieldType, item.value, item.na, notes);
}}
```

### 5.3 Animación del score (R14)

```ts
let animatingSectionId = $state<string | null>(null);

const autosave = createAutosave(data.auditId, {
  onSectionScore: (sectionId, score, band) => {
    sectionScores = updateScoreFromApi(sectionScores, sectionId, score, band);
    // disparar animación
    animatingSectionId = sectionId;
    setTimeout(() => {
      if (animatingSectionId === sectionId) animatingSectionId = null;
    }, 800); // duración del pulso
  }
});
```

### 5.4 Botón "próximo pendiente" (R8–R12)

```ts
let lastVisitedItemIndex = $state(-1);
let noPendingMessage = $state(false);

function goToNextPending() {
  const secs = data.sections.map((sec) => ({
    id: sec.id,
    items: sec.items.map((it) => ({
      id: it.id,
      ...(itemLocalState.get(it.id) ?? { value: it.value, na: it.na, notes: it.notes })
    }))
  }));
  const target = nextPending(secs, activeSectionIndex, lastVisitedItemIndex);
  if (!target) {
    noPendingMessage = true;
    setTimeout(() => (noPendingMessage = false), 2500);
    return;
  }
  if (target.sectionIndex !== activeSectionIndex) {
    activeSectionId = target.sectionId;
    lastVisitedItemIndex = -1;
  }
  lastVisitedItemIndex = target.itemIndex;
  // scroll al ítem
  setTimeout(() => {
    document.getElementById(`item-${target.itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50); // esperar el render de la nueva sección
}
```

Botón en la UI (tras `LiveSectionScore`, antes de la lista de ítems):

```svelte
<div class="flex items-center gap-2">
  <button
    type="button"
    class="min-h-[var(--sys-touch-min)] rounded-sys-app border border-sys-electrico/30 bg-sys-electrico/5
           px-3 text-sm font-medium text-sys-electrico hover:bg-sys-electrico/10"
    onclick={goToNextPending}
    data-action="next-pending"
  >
    Próximo pendiente →
  </button>
  {#if noPendingMessage}
    <span class="text-sm text-emerald-700" role="status">Sin pendientes</span>
  {/if}
</div>
```

---

## 6. Cambios en field-renderer.svelte (chip de estado, R5–R7)

Prop nueva:
```ts
let { item, status = 'pendiente', ...resto } = $props<{
  item: FieldItem;
  status?: ItemStatus;
  // ... callbacks existentes
}>();
```

Chip en el markup (dentro del `<article>`, junto a los badges existentes, sin
layout shift — inline-flex, no block):

```svelte
<!-- Chip de estado: inline-flex dentro del flex-wrap ya existente -->
<span
  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
    {status === 'con_observacion'
      ? 'border border-sys-naranja/40 bg-sys-naranja/10 text-sys-naranja'
      : status === 'respondido'
        ? 'border border-sys-electrico/30 bg-sys-electrico/10 text-sys-electrico'
        : 'border border-slate-200 bg-slate-50 text-slate-500'}"
  data-item-status={status}
  aria-label="Estado: {status === 'con_observacion' ? 'con observación' : status}"
>
  {status === 'con_observacion' ? '⚠' : status === 'respondido' ? '✓' : '○'}
  {status === 'con_observacion' ? 'observación' : status === 'respondido' ? 'respondido' : 'pendiente'}
</span>
```

Se coloca el chip dentro del `<div class="flex flex-wrap items-center gap-2">` ya
existente (donde están `MethodBadge`, `PreloadedBadge` y el botón N/A). Sin height
propio: hereda el flex-wrap del contenedor → sin layout shift (R7).

Se añade `id="item-{item.id}"` al `<article>` para que `scrollIntoView` funcione.

---

## 7. Cambios en live-section-score.svelte (animación, R14–R17)

Prop nueva:
```ts
let { score, band, animating = false } = $props<{
  score: number | null;
  band: ScoreBand;
  animating?: boolean;
}>();
```

Clase condicional y estilos:
```svelte
<div
  class="rounded-lg border px-3 py-2 text-sm font-medium {bandClass}"
  class:score-pulse={animating}
  data-score-band={band}
  data-animating={animating}
  aria-label="Score de sección"
>
  <!-- contenido igual -->
</div>

<style>
  .score-pulse {
    animation: score-pulse var(--sys-fast, 300ms) var(--sys-ease, ease-out) 1;
  }
  @keyframes score-pulse {
    0%   { opacity: 1; transform: scale(1.04); }
    50%  { opacity: 0.85; }
    100% { opacity: 1; transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .score-pulse { animation: none; } /* R16 */
  }
</style>
```

---

## 8. Cambios en section-nav.svelte (progreso por sección, R18–R20)

Prop nueva (opcional, retrocompatible):
```ts
let {
  sections,
  activeSectionId,
  progressPct,
  sectionProgress,
  onselect
} = $props<{
  sections: FormSection[];
  activeSectionId: string;
  progressPct: number;
  sectionProgress?: Map<string, { answered: number; total: number }>;
  onselect?: (sectionId: string) => void;
}>();
```

Mostrar conteo junto al label de la sección:
```svelte
<button ...>
  {section.code} — {section.title}
  {#if sectionProgress?.has(section.id)}
    {@const prog = sectionProgress.get(section.id)!}
    <span class="ml-auto text-xs opacity-70">{prog.answered}/{prog.total}</span>
  {/if}
</button>
```

---

## 9. Errores / casos borde

| Caso | Manejo |
|---|---|
| Sección sin ítems | `sectionProgress` retorna `{ answered: 0, total: 0 }`; `nextPending` la omite |
| Todos los ítems respondidos | `nextPending` devuelve `null`; mensaje "Sin pendientes" (R11) |
| `animatingSectionId` cambia antes de que expire el timeout | el `setTimeout` de 800ms comprueba `=== sectionId` antes de limpiar |
| `scrollIntoView` con `id` no encontrado | silencioso (optional chaining `?.`) |
| `itemLocalState` out of sync si `invalidateAll()` recarga la página | tras `invalidateAll`, el componente remonta y `itemLocalState` se reinicializa desde `data.sections` |

---

## 10. Firmas nuevas exportadas

```ts
// item-status.ts
export type ItemStatus = 'pendiente' | 'respondido' | 'con_observacion';
export function itemStatus(params: { value: unknown; na: boolean; notes?: string | null }): ItemStatus;
export function sectionProgress(items: Array<{ value: unknown; na: boolean; notes?: string | null }>): { answered: number; total: number };

// next-pending.ts
export type PendingTarget = { sectionId: string; sectionIndex: number; itemId: string; itemIndex: number };
export function nextPending(sections: Array<{ id: string; items: Array<{ id: string; value: unknown; na: boolean; notes?: string | null }> }>, activeSectionIndex: number, lastVisitedItemIndex: number): PendingTarget | null;
```

Props nuevas en componentes existentes (retrocompatibles, todas opcionales):
- `field-renderer.svelte`: `status?: ItemStatus` (default `'pendiente'`)
- `live-section-score.svelte`: `animating?: boolean` (default `false`)
- `section-nav.svelte`: `sectionProgress?: Map<string, {answered:number, total:number}>`

---

## 11. Alternativas descartadas

1. **Chip de estado calculado en el servidor** (agregar columna `status` al
   `audit_response` o al resultado de `loadAuditForm`). Descartado: requeriría
   migración SQL y rompe R21. El cálculo es trivial desde los datos ya disponibles
   en cliente.

2. **`nextPending` con referencias DOM** (buscar el primer `[data-item-status=pendiente]`
   visible en el viewport). Descartado: acoplamiento al DOM impide testing unitario
   (R13). La función pura es testeable con fixtures simples.

3. **Score animado en cliente** (recalcular el score localmente al cambiar una
   respuesta para animar la transición). Descartado: viola R15 y R23 — crea una
   segunda fuente de verdad divergente del servidor. El trigger de animación es la
   llegada del `onSectionScore` del autosave, no un recálculo propio.

4. **Contador de progreso solo global** (mantener solo `progressPct`). Descartado:
   el acceptance criteria pide que la barra/indicador de progreso **por sección**
   refleje los chips de estado. Aporta visibilidad per-sección sin costo extra dado
   que los datos ya están en cliente.

5. **Store Svelte global para `itemLocalState`** (en vez de estado en `+page.svelte`).
   Descartado: `itemLocalState` solo lo necesita el `+page.svelte`; no hay múltiples
   consumers. El store añadiría complejidad sin beneficio.
