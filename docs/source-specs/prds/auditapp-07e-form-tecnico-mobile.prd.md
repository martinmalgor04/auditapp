# auditapp — Form técnico (mobile-first)

**ID**: SPEC-07e | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 5 de 8 | **Depende de**: 07a, 07b, 07g

---

## Problem

El corazón del sistema: Facu y Simón necesitan cargar una auditoría completa desde el celular, parados en el server room del cliente, con señal intermitente. La carga tiene que ser rápida (mínimo tipeo), fiable (no perder datos por un corte de señal) y cubrir todos los tipos de campos de las plantillas v2 — incluyendo sub-grillas y fotos. Hoy no existe ninguna herramienta para esto; lo hacen en papel o de memoria.

## Evidence

- Las visitas de campo son en celular, no con notebook — confirmado por Martín.
- Las plantillas v2 tienen `field_type` complejos (table con sub-grillas, file_ref para fotos) que necesitan componentes específicos.
- La señal en campo puede cortar: si el técnico pierde los datos cargados, el impacto operacional es alto.
- Los datos del briefing tienen que aparecer precargados — el técnico no puede re-preguntar lo que el cliente ya respondió.

## Users

- **Primary — Técnico (Facu/Simón)**: carga el relevamiento en campo, desde el celular, durante la visita.
- **Secondary — Admin (Martín)**: puede cargar o revisar desde desktop.
- **Not for**: clientes — no tienen acceso al form técnico.

## Hypothesis

Creemos que un form mobile-first con render data-driven, autosave con cola de reintentos y PWA instalable le permitirá al técnico cargar una auditoría completa en campo sin perder datos por problemas de señal. Sabremos que funciona cuando Facu/Simón completen una auditoría real desde el celular sin pérdida de datos ni necesidad de soporte.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| 0 datos perdidos por corte de señal | 100% recuperados al volver la conexión | Test: cargar, cortar red, reconectar, verificar |
| Todos los `field_type` renderizados | 12 tipos operativos en mobile | Test funcional por cada tipo |
| Instalable como PWA en Android e iOS | Ambos técnicos con app instalada | Check manual |
| Usable con una mano en celular | Targets táctiles ≥ 44px, botones en zona del pulgar | Revisión UX |

## Scope

**MVP** — Render data-driven completo de los 12 `field_type`, autosave con cola de reintentos (online con retry), datos del briefing precargados, subida de fotos a R2 vía presigned URL con **cámara directa desde cada equipo del inventario**, score por sección **autocalculado** y mostrado en vivo (solo lectura, semáforo), **export/import a JSON** como respaldo offline, PWA instalable con service worker de shell. Secciones en **orden libre**, una por pantalla, barra de progreso.

**Out of scope**

- Offline-first completo con IndexedDB + sync (v2) — v1 tiene cola de reintentos online **+ export/import JSON** como red de seguridad.
- Orden obligatorio de secciones — **descartado: orden libre**.
- **Scoring manual** — descartado: el score es automático y determinístico (ver 07f). El técnico solo responde ítems.
- Compresión de fotos configurable por el técnico (v1: compresión automática con valores recomendados, ver 07g).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 5a | Motor de render data-driven | Todos los `field_type` renderizados con sus componentes mobile | pending | — |
| 5b | Autosave + export/import JSON | Upsert debounced, cola de reintentos, indicador de estado, export/import JSON de respaldo | pending | — |
| 5c | Fotos + cámara desde equipo (integra 07g) | "Tomar foto", presigned PUT, attachment al ítem; al agregar un equipo en la grilla se abre la cámara y la foto queda enlazada a esa fila | pending | — |
| 5d | Score en vivo (solo lectura) | Score autocalculado por sección con semáforo 🟢🟠🔴; el técnico no lo edita; N/A no penaliza | pending | — |
| 5e | PWA e instalación | Manifest SyS, SW de shell, instalable en Android/iOS | pending | — |

## Open Questions

- [x] ~~¿Orden de secciones?~~ — **✅ LIBRE.**
- [x] ~~Compresión de fotos~~ — **✅ Sí, comprimir. Valores recomendados en 07g (≤1600px, quality 0.8, target ~300-500 KB).**
- [x] ~~¿Offline-first?~~ — **✅ NO. En su lugar: export/import a JSON para respaldar y reimportar si hace falta.**
- [x] ~~UX del flujo cámara-desde-equipo~~ — **✅ Default: al agregar una fila de equipo, botón de cámara en la fila (foto opcional, no obligatoria). Sacar foto la sube a R2 y la enlaza a esa fila. Se pueden agregar varias fotos por equipo.** Ajustable al implementar.

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Señal mala por >30 min sin retry exitoso | Media | Alto | Cola de reintentos persistente; evaluar offline-first en v2 |
| `table` field_type complejo en mobile | Media | Medio | Mini-grilla: agregar fila + columnas fijas; scroll horizontal si necesario |
| HEIC → JPEG en iPhone | Alta | Bajo | Convertir en cliente antes de subir a R2 |
| PWA no instalable en algunos iOS | Baja | Bajo | Fallback: funciona como web app aunque no se instale |

---

## Spec técnica de referencia

### Mapa `field_type` → componente mobile

| field_type | Componente |
|---|---|
| `bool` / `tri` | Segmented control (Sí / No / Parcial) |
| `text` | Input / textarea |
| `number` / `money` | Input numérico (teclado numérico) |
| `select` | Chips de una opción |
| `multiselect` | Chips multi |
| `date` / `datetime` | Date picker nativo |
| `list` | Lista editable (+ / × líneas) |
| `table` | Mini-grilla: agregar fila, columnas según `options.columns`. **En grillas de equipos, cada fila tiene un botón de cámara** que abre la cámara nativa y enlaza la foto a esa fila/equipo (no a la sección genérica) |
| `file_ref` | Botón "Tomar foto / subir" → cámara nativa → R2 |

### Autosave

- **Texto**: debounced 500-800ms → PATCH `audit_response` (upsert por `audit_id, item_id`)
- **Toggles/selects**: inmediato
- **Cola**: si falla → guarda en cola (memoria/IndexedDB liviano) → retry al recuperar conexión
- **Indicador**: "Guardando…" / "Guardado ✓" / "Sin conexión — se reintenta"
- **Export/import JSON**: botón para exportar el estado actual de la auditoría a un archivo JSON (red de seguridad si la señal falla por largo rato) y reimportarlo después. No es offline-first, es un respaldo manual.

### Score en vivo (solo lectura)

El score por sección se **autocalcula** desde los ítems (motor determinístico en 07f) y se muestra en vivo con semáforo: 🟢 ≥70 · 🟠 40-69 · 🔴 <40. El técnico **no lo edita** — solo responde ítems y carga observaciones. `audit_section_score.score` es calculado.

### Cámara desde equipo

En las grillas de inventario (`table`), cada fila de equipo expone un botón de cámara que abre la cámara nativa y enlaza la foto directo a ese equipo (`attachment` con referencia a la fila), no a la sección genérica. Acelera el relevamiento físico: agregar equipo → foto → siguiente.

### PWA

`manifest.webmanifest`: nombre "SyS Auditorías", íconos SyS, `display: standalone`, theme color de marca. SW: precache shell + assets; network-first para datos.

---

*Status: DRAFT. Spec de referencia completa en [`specs/07e-form-tecnico-mobile/spec.md`](../../specs/07e-form-tecnico-mobile/spec.md).*
