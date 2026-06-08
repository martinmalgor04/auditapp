# Spec 07c — Backoffice (admin)

| Campo | Valor |
|---|---|
| **ID** | SPEC-07c |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | Tablero, CRUD de auditorías, gestión de plantillas y usuarios |

---

## 1. Propósito

El panel de control del admin. Tres trabajos:

1. **Ver** el estado de todas las auditorías (tablero filtrable).
2. **Crear y administrar** auditorías (CRUD) con la cabecera común, antes de que el técnico cargue.
3. **Gestionar** plantillas (data-driven) y usuarios.

Mobile-first como todo el sistema, pero acá el **desktop pesa más** (el admin trabaja desde la compu). Layout responsive: tabla en desktop, cards en mobile.

---

## 2. Tablero / listado de auditorías

Vista principal post-login del admin. Lista de auditorías con:

- **Columnas:** cliente · tipo(s) (IT / ERP Tango / ERP Estándar / combo) · segmento (A/B/C) · estado (badge con color) · técnico asignado · fecha visita · última actualización.
- **Filtros:** por **tipo**, **estado**, **cliente**, técnico, segmento. (los tres que pediste — tipo, estado, cliente — son primarios).
- **Búsqueda** por nombre de cliente / razón social.
- **Orden** por fecha de visita o última actualización.
- **Badges de estado** con el color del flujo (`borrador` … `cerrada`, ver [07a §4](../07a-modelo-datos/spec.md)).
- Acción rápida por fila: abrir, copiar link de briefing, ver progreso (% de ítems cargados).

---

## 3. CRUD de auditorías

### Crear (paso 1a del flujo)

Form de creación con la **cabecera común** (los campos que ya quedan fijos antes de la visita):

- **Cliente:** seleccionar existente o crear nuevo (razón social, CUIT, rubro).
- **Tipo(s):** IT / ERP Tango / ERP Estándar / combo → determina qué `template_ids` se congelan.
- **Segmento:** A / B / C.
- **Técnico asignado.**
- **Fecha de visita.**
- Campos de cabecera (`section CAB`) que el admin ya conoce: sede, referente del cliente, NDA, "¿quién da soporte IT hoy?", etc.

Al guardar → estado `borrador`. Botón **"Generar link de briefing"** → crea `public_token`, pasa a `briefing_enviado`, muestra el link para copiar/enviar al cliente.

### Editar / Ver

- Editar cabecera y reasignar técnico mientras no esté `cerrada`.
- Ver progreso: ítems cargados / total, score por sección, adjuntos.
- **Regenerar token** de briefing (invalida el anterior).
- **Reabrir** una auditoría `cerrada` → vuelve a `en_cierre` (solo admin, queda registrado).

### Borrar / archivar

- Borrado lógico (`archived_at`). Los adjuntos R2 se encolan para borrado diferido ([07g](../07g-storage-r2/spec.md)).

---

## 4. Gestión de plantillas (data-driven)

Editor de las plantillas que viven en DB ([07a §3.1](../07a-modelo-datos/spec.md)):

- Listar plantillas con su `version` y `status` (draft/active/archived).
- Editar secciones e ítems: label, help, `field_type`, options, método (Cómo), `filled_by`, `is_prefillable`, `allow_na`, peso de sección, orden.
- **Versionado:** publicar una nueva versión clona la plantilla activa a una nueva fila; las auditorías existentes no se ven afectadas (siguen en su versión congelada).
- Reordenar secciones e ítems (drag o campo `sort_order`).

> v1 puede arrancar con las plantillas cargadas por **seed/migración** y un editor mínimo (solo edición de ítems existentes). El editor completo de plantillas es deseable pero no bloquea las primeras auditorías.

---

## 5. Gestión de usuarios

- Alta/baja de usuarios internos (`app_user`): email, nombre, rol (admin/técnico), activo.
- Resetear contraseña (genera una nueva, el admin la comunica).
- Solo accesible para rol `admin`.

---

## 6. Dependencias

- Datos: [SPEC-07a](../07a-modelo-datos/spec.md). Permisos: [SPEC-07b](../07b-auth-roles/spec.md).
- El link de briefing apunta a [SPEC-07d](../07d-briefing-externo/spec.md).
- El progreso/score que muestra viene de [07e](../07e-form-tecnico-mobile/spec.md) y [07f](../07f-cierre-auditoria/spec.md).
- Marca: skill `sys-brand`.

---

## 7. Criterios de aceptación

- [ ] Admin crea una auditoría con cliente, tipo, segmento, técnico y cabecera, y queda en `borrador`.
- [ ] El tablero filtra por tipo, estado y cliente, y muestra el estado con badges de color.
- [ ] "Generar link de briefing" produce un token y un link copiable.
- [ ] El admin ve el % de avance de cada auditoría.
- [ ] Alta de usuario técnico funciona y el técnico puede loguear.
- [ ] Layout usable en mobile (cards) y desktop (tabla).

---

## 8. Estado y pendientes

- [ ] Definir alcance del editor de plantillas en v1 (¿solo edición o también crear secciones?).
- [ ] ¿Export del tablero a CSV/PDF? — opcional.
- [ ] Dashboard con métricas agregadas (estudio de mercado, [SPEC-00](../../../specs/00-proyecto-lead-magnet/spec.md) §1) — v2.
