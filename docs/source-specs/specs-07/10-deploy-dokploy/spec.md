# Spec 07h — Stack y deploy

| Campo | Valor |
|---|---|
| **ID** | SPEC-07h |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | Stack técnico, ORM, migraciones, env, PWA y deploy en Dokploy |

---

## 1. Propósito

Fijar las decisiones técnicas concretas para que cualquiera (o Claude en otra sesión) pueda construir y desplegar la app sin re-discutir el stack.

---

## 2. Stack

| Capa | Elección | Notas |
|---|---|---|
| **Framework** | SvelteKit (Svelte 5) | SSR + form actions + endpoints. Un solo repo full-stack |
| **Adapter** | `adapter-node` | Corre como server Node en Dokploy |
| **Lenguaje** | TypeScript | |
| **DB** | PostgreSQL 16 (Dokploy) | |
| **Acceso a DB** | Drizzle ORM + `postgres` (postgres.js) | Tipado, migraciones simples, liviano |
| **Migraciones** | `drizzle-kit` | Versionadas en el repo, parte del deploy |
| **Auth** | propia (argon2id + tabla `session`, cookie) | Sin proveedor externo ([07b](../03-auth-roles/spec.md)) |
| **Storage** | Cloudflare R2 vía S3 SDK / `aws4fetch` | Presigned URLs ([07g](../06-storage-r2/spec.md)) |
| **Estilos** | Tailwind (o CSS vars de `sys-brand`) | Mobile-first |
| **PWA** | `@vite-pwa/sveltekit` (o SW manual) | Instalable + cache de shell |
| **Validación** | Zod (server-side de inputs) | |

> Si Drizzle complica algo, alternativa: Kysely o `postgres.js` a secas con SQL. Drizzle es el default por tipado + migraciones.

---

## 3. Estructura del repo (propuesta)

```
sysaudit-app/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── db/            # drizzle schema + cliente
│   │   │   ├── auth/          # sesiones, hash, guards
│   │   │   └── r2/            # presigned URLs
│   │   ├── components/        # form fields data-driven, UI mobile
│   │   └── forms/             # motor de render data-driven (compartido tec/cliente)
│   ├── routes/
│   │   ├── (app)/             # backoffice + form técnico (protegido)
│   │   │   ├── tablero/
│   │   │   ├── auditorias/[id]/
│   │   │   ├── plantillas/
│   │   │   └── usuarios/
│   │   ├── briefing/[token]/  # público, sin auth
│   │   ├── login/
│   │   └── api/               # endpoints: autosave, presign, export JSON
│   └── hooks.server.ts        # resolución de sesión
├── drizzle/                   # migraciones
├── static/                    # manifest PWA, íconos SyS
├── Dockerfile
└── .env.example
```

---

## 4. Variables de entorno

```
DATABASE_URL=postgres://user:pass@host:5432/sysaudit
SESSION_SECRET=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=sysaudit
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
PUBLIC_APP_URL=https://auditoria...   # para armar links de briefing
```

Nada de secrets en el cliente. Todo lo `PUBLIC_*` es lo único expuesto.

---

## 5. Deploy en Dokploy

- **App:** imagen Docker (`Dockerfile` con build de SvelteKit + `adapter-node`), corre como servicio en Dokploy.
- **Postgres:** servicio Postgres en el mismo Dokploy (o DB gestionada); `DATABASE_URL` apunta ahí.
- **Migraciones:** corren en el arranque del contenedor o como step previo (`drizzle-kit migrate`). Idempotentes.
- **Seed:** script que crea el admin inicial y carga las 3 plantillas v2 (de [SPEC-04](../../../specs/04-plantillas-auditoria/spec.md)) como filas `template/section/template_item`. Correr una vez.
- **HTTPS:** terminado por el reverse proxy de Dokploy (Traefik). Cookies `Secure`.
- **Backups:** del Postgres de Dokploy (responsabilidad de infra; alinear con la política de backups que predicamos en las auditorías 🙂).

---

## 6. PWA

- `manifest.webmanifest` con nombre "SyS Auditorías", íconos SyS, `display: standalone`, theme color de marca.
- Service worker: precache del app shell + assets; estrategia network-first para datos.
- Instalable en Android/iOS desde el navegador.

---

## 7. Calidad

- Inputs validados con Zod del lado server (nunca confiar en el cliente).
- Autorización en cada load/action ([07b](../03-auth-roles/spec.md)).
- Migraciones versionadas; nada de cambios de schema a mano en prod.
- Tests mínimos: auth guard, autosave upsert idempotente, cálculo de índice.

---

## 8. Dependencias

- Consume el esquema de [SPEC-07a](../02-modelo-datos/spec.md) y materializa lo de [07b](../03-auth-roles/spec.md)–[07g](../06-storage-r2/spec.md).
- Seed depende de las plantillas [SPEC-04](../../../specs/04-plantillas-auditoria/spec.md).

---

## 9. Criterios de aceptación

- [ ] `docker build` produce una imagen que corre en Dokploy con `adapter-node`.
- [ ] Migraciones corren solas en el deploy y son idempotentes.
- [ ] Seed crea admin + 3 plantillas activas.
- [ ] Variables de entorno documentadas en `.env.example`; sin secrets en el cliente.
- [ ] HTTPS + cookies Secure en prod.
- [ ] PWA instalable.

---

## 10. Estado y pendientes

- [ ] Confirmar Drizzle vs Kysely (default Drizzle).
- [ ] Definir dominio/subdominio de la app (¿bajo `auditoriaserviciosysistemas.com.ar`?).
- [ ] Estrategia de correr migraciones (entrypoint vs job de Dokploy).
- [ ] CI mínimo (lint + build) — opcional v1.
