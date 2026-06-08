# auditapp — Autenticación y roles

**ID**: SPEC-07b | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 2 de 8 | **Depende de**: 07a

---

## Problem

La app tiene tres tipos de acceso con necesidades completamente distintas: el admin y los técnicos necesitan login seguro con roles diferenciados; el cliente necesita acceder al briefing sin fricción (sin registrarse, sin contraseña); y todo lo demás debe estar cerrado. Sin auth bien implementada cualquier técnico puede ver auditorías ajenas o cualquier anónimo puede leer datos sensibles.

## Evidence

- Técnicos (Facu/Simón) no deben ver auditorías de otros técnicos — es un requisito de negocio explícito de Martín.
- El cliente no puede registrarse para un briefing de una sola vez — la fricción lo haría abandonar.
- No hay presupuesto ni necesidad de proveedor externo de auth (OAuth, Auth0) — la app es interna, el equipo es pequeño.

## Users

- **Primary — Admin/Técnico**: necesita login seguro, sesión persistente, roles respetados en servidor.
- **Primary — Cliente**: accede al briefing con un link, sin registro, sin contraseña.
- **Not for**: usuarios anónimos, acceso público a datos de auditorías.

## Hypothesis

Creemos que auth propia con user+password, sesiones por cookie HttpOnly y token único por auditoría para el cliente es la implementación más simple que cumple los requisitos de seguridad de SyS. Sabremos que funciona cuando el cliente pueda completar su briefing sin cuenta, y los técnicos puedan crear y ver auditorías (incluyendo las disponibles y sus resultados) sin que el cliente acceda a nada fuera de su briefing.

> **Cambio v2 de permisos**: los técnicos **sí pueden crear auditorías** (de momento) y **ven todas las auditorías disponibles y sus resultados**, no solo las asignadas. La restricción dura queda en lo que es del cliente (token) y en acciones de admin (usuarios, plantillas, reabrir).

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Cliente no accede a nada fuera de su briefing | 100% bloqueado | Test de autorización server-side |
| Token de cliente invalida al avanzar/cerrar la auditoría | 100% | Test de estados post-cierre |
| Técnico puede crear auditoría y ver resultados de todas | 100% | Test funcional de rol técnico |
| Contraseñas hasheadas con argon2id | 100% (0 texto plano en DB) | Inspección directa de `password_hash` |

## Scope

**MVP** — Login user+pass con argon2id, sesión por cookie (30 días, sliding), roles `admin`/`técnico`, token único de cliente en `audit.public_token`, rate limit en `/login`. Sin recovery de contraseña automático (admin resetea a mano).

**Out of scope**

- OAuth / magic-link / MFA (v2).
- Recovery de contraseña por email (v1: reset manual por admin).
- Audit log de logins (v2).
- SSO (no aplica).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 2a | Login + sesión + cookie | `/login` crea sesión, cookie HttpOnly Secure SameSite=Lax, `hooks.server.ts` resuelve user | pending | — |
| 2b | Roles y guards server-side | Load functions/actions validan rol; técnico ve/crea todo, admin tiene las acciones sensibles; cliente solo su briefing | pending | — |
| 2c | Token de cliente | Generación de `public_token`, validación en `/briefing/[token]`, invalidación al cerrar | pending | — |

## Open Questions

- [x] ~~Vigencia del token~~ — **DECISIÓN**: el briefing no tiene expiración por tiempo. El token es persistente y se "activa/recicla" cuando el admin lo regenera para una nueva visita agendada. Se invalida solo al pasar a `en_relevamiento` o al cerrar la auditoría.
- [x] ~~¿Mensaje de login?~~ — **✅ Genérico: "usuario o contraseña incorrectos". No revela si falló el usuario o la pass.**

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| argon2 complica el build en Node/Docker | Baja | Bajo | Fallback: bcrypt cost ≥ 12 |
| Token de briefing predecible | Muy baja | Alto | Usar `crypto.randomBytes(32).toString('base64url')` |
| Sesión no invalida en logout por cache | Baja | Medio | Borrar fila de `session` en el server, no solo la cookie |

---

## Spec técnica de referencia

### Login flow
1. POST `/login` → validar email+pass, comparar argon2id
2. Crear fila `session(id=token_aleatorio, user_id, expires_at=+30d)`
3. Cookie `session=token` HttpOnly Secure SameSite=Lax
4. Redirect al tablero

### hooks.server.ts
```typescript
// Pseudocódigo
event.locals.user = await resolveSession(cookies.get('session'))
```

### Token de cliente
- URL: `/briefing/{public_token}`
- Válido cuando: `audit.status ∈ {briefing_enviado, briefing_completo}` — **sin expiración por tiempo**
- El token es persistente; el cliente puede volver cuando quiera mientras la auditoría no avance
- Se invalida al pasar a `en_relevamiento` o `cerrada`
- El admin puede regenerar el token (invalida el anterior) — p.ej. al cambiar de contacto o reabrir
- `token_expires_at` se elimina del schema — la vida del token la controla `audit.status`
- Token inválido/auditoría avanzada → "Este enlace ya no está disponible."

### Matriz de permisos

| Acción | admin | técnico | cliente (token) |
|---|---|---|---|
| Ver tablero / todas las auditorías | ✅ | ✅ (**todas**: disponibles + resultados) | ❌ |
| Crear auditoría | ✅ | ✅ (**de momento**) | ❌ |
| Editar cabecera / reasignar | ✅ | ✅ (las que crea o tiene asignadas) | ❌ |
| Cargar relevamiento | ✅ | ✅ (asignadas o tomadas) | ❌ |
| Ver resultados/índices de cualquier auditoría | ✅ | ✅ | ❌ |
| Completar briefing | ✅ | ✅ | ✅ (la suya) |
| Cerrar auditoría | ✅ | ✅ (asignadas) | ❌ |
| Reabrir cerrada | ✅ | ❌ | ❌ |
| Editar plantillas | ✅ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ |

> Los técnicos tienen visibilidad total (ver todo + crear) pero las acciones sensibles (reabrir, plantillas, usuarios) siguen siendo solo de admin. Esto puede endurecerse más adelante; por eso el guard se chequea siempre server-side y es fácil de ajustar por rol.

---

*Status: DRAFT. Spec de referencia completa en [`specs/07b-auth-roles/spec.md`](../../specs/07b-auth-roles/spec.md).*
