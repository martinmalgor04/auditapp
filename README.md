# auditapp — Plataforma de carga de auditorías (sysaudit-app)

App web **mobile-first** para digitalizar el flujo de auditorías de SyS: backoffice (admin), briefing del cliente y carga en campo (técnicos).

Esta carpeta es el hogar de la app. Por ahora contiene las **especificaciones**; el código del proyecto SvelteKit vivirá acá también.

## Estructura

```
auditapp/
├── README.md          ← este archivo
├── specs/             ← especificaciones (familia SPEC-07)
│   ├── spec.md        ← spec paraguas (visión, flujo, arquitectura)
│   ├── 07a-modelo-datos/        ← esquema Postgres + plantillas data-driven
│   ├── 07b-auth-roles/          ← login user+pass, sesiones, token cliente
│   ├── 07c-backoffice/          ← CRUD auditorías + tablero
│   ├── 07d-briefing-externo/    ← form público del cliente
│   ├── 07e-form-tecnico-mobile/ ← carga en campo + autosave + PWA
│   ├── 07f-cierre-auditoria/    ← índices, riesgos, salida para IA
│   ├── 07g-storage-r2/          ← fotos/exports en R2
│   └── 07h-stack-deploy/        ← SvelteKit, Drizzle, Dokploy
└── (futuro código SvelteKit: src/, drizzle/, Dockerfile, …)
```

## Stack (resumen — detalle en [specs/07h](specs/07h-stack-deploy/spec.md))

- **Frontend/backend:** SvelteKit (Svelte 5) + adapter-node
- **DB:** PostgreSQL en Dokploy + Drizzle ORM
- **Storage:** Cloudflare R2 (fotos/exports)
- **Auth:** propia (user+pass, sesiones); cliente vía token sin login

## Por dónde empezar

Leé la [spec paraguas](specs/spec.md) — tiene el flujo de 3 etapas, las decisiones de arquitectura y el mapa al resto de las sub-specs.

> Contexto del proyecto madre (funnel, plantillas, ICP) en [`../specs/`](../specs) y [`../CLAUDE.md`](../CLAUDE.md).
