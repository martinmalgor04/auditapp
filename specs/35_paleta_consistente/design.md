# Design — 35_paleta_consistente

## Decisiones de diseño

### 1. Cambios puramente de clase CSS — sin nuevo código

No se crean componentes ni funciones nuevas. Todos los cambios son sustituciones
de strings en archivos existentes. No hay migración de DB ni cambio de API.

### 2. Tabla de equivalencias completa

| Clase Tailwind base | Token sys equivalente | Contexto |
|---|---|---|
| `text-slate-900` | `text-sys-profundo` | Títulos, texto principal |
| `text-slate-800` | `text-sys-profundo` | Labels de campo |
| `text-slate-700` | `text-sys-medio` | Texto secundario |
| `text-slate-600` | `text-sys-medio` | Texto muted fuerte |
| `text-slate-500` | `text-[var(--sys-text-muted-light)]` | Muted / placeholder |
| `text-slate-400` | `text-[var(--sys-text-muted-light)]` | Muy muted |
| `bg-slate-900` | `bg-sys-profundo` | Fondo oscuro |
| `bg-slate-800` | `bg-sys-medio` | Fondo oscuro secundario |
| `bg-slate-50`, `bg-gray-50` | `bg-sys-offwhite` | Fondo claro / hover |
| `bg-white` | `bg-sys-blanco` | Fondo blanco |
| `border-slate-300` | `border-[var(--sys-border-subtle)]` | Bordes sutiles |
| `border-gray-200` | `border-[var(--sys-border-subtle)]` | Bordes sutiles |
| `ring-slate-*` | `ring-sys-electrico` o eliminar | Focus rings |

### 3. Labels de fields — usar clase semántica

En los field types, los labels usan `text-slate-800` inline. Se reemplaza por
la clase `.sys-field-label` que está definida en `app.css`:

```css
.sys-field-label {
  @apply text-sm font-medium text-[var(--sys-text-muted-light)];
}
```

Esto además centraliza el estilo del label: si se cambia `sys-field-label`
en el futuro, todos los fields se actualizan solos.

### 4. Títulos de pestaña — acceso al nombre de empresa

Los datos de la auditoría (incluyendo el nombre de empresa del cliente) ya
están disponibles en el `PageData` de las rutas `/auditorias/[id]/*`. Solo
hay que usarlos en el `<svelte:head>`:

```svelte
<svelte:head>
  <title>{data.audit.clientName} — Form | SyS Audit</title>
</svelte:head>
```

El campo exacto depende de lo que devuelva el `+page.server.ts` de cada ruta
(verificar antes de implementar: puede ser `data.audit.client_name`,
`data.audit.empresa`, etc.).

---

## Archivos a modificar

### Paleta

- `src/routes/(app)/auditorias/new/+page.svelte`
- `src/routes/(app)/usuarios/+page.svelte`
- `src/lib/components/form/fields/text-field.svelte`
- `src/lib/components/form/fields/number-field.svelte`
- (cualquier otro field en `form/fields/` con `slate-*` en labels — verificar con grep)

### Títulos

- `src/routes/(app)/auditorias/[id]/+page.svelte`
- `src/routes/(app)/auditorias/[id]/form/+page.svelte`
- `src/routes/(app)/auditorias/[id]/cierre/+page.svelte`

---

## Procedimiento de implementación sugerido

1. `grep -r "slate-\|gray-" src/routes/\(app\)/auditorias/new/ src/routes/\(app\)/usuarios/ src/lib/components/form/fields/`
2. Aplicar la tabla de equivalencias archivo por archivo.
3. Para los `<title>`, verificar el shape de `data` en cada ruta primero.
4. `pnpm run check` para confirmar cero errores nuevos.
