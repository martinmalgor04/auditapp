# auditapp — Backoffice (admin)

**ID**: SPEC-07c | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 3 de 8 | **Depende de**: 07a, 07b

---

## Problem

Martín necesita una interfaz para crear auditorías, asignar técnicos, generar links de briefing para el cliente y ver el estado de todo el pipeline en un solo lugar. Sin backoffice el flujo no arranca — es el punto de entrada de toda auditoría.

## Evidence

- El flujo empieza con el admin (Martín) creando la auditoría antes de la visita — sin esto no hay form técnico ni briefing.
- El tablero necesita filtros por tipo/estado/cliente porque SyS tiene múltiples auditorías activas en paralelo para distintos clientes y tipos.
- El técnico necesita un usuario activo en la app para poder loguear — el admin es quien los gestiona.

## Users

- **Primary — Admin (Martín)**: crea y administra auditorías, gestiona usuarios y plantillas, ve el tablero y el dashboard de métricas.
- **Secondary — Técnico (Facu/Simón)**: también accede al tablero, **crea auditorías** y ve resultados de todas (ver [07b](auditapp-03-auth-roles.prd.md)). No gestiona usuarios ni plantillas.
- **Not for**: clientes (no tienen acceso al backoffice).

## Hypothesis

Creemos que un tablero con filtros por tipo/estado/cliente + CRUD de auditorías + gestión básica de usuarios le dará a Martín control completo del pipeline sin necesitar otra herramienta. Sabremos que funciona cuando pueda crear una auditoría, asignar técnico, generar link de briefing y ver el avance de todas las auditorías activas en un solo lugar.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Flujo crear auditoría → link de briefing | < 3 minutos, sin instrucciones | Test de usabilidad con Martín |
| Tablero con filtros primarios operativos | tipo + estado + cliente funcionando | Test funcional |
| Alta de usuario técnico funciona | Técnico puede loguear post-alta | Test de integración |

## Scope

**MVP** — Tablero filtrable (tipo/estado/cliente) accesible por admin y técnico, CRUD de auditorías con cabecera + asignación de técnico + generación de link de briefing, gestión de usuarios (alta/baja/reset pass, solo admin). Layout responsive: tabla en desktop, cards en mobile.

**Editor de plantillas v1**: **solo edición de ítems existentes** (label, help, options/rúbrica de scoring, method, filled_by). NO crea secciones nuevas en v1. El alta/reordenamiento de secciones y el versionado completo quedan para una iteración posterior. Las plantillas vienen del seed (07a).

**Out of scope**

- Export del tablero a CSV/PDF — **descartado** (no se hace).
- **Crear/reordenar secciones** en el editor de plantillas (v1: solo edición de ítems existentes).
- Dashboard con métricas agregadas / estudio de mercado — **v2** (el modelo de datos ya recopila todo desde v1; ver [07i §6](auditapp-09-contrato-datos-ia.prd.md)). Es deseado, no MVP.
- Historial de cambios de auditoría (v2).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 3a | Tablero de auditorías | Lista con columnas, filtros primarios, búsqueda, badges de estado, % avance | pending | — |
| 3b | CRUD de auditorías | Crear con cabecera + plantilla + técnico; editar; generar/regenerar token de briefing | pending | — |
| 3c | Gestión de usuarios | Alta/baja/reset de técnicos y admins; solo accesible para admin | pending | — |
| 3d | Editor de plantillas (solo edición) | Editar ítems existentes: label, help, options/rúbrica, method, filled_by. Sin alta de secciones | pending | — |

## Open Questions

- [x] ~~Alcance del editor de plantillas~~ — **✅ Solo edición de ítems existentes en v1 (corrige la respuesta previa: NO crear secciones todavía).**
- [x] ~~¿Export del tablero a CSV?~~ — **✅ NO.**
- [x] ~~¿Dashboard de métricas agregadas?~~ — **✅ SÍ, es deseado (recopilar datos de las auditorías para estudio de mercado). v2; el modelo ya guarda todo desde v1.**
- [x] ~~¿Cómo cuenta el % de avance los N/A?~~ — **✅ N/A cuenta como completado. El % refleja "cuánto falta tocar" y llega a 100% aunque haya N/A.**

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Editor de plantillas con side-effects en auditorías activas | Media | Alto | Versionado: publicar nueva versión = nueva fila; auditorías activas no se tocan |
| Tablero lento con muchas auditorías | Baja | Medio | Paginación + índices en `audit(status, client_id)` |

---

## Spec técnica de referencia

### Rutas (SvelteKit)

```
(app)/
  tablero/              → listado con filtros
  auditorias/
    new/                → form creación
    [id]/               → ver/editar
    [id]/briefing-link  → generar/copiar token
  plantillas/
    [id]/               → editor mínimo
  usuarios/             → ABM usuarios
```

### Form de creación de auditoría

Campos obligatorios: cliente (select/create), tipo(s), segmento (A/B/C), técnico asignado, fecha de visita.
Campos de cabecera (section `CAB`): sede, referente, NDA, "¿quién da soporte IT hoy?", etc.

Al guardar → `borrador`. Botón "Generar link de briefing" → `public_token` → `briefing_enviado`.

### Tablero

Columnas: cliente · tipo(s) · segmento · estado (badge) · técnico · fecha visita · última actualización · acciones.
Filtros primarios: tipo · estado · cliente. Orden: fecha visita / última actualización.

---

*Status: DRAFT. Spec de referencia completa en [`specs/04_backoffice/requirements.md`](../../specs/04_backoffice/requirements.md).*
