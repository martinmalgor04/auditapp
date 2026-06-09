# ROADMAP — auditapp

App web mobile-first que digitaliza el flujo de auditorías IT/ERP de Servicios y Sistemas: briefing del cliente → carga en campo por el técnico → **scoring automático determinístico** → cierre con índices + preview → JSON canónico para el pipeline IA (SPEC-08).

**Stack**: SvelteKit · TypeScript · PostgreSQL (Dokploy, red interna) · postgres.js · Cloudflare R2 · Docker

**Índice de specs:** [`specs/README.md`](specs/README.md) · Backlog: [`feature_list.json`](feature_list.json)

---

## Estado actual

| # | Feature | Estado |
|---|---------|--------|
| 1 | `01_stack_scaffolding` | ✅ done |
| 2 | `02_modelo_datos` | ✅ done |
| 3 | `03_auth_roles` | spec_ready |
| 4–10 | resto | spec_ready |

**Próximo paso:** aprobar e implementar `#3 03_auth_roles` vía `/leader`.

---

## Features #1–#10 (orden de implementación)

### #1 — Scaffolding SvelteKit + tooling

**SDD:** [`specs/01_stack_scaffolding/`](specs/01_stack_scaffolding/requirements.md) · **Histórica:** [`01-stack-scaffolding`](docs/source-specs/specs-07/01-stack-scaffolding/spec.md)

SvelteKit 5, TypeScript, Tailwind, Zod, vitest, playwright, postgres.js stub, `.env.example`, Postgres 16 local en Docker.

---

### #2 — Modelo de datos Postgres + seed

**SDD:** [`specs/02_modelo_datos/`](specs/02_modelo_datos/requirements.md) · **PRD:** [`auditapp-02-modelo-datos`](docs/source-specs/prds/auditapp-02-modelo-datos.prd.md)

Schema completo, 12 `field_type`, máquina de estados, seed admin/técnicos/plantillas/clientes CSV, rúbrica scoring en `options`, índices de performance.

**Depende de:** #1

---

### #3 — Auth, sesiones y roles

**SDD:** [`specs/03_auth_roles/`](specs/03_auth_roles/requirements.md) · **PRD:** [`auditapp-03-auth-roles`](docs/source-specs/prds/auditapp-03-auth-roles.prd.md)

Login argon2id, cookie HttpOnly, `hooks.server.ts`, guards por rol, token briefing, rate limit en `/login`.

**Depende de:** #2

---

### #4 — Backoffice admin + técnico

**SDD:** [`specs/04_backoffice/`](specs/04_backoffice/requirements.md) · **PRD:** [`auditapp-04-backoffice`](docs/source-specs/prds/auditapp-04-backoffice.prd.md)

Tablero, CRUD auditorías, ABM usuarios, editor plantillas (ítems existentes), layout responsive.

**Depende de:** #3

---

### #5 — Briefing externo (cliente)

**SDD:** [`specs/05_briefing_externo/`](specs/05_briefing_externo/requirements.md) · **PRD:** [`auditapp-05-briefing-externo`](docs/source-specs/prds/auditapp-05-briefing-externo.prd.md)

Ruta `/briefing/[token]`, ítems `filled_by=cliente`, autosave, enviar → `briefing_completo`.

**Depende de:** #3

---

### #6 — Storage Cloudflare R2

**SDD:** [`specs/06_storage_r2/`](specs/06_storage_r2/requirements.md) · **PRD:** [`auditapp-06-storage-r2`](docs/source-specs/prds/auditapp-06-storage-r2.prd.md)

Presigned PUT/GET, bucket privado, convención de keys, tabla `attachment`.

**Depende de:** #2, #3 (puede avanzar en paralelo con #4/#5)

---

### #7 — Form técnico mobile + PWA

**SDD:** [`specs/07_form_tecnico/`](specs/07_form_tecnico/requirements.md) · **PRD:** [`auditapp-07-form-tecnico-mobile`](docs/source-specs/prds/auditapp-07-form-tecnico-mobile.prd.md)

Render 12 `field_type`, autosave, fotos R2, score en vivo lectura, PWA instalable.

**Depende de:** #3, #6

---

### #8 — Cierre + scoring determinístico

**SDD:** [`specs/08_cierre_scoring/`](specs/08_cierre_scoring/requirements.md) · **PRD:** [`auditapp-08-cierre-auditoria`](docs/source-specs/prds/auditapp-08-cierre-auditoria.prd.md)

Scoring CIS/NIST 0/50/100, índices IT/ERP independientes, pantalla cierre, preview informe.

**Depende de:** #7

---

### #9 — Contrato JSON canónico / pipeline IA

**SDD:** [`specs/09_contrato_datos/`](specs/09_contrato_datos/requirements.md) · **PRD:** [`auditapp-09-contrato-datos-ia`](docs/source-specs/prds/auditapp-09-contrato-datos-ia.prd.md)

JSON versionado, `score_basis`, `market_data`, endpoint protegido, puente SPEC-08.

**Depende de:** #8

---

### #10 — Deploy Docker + Dokploy

**SDD:** [`specs/10_deploy_dokploy/`](specs/10_deploy_dokploy/requirements.md) · **PRD:** [`auditapp-10-deploy-dokploy`](docs/source-specs/prds/auditapp-10-deploy-dokploy.prd.md)

Dockerfile multi-stage, migraciones en entrypoint, HTTPS Traefik, Postgres red interna, seed prod, CI.

**Depende de:** #1–#9 (deploy final tras funcionalidad completa)

---

## Dependencias

```
#1 scaffolding
  └── #2 02_modelo_datos
        ├── #3 auth
        │     ├── #4 backoffice
        │     ├── #5 briefing
        │     └── #6 storage_r2 ──► #7 form_tecnico
        │                              └── #8 cierre
        │                                    └── #9 contrato_datos
        └── #6 (paralelo con #4/#5 tras #3)
                                              └── #10 deploy
```

---

## Flujo harness-sdd

```
/leader → spec_author → spec_ready → ⏸ humano → in_progress → implementer → reviewer → done
```

Referencia histórica: `docs/source-specs/`. Trazabilidad: `specs/SOURCE_MAP.md`.

---

## Roadmap v2 (post-MVP)

- Portal calendario / agenda → dispara briefing automático
- Dashboard métricas agregadas (estudio mercado NEA)
- Pre-llenado WHOIS/DNS del briefing
- Recordatorio automático al cliente (n8n)
- Editor completo de plantillas
- Offline-first real (IndexedDB + sync)

---

## Criterios de aceptación del sistema completo

- [ ] Admin **o técnico** crea auditoría con cabecera y asigna técnico
- [ ] Link de briefing; cliente completa sin login
- [ ] Técnico ve briefing precargado en mobile
- [ ] Form renderiza 12 `field_type` incluyendo `table` y `file_ref`
- [ ] Cámara enlaza foto a fila de inventario
- [ ] Autosave + export/import JSON
- [ ] Fotos en R2 vinculadas al ítem
- [ ] Score automático y determinístico
- [ ] Cierre con índices IT/ERP + preview informe
- [ ] JSON canónico versionado para pipeline IA
- [ ] Deploy Dokploy con Postgres no expuesto a internet
- [ ] PWA instalable Android/iOS

---

*Última actualización: 2026-06-08.*
