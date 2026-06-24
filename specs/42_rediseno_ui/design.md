# Design — #42 42_rediseno_ui

> Decisiones técnicas, archivos a crear/modificar, firmas y alternativa descartada.

---

## Archivos a crear

| Archivo | Propósito |
|---|---|
| `src/lib/components/ui/ProgressBar.svelte` | Barra de progreso de navegación global (R4) |
| `src/lib/components/ui/HeaderMobile.svelte` | Header navy gradient para mobile (R5) |
| `src/lib/components/ui/Sidebar.svelte` | Sidebar web 220px (R6) |
| `src/lib/components/ui/BottomNav.svelte` | Bottom nav mobile unificado (R7) |
| `src/lib/components/ui/StatusBadge.svelte` | Badge de estado de auditoría (R13) |
| `src/lib/components/ui/ChipPill.svelte` | Pill de filtro reutilizable (R23) |
| `src/lib/components/ui/ChipFilters.svelte` | Fila de chips de filtro (R9, R21) |
| `src/lib/components/ui/ItemProgressBar.svelte` | Barra de progreso de ítem 5px (R22) |
| `src/lib/components/backoffice/AuditCard.svelte` | Card de auditoría mobile (R10) |
| `src/lib/components/backoffice/TableroHeader.svelte` | Top bar + filter bar web del tablero (R12) |
| `src/lib/components/form/FormHeader.svelte` | Header dinámico del form técnico (R14) |
| `src/lib/components/form/SectionChips.svelte` | Chips de sección con estado (R15) |
| `src/lib/components/form/QuestionCard.svelte` | Card Sí/No/Parcial para bool/tri (R16) |
| `src/lib/components/form/FormNextButton.svelte` | Botón sticky "Próximo pendiente" (R17) |
| `src/lib/components/mercado/StatCard.svelte` | Stat card del grid 2×2 (R18) |
| `src/lib/components/mercado/ErpDistribution.svelte` | Barras de distribución ERP (R19) |
| `src/lib/components/mercado/SectionScoreBar.svelte` | Barras de score por sección (R20) |
| `tests/ui/tokens.test.ts` | Verifica variables CSS y config Tailwind |
| `tests/ui/layout.test.ts` | Verifica ProgressBar |
| `tests/ui/header-mobile.test.ts` | Verifica HeaderMobile |
| `tests/ui/sidebar.test.ts` | Verifica Sidebar |
| `tests/ui/bottom-nav.test.ts` | Verifica BottomNav |
| `tests/ui/tablero.test.ts` | Verifica ChipFilters, AuditCard, tabla web, TableroHeader |
| `tests/ui/status-badge.test.ts` | Verifica StatusBadge |
| `tests/ui/progress-bar.test.ts` | Verifica ItemProgressBar |
| `tests/ui/chip-pill.test.ts` | Verifica ChipPill |
| `tests/ui/form-header.test.ts` | Verifica FormHeader |
| `tests/ui/section-chips.test.ts` | Verifica SectionChips |
| `tests/ui/question-card.test.ts` | Verifica QuestionCard |
| `tests/ui/form-next.test.ts` | Verifica FormNextButton |
| `tests/ui/mercado.test.ts` | Verifica StatCard, ErpDistribution, SectionScoreBar |
| `e2e/ui-layout.spec.ts` | Layout shell end-to-end |
| `e2e/ui-tokens.spec.ts` | Tokens en browser end-to-end |

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/styles/brand.css` | Añadir/actualizar variables CSS de R2; añadir `--sys-font-base` |
| `tailwind.config.js` (o `.ts`) | Extender `colors`, `fontFamily` con claves que mapean a variables de R2/R1 |
| `src/routes/(app)/+layout.svelte` | Componer HeaderMobile + Sidebar + ProgressBar + BottomNav; ajustar `<main>` padding (R8) |
| `src/routes/(app)/+page.svelte` | Integrar ChipFilters, AuditCard (mobile) y tabla (desktop); reemplazar bottom nav legacy (R9–R12) |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | Integrar FormHeader, SectionChips, QuestionCard, FormNextButton (R14–R17) |
| `src/routes/(app)/mercado/+page.svelte` | Integrar StatCard, ErpDistribution, SectionScoreBar, ChipFilters (R18–R21) |

---

## Firmas de componentes

### `ProgressBar.svelte`
```svelte
<!-- Props: ninguna. Reacciona al store $navigating de SvelteKit -->
<!-- Renderiza: <div class="progress-bar" style:width={...}> fixed top-0 z-50 h-[6px] bg-[--sys-primary] -->
```

### `HeaderMobile.svelte`
```svelte
<script lang="ts">
  export let title: string;
  export let subtitle: string = '';
  export let user: { name: string };
  export let showNew: boolean = false;
  export let onNew: () => void = () => {};
</script>
```

### `Sidebar.svelte`
```svelte
<script lang="ts">
  import { page } from '$app/stores';
  export let user: { name: string; role: 'admin' | 'tecnico' };
  // Usa $page.url.pathname para marcar ítem activo
</script>
```

### `BottomNav.svelte`
```svelte
<script lang="ts">
  import { page } from '$app/stores';
  // Sin props; deriva ruta activa de $page
</script>
```

### `StatusBadge.svelte`
```svelte
<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  export let status: AuditStatus;
  export let scoreLow: boolean = false;
</script>
```

### `ChipPill.svelte`
```svelte
<script lang="ts">
  export let label: string;
  export let active: boolean = false;
  export let variant: 'default' | 'blue' | 'green' | 'gray' = 'default';
  export let onClick: () => void = () => {};
</script>
```

### `ChipFilters.svelte`
```svelte
<script lang="ts">
  export let options: Array<{ label: string; value: string }>;
  export let value: string;  // chip activo
  export let onChange: (v: string) => void;
