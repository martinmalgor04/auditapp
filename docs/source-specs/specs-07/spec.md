# Spec 07 — Plataforma de carga de auditorías (sysaudit-app)

| Campo | Valor |
|---|---|
| **ID** | SPEC-07 |
| **Estado** | 🟢 Definido — pendiente de construcción |
| **Owner** | Martín Malgor |
| **Tipo** | Spec compuesta (8 sub-specs) |
| **Nombre interno** | `sysaudit-app` |
| **Especifica** | La app web que reemplaza al "formulario digital" del funnel ([SPEC-00](../../specs/00-proyecto-lead-magnet/spec.md) §8 paso 3) |

---

## 1. Propósito

App web **mobile-first** que digitaliza el flujo de auditorías de SyS. Reemplaza la idea original de "formulario Supabase" por una app propia, simple, controlada por nosotros y hosteada en nuestra infraestructura.

Resuelve tres cosas en un solo sistema:

1. **Backoffice** (admin) — crear auditorías, ver el tablero por tipo/estado/cliente, gestionar plantillas y usuarios.
2. **Briefing externo** (cliente) — un link sin login para que el cliente precargue los datos básicos antes de la visita.
3. **Carga en campo** (técnico) — el form mobile que Facu/Simón completan desde el celular en la visita, con los datos del briefing ya cargados.

La salida estructurada de cada auditoría alimenta aguas abajo al sistema IA que genera el informe ([SPEC-00](../../specs/00-proyecto-lead-magnet/spec.md) §4).

---

## 2. El flujo (3 etapas)

```
┌─ ADMIN ──────────────┐   ┌─ CLIENTE ───────────┐   ┌─ TÉCNICO ────────────┐   ┌─ ADMIN/TÉCNICO ──────┐
│ 1a. Crea auditoría   │   │ 1b. Abre link        │   │ 2. Carga en campo    │   │ 3. Cierre            │
│   - cliente          │──▶│   token único        │──▶│   mobile-first       │──▶│   índices + riesgos  │
│   - tipo (IT/ERP/…)  │   │   sin login          │   │   datos precargados  │   │   quick wins         │
│   - cabecera común   │   │   completa básicos    │   │   fotos → R2         │   │   próximo paso       │
│   - asigna técnico   │   │   (datos del briefing)│   │   score por sección  │   │   estado: cerrada    │
└──────────────────────┘   └─────────────────────┘   └──────────────────────┘   └──────────────────────┘
   estado: borrador          estado: briefing_*          estado: en_relevamiento     estado: cerrada
```

Detalle de estados en [SPEC-07a §4](02-modelo-datos/spec.md).

---

## 3. Decisiones de arquitectura (fijadas con Martín)

| Decisión | Elección | Por qué |
|---|---|---|
| **Framework** | SvelteKit (full-stack: load + form actions + endpoints) | Un solo repo, SSR para mobile lento, lo más simple para el equipo |
| **Base de datos** | Postgres self-hosted en **Dokploy** | Infra propia, control total, sin vendor lock-in |
| **Storage** | Bucket **Cloudflare R2** (S3-compatible) | Fotos `[C]` y exports `[X]`; barato, sin egress |
| **Plantillas** | **Data-driven en DB** (template → section → item) | Editar preguntas sin tocar código; las plantillas siguen en validación (v2.1) |
| **Offline** | **Autosave online** + PWA instalable | Cubre el 90% de los cortes de señal sin la complejidad de sync offline-first |
| **Auth interna** | user + password en DB, sesiones por cookie | Simple; sin proveedor externo. Roles: `admin`, `tecnico` |
| **Auth cliente** | Sin login — **token único por auditoría** | El cliente no debe registrarse para un briefing de una vez |

---

## 4. Mapa de sub-specs (#1–#10)

