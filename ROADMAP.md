# ROADMAP — auditapp

App web mobile-first que digitaliza el flujo de auditorías IT/ERP de Servicios y Sistemas: briefing del cliente → carga en campo por el técnico → **scoring automático determinístico** → cierre con índices + preview → JSON canónico para el pipeline IA (SPEC-08). Todo es **un solo pipeline de datos**: cada auditoría alimenta la IA del informe y la base de estudio de mercado del NEA.

**Stack**: SvelteKit · TypeScript · PostgreSQL (Dokploy, red interna) · postgres.js (SQL puro) · Cloudflare R2 (aws4fetch) · Docker

---

## Estado actual

> Arnés harness-sdd instalado. App sin scaffolding. Backlog en `feature_list.json`.

| Item | Estado |
|---|---|
| Arnés SDD (AGENTS.md, init.sh, feature_list) | ✅ Instalado |
| Specs históricas archivadas (`docs/source-specs/`) | ✅ Referencia |
| 10 features planificadas en `feature_list.json` | ✅ Todas `pending` |
| Specs EARS vivos (`specs/<feature>/`) | ⏳ Se generan por etapa vía `spec_author` |
| Scaffolding SvelteKit (feature #1) | ⏳ Pendiente |
| Código | ⏳ Pendiente |

**Backlog activo:** [`feature_list.json`](feature_list.json) — ver ids 1–10.

---

## Milestones

Los milestones están ordenados por dependencia — no se puede empezar el siguiente sin tener el anterior en verde.

### M1 — Modelo de datos y migraciones

**Feature**: `#2 modelo_datos` en [`feature_list.json`](feature_list.json)
**PRD ref**: [`docs/source-specs/prds/auditapp-07a-modelo-datos.prd.md`](docs/source-specs/prds/auditapp-07a-modelo-datos.prd.md)
**Spec ref**: [`docs/source-specs/specs-07/07a-modelo-datos/spec.md`](docs/source-specs/specs-07/07a-modelo-datos/spec.md)

- Schema Postgres completo: `template`, `section`, `template_item`, `client`, `audit`, `audit_response`, `audit_section_score`, `audit_closure`, `attachment`, `app_user`, `session`
- Los 12 `field_type` con sus constraints y JSONB schemas
- Máquina de estados de `audit.status`
- Seed: 1 admin, 2 técnicos, 3 plantillas activas (IT v2, ERP Tango v2, ERP Estándar v1)
- Seed de clientes desde `seed/clientes-presupuestossys.csv` (1.905 filas) → tabla `client`
- Rúbrica de scoring data-driven en `options` de cada ítem (escala madurez 0/50/100, ver M7)
- Índices de performance en `audit(status)`, `audit(client_id)`, `audit_response(audit_id)`

**Arrancar**: `/leader` (tras feature #1 `stack_scaffolding` en verde)

---

### M2 — Auth y sesiones

**PRD**: [`docs/source-specs/prds/auditapp-07b-auth-roles.prd.md`](docs/source-specs/prds/auditapp-07b-auth-roles.prd.md)
**Spec técnica**: [`docs/source-specs/specs-07/07b-auth-roles/spec.md`](specs/07b-auth-roles/spec.md)

- Login user+pass con argon2id, sesión por cookie HttpOnly Secure
- `hooks.server.ts` que resuelve `session → user → event.locals.user`
- Guards server-side por rol: **técnico crea y ve todas las auditorías + resultados**; admin tiene las acciones sensibles (reabrir, plantillas, usuarios); cliente solo su briefing
- Token único de cliente: validación en `/briefing/[token]`, invalidación al avanzar/cerrar
- Rate limit en `/login`

**Arrancar**: `/leader` (feature `#3 auth_roles`)

---

### M3 — Backoffice (admin + técnico)

**PRD**: [`docs/source-specs/prds/auditapp-07c-backoffice.prd.md`](docs/source-specs/prds/auditapp-07c-backoffice.prd.md)
**Spec técnica**: [`docs/source-specs/specs-07/07c-backoffice/spec.md`](specs/07c-backoffice/spec.md)

- Tablero con filtros por tipo/estado/cliente, búsqueda, badges de estado, % avance (admin **y** técnico)
- CRUD de auditorías: crear con cabecera + plantilla + técnico; editar; borrado lógico (admin y técnico crean)
- Generar/regenerar link de briefing (`public_token`)
- ABM de usuarios técnicos y admins; reset de contraseña (**solo admin**)
- Editor de plantillas: **solo edición de ítems existentes** (label, help, options/rúbrica, method, filled_by) — no crea secciones en v1
- Dashboard de métricas agregadas / estudio de mercado → **v2** (el modelo ya recopila los datos)
- Layout responsive: tabla en desktop, cards en mobile

**Arrancar**: `/leader` (feature `#4 backoffice`)

---

### M4 — Briefing externo (cliente)

**PRD**: [`docs/source-specs/prds/auditapp-07d-briefing-externo.prd.md`](docs/source-specs/prds/auditapp-07d-briefing-externo.prd.md)
**Spec técnica**: [`docs/source-specs/specs-07/07d-briefing-externo/spec.md`](specs/07d-briefing-externo/spec.md)

- Ruta pública `/briefing/[token]` sin auth
- Render de solo los ítems `filled_by='cliente'`
- Autosave → upsert `audit_response` con `source='cliente'`
- "Enviar" → `audit.status = briefing_completo`
- Token inválido / auditoría avanzada → pantalla amable
- Pre-llenado WHOIS/DNS del dominio del cliente → **v2** (factible; `prefill_source` ya en el modelo)
- Branding SyS, mobile-first, funciona en conexión lenta

**Arrancar**: `/leader` (feature `#5 briefing_externo`)

---

### M5 — Form técnico mobile + M6 (R2) integrado

**PRD form**: [`docs/source-specs/prds/auditapp-07e-form-tecnico-mobile.prd.md`](docs/source-specs/prds/auditapp-07e-form-tecnico-mobile.prd.md)
**PRD R2**: [`docs/source-specs/prds/auditapp-07g-storage-r2.prd.md`](docs/source-specs/prds/auditapp-07g-storage-r2.prd.md)
**Specs**: [`docs/source-specs/specs-07/07e-form-tecnico-mobile/spec.md`](specs/07e-form-tecnico-mobile/spec.md) · [`docs/source-specs/specs-07/07g-storage-r2/spec.md`](specs/07g-storage-r2/spec.md)

- Render data-driven de los 12 `field_type` con componentes mobile-first
- Datos del briefing precargados visibles al técnico
- Autosave debounced + cola de reintentos + **export/import JSON** como respaldo (no offline-first)
- Indicador de estado "Guardando… / Guardado ✓ / Sin conexión — se reintenta"
- **Fotos**: presigned PUT a R2 con `aws4fetch`, compresión en cliente (1600px/0.8, ~300-500 KB), HEIC→JPEG, `attachment` vinculada al ítem
- **Cámara desde equipo**: al agregar un equipo en la grilla de inventario, botón de cámara que enlaza la foto a esa fila
- **Descarga**: presigned GET, bucket privado
- **Score en vivo (solo lectura)**: autocalculado por sección con semáforo 🟢🟠🔴 — el técnico no lo edita
- Secciones en **orden libre** (una por pantalla), barra de progreso
- PWA instalable (manifest SyS, SW de shell, network-first para datos)

**Arrancar**: `/leader` (feature `#7 form_tecnico`)

---

### M7 — Cierre + scoring automático

**PRD**: [`docs/source-specs/prds/auditapp-07f-cierre-auditoria.prd.md`](docs/source-specs/prds/auditapp-07f-cierre-auditoria.prd.md)
**Spec técnica**: [`docs/source-specs/specs-07/07f-cierre-auditoria/spec.md`](specs/07f-cierre-auditoria/spec.md)

> **Estándar fijado**: scoring anclado a **CIS Controls v8 + NIST CSF**, escala de madurez **0/50/100** transversal a todo el proyecto. EOL de hardware por ciclo de vida del fabricante (vigente=100, extendido=50, EOL=0). Pendiente menor: rangos de antigüedad fallback por tipo de equipo.

- **Scoring determinístico y automático** (3 niveles): rúbrica por ítem → score de sección → índices IT/ERP. Mismo input → mismo output. El técnico **no** carga scores.
- Scoring de inventario físico por reglas (EOL del fabricante, edad, compatibilidad), no por criterio del técnico
- Pesos automáticos: bajo=1, medio=2, alto=3, muy_alto=5. Índices IT y ERP **independientes** (sin global)
- Pantalla de cierre: top 5 riesgos + quick wins + hallazgos de upsell (admin + técnico, nunca cliente) + próximo paso
- **Preview del informe** legible en la app (el informe final/branded/Loom es del pipeline SPEC-08)
- Confirmar cierre → `cerrada` + invalidar token + `closed_at`/`closed_by`
- Reabrir (solo admin) → `en_cierre`

**Arrancar**: `/leader` (feature `#8 cierre_scoring`)

---

### M7i — Contrato de datos y pipeline IA (puente a SPEC-08)

**PRD**: [`docs/source-specs/prds/auditapp-07i-contrato-datos-ia.prd.md`](docs/source-specs/prds/auditapp-07i-contrato-datos-ia.prd.md)
**Spec técnica**: [`docs/source-specs/specs-07/07i-contrato-datos-ia/spec.md`](specs/07i-contrato-datos-ia/spec.md)

> Todo es un solo pipeline. Esta pieza define el **contrato** entre la app y los consumidores aguas abajo (IA del informe + estudio de mercado).

- JSON canónico versionado (`schema_version`) en endpoint protegido + header `X-Schema-Version`
- `score_basis="auto"` + `score_contribution` por ítem (transparencia del cálculo)
- `market_data` desnormalizado para el estudio de mercado del NEA
- Preview del informe (compartido con M7)
- Puente a **SPEC-08** (pipeline completo IA + métricas) — a formalizar a nivel `sysaudit/`

**Arrancar**: `/leader` (feature `#9 contrato_datos`)

---

### M8 — Stack y deploy Dokploy

**PRD**: [`docs/source-specs/prds/auditapp-07h-stack-deploy.prd.md`](docs/source-specs/prds/auditapp-07h-stack-deploy.prd.md)
**Spec técnica**: [`docs/source-specs/specs-07/07h-stack-deploy/spec.md`](specs/07h-stack-deploy/spec.md)

> Este milestone es parcialmente el primero (scaffolding) y parcialmente el último (Dockerfile + deploy). Se trabaja en dos fases.

- **Fase inicial (antes de M1)**: scaffolding SvelteKit 5 + TypeScript + postgres.js + Tailwind + Zod + `.env.example`
- **Fase final (después de M7)**: Dockerfile, deploy en Dokploy, migraciones SQL en container, HTTPS Traefik, PWA final, seed en prod
- **Dominio**: `app.auditoriaserviciosysistemas.com.ar`
- **Seguridad**: Postgres **solo en la red Docker interna** junto a la app — sin exponer puertos al host/internet (defensa ante ataques e inyección)

**Arrancar scaffolding**: `/leader` (feature `#1 stack_scaffolding`)
**Arrancar deploy final**: `/leader` (feature `#10 deploy_dokploy`, tras #9)

---

## Flujo de trabajo (harness-sdd)

```
# Para cada feature en feature_list.json:
/leader
# → spec_author redacta specs/<name>/ (EARS) → spec_ready
# → ⏸ humano aprueba
# → implementer + reviewer → done
# → ./init.sh verde antes de cerrar
```

Referencia histórica de requisitos: `docs/source-specs/`.

---

## Dependencias entre milestones

```
M8a (scaffolding)
  └── M1 (schema + seed + rúbrica scoring)
        ├── M2 (auth + permisos técnico)
        │     ├── M3 (backoffice admin+técnico)
        │     ├── M4 (briefing externo)
        │     └── M5+M6 (form técnico + R2 + cámara desde equipo)
        │           └── M7 (cierre + scoring automático) ← requiere rúbrica + JSON schema
        │                 ├── M7i (contrato de datos / pipeline) ← coordinar con n8n
        │                 └── M8b (deploy final, DB en red interna)
        └── M6 (R2 config infra) ← puede arrancar en paralelo con M2
```

---

## Roadmap v2 (post-MVP)

> La arquitectura queda **abierta al cambio** para soportar esto sin reescrituras.

- **Portal de calendario / agenda de visitas** desde el backoffice → al confirmar la agenda, dispara el briefing automáticamente.
- **Dashboard de métricas agregadas** (estudio de mercado del NEA) — el modelo ya recopila los datos desde v1.
- **Pre-llenado WHOIS/DNS** del briefing antes de mandarlo.
- **Scoring de inventario con IA** (determinístico) para PCs/servers/switches según EOL, edad y compatibilidad.
- **Recordatorio automático** al cliente si no completa el briefing (vía n8n).
- **Editor completo de plantillas** (crear/reordenar secciones, versionado).
- **Offline-first real** (IndexedDB + sync) si la señal en campo resulta peor de lo esperado.

---

## Preguntas bloqueantes (responder antes de implementar)

| # | Pregunta | Bloquea | Estado |
|---|---|---|---|
| Q1 | Mapa `weight → factor` | M7 | ✅ bajo=1, medio=2, alto=3, muy_alto=5 (automático) |
| Q2 | Índice global para combos IT+ERP | M7 | ✅ No hay índice global — IT y ERP independientes |
| Q3 | Vigencia del token de briefing | M4 | ✅ Sin expiración por tiempo — se invalida por `status` |
| Q4 | ORM | M1 | ✅ postgres.js puro con SQL |
| Q5 | Score manual vs automático | M7 | ✅ Automático y determinístico (rúbrica data-driven) |
| Q6 | Permisos del técnico | M2 | ✅ Crea y ve todo; admin tiene acciones sensibles |
| Q7 | Estándar de scoring + rúbrica | M7 | ✅ CIS v8 + NIST CSF + escala madurez 0/50/100; EOL por fabricante |
| Q8 | JSON canónico / pipeline n8n | M7/M7i | ✅ Lo define SyS en 07i (el pipeline se adapta) |
| Q9 | Dominio de la app | M8b | ✅ `app.auditoriaserviciosysistemas.com.ar` |
| Q10 | Estrategia de migraciones en Dokploy | M8b | ✅ En el entrypoint del container |
| Q11 | ¿SPEC-08 spec aparte? | — | ✅ NO; pipeline parte de la app (07i), documentado en sysaudit |
| Q12 | Rangos de antigüedad fallback por equipo | M7 | ✅ PC <3/3-5/>5; servidor/red <4/4-6/>6 |
| Q13 | Campos `market_data` | M7i | ✅ Confirmados (07i §3) |
| Q14 | Modelo de `client` | M1 | ✅ Con cabecera completa (columnas fijas) |
| Q15 | Auth del endpoint de export | M7 | ✅ Sesión de admin |
| Q16 | Briefing (header, formato), login, % avance | M3/M4 | ✅ Empresa en header · adaptativo · login genérico · N/A=completado |
| Q17 | Convención key R2 sin sección | M6 | ✅ `audits/{id}/_general/{uuid}` |
| Q18 | CI / deploy | M8b | ✅ build+tests pre-push; push → Dokploy deploya |

**Pendientes restantes (ninguno bloquea M1–M6):**
- Set exacto de ítems `filled_by='cliente'` → se decide al cargar el seed de plantillas.
- Qué secciones del relevamiento ve el cliente vs. internas.
- Fijar `schema_version = 1.0` al cerrar la primera auditoría real.

---

## Criterios de aceptación del sistema completo

- [ ] Admin **o técnico** crea una auditoría con cabecera y asigna técnico.
- [ ] Se genera link de briefing; el cliente lo completa sin login.
- [ ] El técnico abre la auditoría en el celular y ve datos del briefing precargados.
- [ ] El form mobile renderiza los 12 `field_type` incluyendo `table` y `file_ref`.
- [ ] Al agregar un equipo en la grilla, la cámara enlaza la foto a esa fila.
- [ ] Autosave funciona; un corte de señal no pierde datos; export/import JSON disponible.
- [ ] Fotos/exports suben a R2 y quedan vinculados al ítem.
- [ ] El **score es automático y determinístico**: mismas respuestas → mismo score.
- [ ] Cierre genera índices IT y ERP independientes + preview del informe.
- [ ] JSON canónico versionado consumible por el pipeline IA sin transformaciones.
- [ ] Técnicos ven todas las auditorías y sus resultados.
- [ ] Deploy reproducible en Dokploy con Postgres **no expuesto a internet**.
- [ ] PWA instalable en Android e iOS.

---

*Specs históricas en `docs/source-specs/`. Backlog activo en `feature_list.json`. Última actualización: 2026-06-08.*