</script>
```

### `ItemProgressBar.svelte`
```svelte
<script lang="ts">
  import type { AuditStatus } from '$lib/audit-status';
  export let value: number;   // 0–100
  export let status: AuditStatus;
</script>
```

### `AuditCard.svelte`
```svelte
<script lang="ts">
  import type { AuditListItem } from '$lib/types';
  export let audit: AuditListItem;
</script>
```

Tipo `AuditListItem` (ya existe o se extiende en `src/lib/types.ts`):
```typescript
export interface AuditListItem {
  id: string;
  ref_code: string;
  client_name: string;
  status: AuditStatus;
  types: string[];
  segment?: string;
  progress: number;       // 0–100
  assigned_tech_name?: string;
  scheduled_at?: string;
  score_low?: boolean;
}
```

### `TableroHeader.svelte`
```svelte
<script lang="ts">
  export let auditCount: number;
  export let searchValue: string = '';
  export let onSearch: (q: string) => void;
  export let onNew: () => void;
</script>
```

### `FormHeader.svelte`
```svelte
<script lang="ts">
  export let clientName: string;
  export let progress: number;   // 0–100
  export let pending: number;
  export let sectionTitle: string;
  export let onBack: () => void;
</script>
```

### `SectionChips.svelte`
```svelte
<script lang="ts">
  export interface SectionChipData {
    code: string;
    done: number;
    total: number;
  }
  export let sections: SectionChipData[];
  export let activeCode: string;
  export let onSelect: (code: string) => void;
</script>
```

### `QuestionCard.svelte`
```svelte
<script lang="ts">
  export type TriValue = 'si' | 'no' | 'parcial' | null;
  export let question: string;
  export let value: TriValue;
  export let hasObservation: boolean = false;
  export let relevance: 'alta' | 'media' | null = null;
  export let onChange: (v: TriValue) => void;
  export let onAddObservation: () => void;
</script>
```

### `FormNextButton.svelte`
```svelte
<script lang="ts">
  export let pendingCount: number;
  export let onClick: () => void;
</script>
```

### `StatCard.svelte`
```svelte
<script lang="ts">
  export type StatCategory = 'IT' | 'ERP' | 'Cerradas' | 'Upsell';
  export let category: StatCategory;
  export let value: number;
  export let label: string;
  export let n: number;   // cantidad de auditorías
</script>
```

### `ErpDistribution.svelte`
```svelte
<script lang="ts">
  export interface ErpBar { erp: string; pct: number; color: string }
  export let data: ErpBar[];
</script>
```

### `SectionScoreBar.svelte`
```svelte
<script lang="ts">
  export let label: string;
  export let score: number;   // 0–100
</script>
```

---

## Errores reutilizados

No se introducen errores tipados nuevos en esta feature (sin cambios en capa de dominio/DB).
Los errores de navegación usan el mecanismo existente `error()` de SvelteKit.

---

## Estructura de clases Tailwind esperada (ejemplos)

```
Header mobile:     bg-gradient-to-br from-[--sys-navy] to-[--sys-navy-mid]
Sidebar:           w-[220px] bg-[--sys-navy] fixed left-0 top-0 h-full hidden lg:flex
BottomNav:         h-16 bg-[--sys-navy] fixed bottom-0 left-0 right-0 flex lg:hidden
                   pb-[env(safe-area-inset-bottom)]
AuditCard:         bg-white rounded-xl shadow-[0_1px_4px_rgba(0,0,0,.08)] p-3
Chip activo:       bg-[--sys-primary] text-white rounded-full
Chip inactivo:     bg-[--sys-bg-app] border border-[--sys-border] rounded-full
Tabla header cell: text-[9px] font-bold uppercase text-[--sys-text-faint] bg-[#F7F9FB]
```

---

## Alternativa descartada

**Shadcn-svelte como base de componentes.**
Se evaluó adoptar shadcn-svelte para acelerar los componentes base (badges, buttons, chips).
Se descartó porque:
1. Introduce `bits-ui` y `tailwind-variants` como dependencias nuevas que no están en el stack
   actual ni en `docs/conventions.md`.
2. Los tokens de shadcn chocan con el sistema `--sys-*` existente y obligarían a remapear
   variables en dos capas.
3. Los componentes de esta feature son de bajo conteo de líneas (<100 por componente) y no
   justifican el overhead de una librería UI.
   
Se construyen los componentes desde cero sobre Tailwind + variables CSS, siguiendo el patrón ya
establecido en `src/lib/components/backoffice/` y `src/lib/components/form/`.

---

## Notas de integración

- **`QuestionCard` y el form existente:** el form técnico (#7) usa `field-renderer.svelte` que
  despacha por `field_type`. `QuestionCard` se integra como la variante para `bool` y `tri`
  dentro de `field-renderer.svelte`, reemplazando los controles actuales de esos tipos. Los
  demás `field_type` (text, number, select, table, photo, etc.) siguen usando sus componentes.

- **Bottom nav unificado:** el componente `BottomNav.svelte` de esta feature reemplaza el
  componente producido por `36_bottom_nav_mobile`. El layout lo importa de la nueva ruta
  `$lib/components/ui/BottomNav.svelte`. El componente viejo puede eliminarse tras la migración.

- **`+page.svelte` del Tablero:** actualmente usa una tabla simple. El rediseño añade
  `AuditCard` (mobile) y mantiene una tabla mejorada (desktop). La data loading en
  `+page.server.ts` no cambia; solo cambia la presentación.

- **Mercado:** la ruta `/mercado/+page.svelte` recibe los datos del `+page.server.ts` existente
  (#18). Solo se reemplazan los componentes de visualización.
