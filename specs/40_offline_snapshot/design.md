# Design — #40 Snapshot local del relevamiento (recuperación offline)

## Archivos a crear

| Archivo | Tipo | Descripción |
|---|---|---|
| `src/lib/client/form/draft-store.ts` | nuevo | API IDB del store `form_draft`: openDb (versionada), saveDraft, loadDraft, deleteDraft. Eleva la versión de `auditapp_form` a 2. |
| `src/lib/components/form/DraftRecoveryBanner.svelte` | nuevo | Banner de recuperación (Restaurar / Descartar). Recibe `savedAt: string`, emite `restore` y `discard`. |
| `tests/draft-store.test.ts` | nuevo | Unit tests de draft-store con fake-indexeddb. |
| `tests/draft-recovery.test.ts` | nuevo | Unit tests del efecto de restauración sobre el estado del form (lógica pura). |

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/lib/client/form/retry-queue.ts` | Elevar `DB_VERSION` a 2 y crear el store `form_draft` en `onupgradeneeded`. Exportar `DB_NAME` y `DB_VERSION` como constantes para que `draft-store.ts` las importe. |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | (1) Importar `DraftRecoveryBanner`; (2) en `onMount` llamar `loadDraft(auditId)` y setear estado reactivo `pendingDraft`; (3) pasar el mapa completo de respuestas a `saveDraft` dentro del callback que envuelve `scheduleSave`; (4) tras flush exitoso de la retry-queue (cola vacía + último save `saved`), llamar `deleteDraft(auditId)`. |

---

## IDB schema — versión 2

```
DB: auditapp_form  (version 2)
├── form_retry_queue   keyPath: ['auditId', 'itemId']   (existente, sin cambios)
└── form_draft         keyPath: 'auditId'               (nuevo)
```

La transición de versión 1 → 2 solo agrega el store nuevo; los datos de `form_retry_queue` no se
tocan.

---

## Firmas nuevas

### `src/lib/client/form/draft-store.ts`

```typescript
export type DraftResponses = Record<
  string,
  { value: unknown; na: boolean; notes: string | null }
>;

export type FormDraft = {
  auditId: string;
  savedAt: string; // ISO 8601 UTC
  responses: DraftResponses;
};

/** Abre (o actualiza) la IDB a la versión 2. */
function openDb(): Promise<IDBDatabase>

/** Guarda o reemplaza el draft para auditId. No lanza; loguea en warn si falla. */
export async function saveDraft(draft: FormDraft): Promise<void>

/** Devuelve el draft almacenado o null si no existe. */
export async function loadDraft(auditId: string): Promise<FormDraft | null>

/** Elimina el draft. No lanza si no existe. */
export async function deleteDraft(auditId: string): Promise<void>
```

### `src/lib/components/form/DraftRecoveryBanner.svelte`

```typescript
// Props (Svelte 5 runes)
let { savedAt, onrestore, ondiscard }: {
  savedAt: string;         // ISO 8601; el banner lo formatea como fecha/hora local
  onrestore: () => void;
  ondiscard: () => void;
} = $props();
```

---

## Integración en `+page.svelte`

### Escritura del draft (R2, R3, R4)

Dentro del wrapper de `scheduleSave` existente, justo antes (o después) de llamar al autosave
original, construir el snapshot del mapa de respuestas y llamar `saveDraft`. El mapa se arma desde
el estado reactivo del form (`responses` ya existente en la página). La llamada es fire-and-forget
(`void saveDraft(...).catch(console.warn)`).

### Detección al montar (R7, R8, R9, R10)

```typescript
onMount(async () => {
  const draft = await loadDraft(auditId);
  if (draft) pendingDraft = draft;
  // ... resto del onMount existente
});
```

El banner se renderiza condicionalmente cuando `pendingDraft !== null`.

### Restauración (R11, R12, R13, R14)

```typescript
function handleRestore() {
  if (!pendingDraft) return;
  for (const [itemId, r] of Object.entries(pendingDraft.responses)) {
    responses[itemId] = { value: r.value, na: r.na, notes: r.notes };
    dirtyItems.add(itemId); // marca dirty para autosave
  }
  pendingDraft = null; // oculta banner (R14)
  // NO disparar PATCH aquí (R13)
}
```

### Limpieza (R5)

En el callback `onFlushed` que ya recibe la señal de que la retry-queue quedó vacía (tras
`registerOnlineFlush` o en el path de `patch` con outcome `saved`), añadir:

```typescript
if (retryQueue.length === 0) {
  void deleteDraft(auditId);
}
```

---

## Actualización de versión IDB

`retry-queue.ts` exportará `DB_NAME = 'auditapp_form'` y `DB_VERSION = 2`. `draft-store.ts`
importará ambas constantes para abrir la misma base con la misma versión; el `onupgradeneeded`
manejará la creación del store `form_draft` cuando `oldVersion < 2`.

El `onupgradeneeded` en `retry-queue.ts` se extiende:

```typescript
req.onupgradeneeded = (event) => {
  const db = req.result;
  if (!db.objectStoreNames.contains('form_retry_queue')) {
    db.createObjectStore('form_retry_queue', { keyPath: ['auditId', 'itemId'] });
  }
  if ((event as IDBVersionChangeEvent).oldVersion < 2) {
    if (!db.objectStoreNames.contains('form_draft')) {
      db.createObjectStore('form_draft', { keyPath: 'auditId' });
    }
  }
};
```

---

## Alternativa descartada

**Opción: usar localStorage en vez de IndexedDB.**

Descartada porque localStorage tiene límite de ~5 MB sincrónico (bloquea el hilo principal) y no
puede almacenar estructuras grandes de grilla/tabla anidadas. La IDB ya está presente y usada por
`retry-queue`; extenderla es consistente con el patrón del proyecto y no añade dependencias.

**Opción: usar el mecanismo de exportar `FormBackup` (backup.ts) como draft.**

Descartada porque `FormBackup` es un formato de intercambio usuario-visible (JSON descargable,
schema versionado). Usarlo como draft interno acoplaría dos concerns distintos. El draft es
transitorio e interno; el backup es explícito y portable.

---

## Consideraciones de seguridad y privacidad

- El draft vive exclusivamente en la IDB del navegador del técnico, nunca se transmite a terceros.
- No se almacenan binarios de fotos (R19); el draft es solo metadatos de respuesta.
- La limpieza automática (R5) asegura que el dato no persista indefinidamente tras sincronizarse.