| # | Sub-spec | SDD viva | Cubre |
|---|---|---|---|
| 1 | [Stack scaffolding](01-stack-scaffolding/spec.md) | [`01_stack_scaffolding`](../../../specs/01_stack_scaffolding/requirements.md) | SvelteKit 5, tooling local, Postgres dev |
| 2 | [Modelo de datos](02-modelo-datos/spec.md) | [`02_modelo_datos`](../../../specs/02_modelo_datos/requirements.md) | Esquema Postgres, plantillas, auditorías, seed |
| 3 | [Autenticación y roles](03-auth-roles/spec.md) | [`03_auth_roles`](../../../specs/03_auth_roles/requirements.md) | Login, sesiones, roles, token cliente |
| 4 | [Backoffice](04-backoffice/spec.md) | [`04_backoffice`](../../../specs/04_backoffice/requirements.md) | CRUD auditorías, tablero, plantillas, usuarios |
| 5 | [Briefing externo](05-briefing-externo/spec.md) | [`05_briefing_externo`](../../../specs/05_briefing_externo/requirements.md) | Form público cliente |
| 6 | [Storage R2](06-storage-r2/spec.md) | [`06_storage_r2`](../../../specs/06_storage_r2/requirements.md) | Fotos/exports, presigned URLs |
| 7 | [Form técnico mobile](07-form-tecnico-mobile/spec.md) | [`07_form_tecnico`](../../../specs/07_form_tecnico/requirements.md) | Carga en campo, autosave, PWA |
| 8 | [Cierre de auditoría](08-cierre-auditoria/spec.md) | [`08_cierre_scoring`](../../../specs/08_cierre_scoring/requirements.md) | Scoring, índices, cierre |
| 9 | [Contrato datos / IA](09-contrato-datos-ia/spec.md) | [`09_contrato_datos`](../../../specs/09_contrato_datos/requirements.md) | JSON canónico, pipeline SPEC-08 |
| 10 | [Deploy Dokploy](10-deploy-dokploy/spec.md) | [`10_deploy_dokploy`](../../../specs/10_deploy_dokploy/requirements.md) | Docker, migraciones, prod |

---

## 5. Roles y qué ve cada uno

| Rol | Entra por | Ve / hace |
|---|---|---|
| **Admin** (Martín) | login user+pass | Todo: tablero, CRUD auditorías, plantillas, usuarios, cierre |
| **Técnico** (Facu/Simón) | login user+pass | Sus auditorías asignadas, form de carga mobile, cierre técnico |
| **Cliente** | link con token, sin login | Solo el briefing de *su* auditoría, mientras el token esté vigente |

---

## 6. Dependencias

- **Aguas arriba:** [SPEC-04 Plantillas](../../specs/04-plantillas-auditoria/spec.md) — las columnas "Registrar"/"Cómo" y los scores de las plantillas v2 son el **contrato de datos** que esta app digitaliza. La estructura data-driven (07a) es la traducción 1:1 de esas plantillas.
- **Aguas abajo:** el **sistema IA del informe** ([SPEC-00](../../specs/00-proyecto-lead-magnet/spec.md) §4) consume la salida estructurada del cierre (07f).
- **Marca:** skill `sys-brand` para todo el UI (colores, tipografía, tono).
- **Infra:** servidor Dokploy (Postgres + app), bucket Cloudflare R2.

---

## 7. Criterios de aceptación (sistema)

- [ ] Admin crea una auditoría con cabecera común y asigna técnico.
- [ ] Se genera un link de briefing con token; el cliente lo completa sin login.
- [ ] El técnico abre la auditoría en el celular y ve los datos del briefing precargados.
- [ ] El form mobile carga ítems data-driven de las 3 plantillas (IT / ERP Tango / ERP Estándar).
- [ ] Autosave funciona; un corte de señal no pierde lo cargado.
- [ ] Fotos/exports suben a R2 y quedan vinculados al ítem.
- [ ] Cada sección tiene score; el índice global se calcula al cierre.
- [ ] Una auditoría se cierra y queda la salida estructurada lista para la IA.
- [ ] Deploy reproducible en Dokploy con migraciones versionadas.

---

## 8. Estado y pendientes

Definido y listo para construir. Pendientes de definición fina (no bloquean arrancar):

- [ ] Confirmar ponderaciones exactas del Índice de Salud (hereda pendiente de [SPEC-04](../../specs/04-plantillas-auditoria/spec.md) §8).
- [ ] Definir qué secciones del relevamiento se exponen al cliente y cuáles quedan internas.
- [ ] Decidir si el score por sección se carga manual o se autocalcula desde los ítems (v1: manual con observaciones; autocalc queda para v2).
- [ ] Política de retención/expiración de tokens de briefing.
- [ ] Idioma único (es-AR); i18n no es requisito.

> **Nota de relación con SPEC-00:** este spec sustituye el supuesto "formulario Supabase" del paso 3 del funnel. El resto del funnel (crawler, cold email, IA del informe) no cambia.
