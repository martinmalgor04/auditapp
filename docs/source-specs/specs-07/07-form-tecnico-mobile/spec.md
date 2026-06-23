# Spec 07e — Form técnico (mobile-first)

| Campo | Valor |
|---|---|
| **ID** | SPEC-07e |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | El formulario de carga en campo: render data-driven, autosave, fotos, scoring, PWA |

---

## 1. Propósito

El **corazón del sistema**. Paso 2 del flujo: Facu/Simón abren la auditoría en el celular, en la visita, y la cargan. Tiene que ser rápido, claro y a prueba de mala señal. Mobile-first de verdad (el técnico no va con una notebook), con capacidad desktop.

Renderiza dinámicamente los ítems de las plantillas data-driven y guarda cada respuesta con autosave.

---

## 2. Diseño mobile-first

- **Pulgar primero:** botones grandes, targets táctiles ≥ 44px, controles abajo (alcance del pulgar).
- **Una sección por pantalla:** navegación por secciones (A1, A2…), no un scroll infinito. Barra de progreso arriba.
- **Mínimo tipeo:** `tri` (sí/no/parcial) y `bool` como toggles/segmented; `select` como chips; fechas con date picker nativo; números con teclado numérico.
- **Datos precargados visibles:** lo que cargó el cliente (briefing) y el admin (cabecera) aparece ya completo, marcado como "precargado", editable.
- **Indicador de guardado** siempre visible: "Guardando…" / "Guardado ✓" / "Sin conexión — se reintenta".
- **N/A a un toque** en los ítems que lo permiten (`allow_na`), sin penalizar score.
- **Observaciones** por ítem colapsadas (se expanden si hace falta).
- Capacidad desktop: en pantalla ancha, secciones en panel lateral + contenido; mismo motor.

---

## 3. Render data-driven

El form se arma leyendo `template → section → template_item` de la auditoría ([07a](../02-modelo-datos/spec.md)). Cada `field_type` mapea a un componente:

| field_type | Componente mobile |
|---|---|
| `bool` / `tri` | Segmented control (Sí / No / Parcial) |
| `text` | Input / textarea |
| `number` / `money` / `percent` | Input numérico (teclado numérico) |
| `select` | Chips de una opción |
| `multiselect` | Chips multi |
| `date` / `datetime` | Date picker nativo |
| `list` | Lista editable (agregar/quitar líneas) |
| `table` | Mini-grilla: agregar fila, columnas según `options.columns` |
| `file_ref` | Botón "Tomar foto / subir" → cámara nativa → R2 ([07g](../06-storage-r2/spec.md)) |

La columna **Cómo** (`method` O/E/C/X) se muestra como íconos/etiqueta de ayuda junto al ítem (qué método usar para relevarlo).

---

## 4. Autosave (online)

- **Estrategia:** cada cambio de respuesta hace un upsert a `audit_response` (PATCH al endpoint), debounced ~500–800ms para texto, inmediato para toggles/selects.
- **Idempotente:** upsert por `(audit_id, item_id)` → reintentar no duplica.
- **Cola de reintentos:** si falla la red, la respuesta queda en una cola local (en memoria / IndexedDB liviano) y se reintenta al volver la conexión. El indicador refleja el estado.
- **Optimista:** el UI no espera al server para mostrar el valor; marca "guardando" hasta confirmar.
- **Sin pérdida:** recargar la página recupera todo desde el server (las respuestas ya guardadas) + la cola pendiente.
- `source='tecnico'`, `updated_by=user.id`, `updated_at` en cada upsert.

> Alcance v1 = **autosave online con cola de reintentos**, no offline-first completo. Si el técnico no tiene nada de señal por largo rato, la cola aguanta y sincroniza al volver; no se garantiza trabajo 100% offline prolongado.
> **Actualización:** el snapshot local de recuperación (draft en IndexedDB para recuperar tras cierre accidental del tab) se implementó en feature **#40 `40_offline_snapshot`**.

---

## 5. Scoring por sección

- El score por sección se calcula **automáticamente** desde la rúbrica de ítems (feature #7, decisión de implementación).
- Semáforo visual: 🟢 70–100 · 🟠 40–69 · 🔴 0–39 (de [SPEC-04 §3](../../../specs/04-plantillas-auditoria/spec.md)).
- Secciones marcadas N/A completas no puntúan.
- ~~v1: score manual. Autocálculo v2.~~ **Descartado:** se implementó autocálculo determinístico desde el inicio (feature #7). El técnico no puede editar el score manualmente.

---

## 6. PWA

- Instalable (manifest + íconos SyS): el técnico la agrega a la pantalla de inicio, se abre como app.
- Service worker cachea el shell de la app (HTML/CSS/JS) para abrir rápido aunque la red esté lenta.
- No es offline-first de datos; el SW es para el shell + assets, el autosave maneja los datos.

---

## 7. Fin del relevamiento

- Cuando el técnico marca el relevamiento completo → `audit.status = en_cierre` y pasa a la pantalla de cierre ([07f](../08-cierre-auditoria/spec.md)).
- Validación blanda: avisa si quedan ítems `required` sin responder ni N/A, pero no bloquea (campo manda).

---

## 8. Dependencias

- Datos y `field_type`: [SPEC-07a](../02-modelo-datos/spec.md). Permisos (técnico ve solo lo asignado): [SPEC-07b](../03-auth-roles/spec.md).
- Fotos/exports: [SPEC-07g](../06-storage-r2/spec.md). Cierre: [SPEC-07f](../08-cierre-auditoria/spec.md).
- Motor de render compartido con el briefing ([07d](../05-briefing-externo/spec.md)).
- Marca: skill `sys-brand`. PWA/SW: [SPEC-07h](../10-deploy-dokploy/spec.md).

---

## 9. Criterios de aceptación

- [ ] El técnico abre una auditoría asignada en el celular y ve datos del briefing precargados.
- [ ] Se renderizan todos los `field_type`, incluido `table` (sub-grillas) y `file_ref` (foto).
- [ ] Autosave guarda cada cambio; cortar la red y volver no pierde datos (cola de reintentos).
- [ ] Tomar una foto la sube a R2 y la vincula al ítem.
- [ ] Carga score por sección con semáforo; N/A no penaliza.
- [ ] Instalable como PWA y abre rápido con red lenta.
- [ ] Usable con una mano en pantalla de celular.

---

## 10. Estado y pendientes

- [ ] Confirmar si alguna sección se carga en orden obligatorio o libre (propuesto: libre).
- [ ] Tamaño/compresión de fotos antes de subir (ahorro de datos) — ver [07g](../06-storage-r2/spec.md).
- [ ] Evaluar offline-first completo (IndexedDB + sync) para v2 si la señal en campo resulta peor de lo esperado.
