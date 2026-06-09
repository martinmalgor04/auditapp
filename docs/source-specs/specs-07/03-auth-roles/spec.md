# Spec 07b — Autenticación y roles

| Campo | Valor |
|---|---|
| **ID** | SPEC-07b |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | Login interno, sesiones, roles y acceso público por token |

---

## 1. Propósito

Tres formas de acceso, ni una más:

1. **Interno** (admin, técnico) — usuario + contraseña en DB, sesión por cookie. Sin proveedor externo.
2. **Cliente** — sin login; un **token único por auditoría** abre solo el briefing de *esa* auditoría.
3. **Anónimo** — todo lo demás está cerrado.

Criterio rector: lo más simple que sea seguro. Nada de OAuth, magic links ni MFA en v1.

---

## 2. Auth interna (user + password)

- **Hash:** argon2id (o bcrypt cost ≥ 12 si argon2 complica el build). Nunca texto plano.
- **Sesión:** al loguear se crea fila en `session` (id = token aleatorio, ~32 bytes); el id se entrega en cookie `session` **HttpOnly, Secure, SameSite=Lax**.
- **Validación:** un `hook.server.ts` lee la cookie en cada request, resuelve `session → app_user`, y deja `event.locals.user` (o `null`).
- **Expiración:** sesión válida 30 días; se renueva (sliding) si quedan menos de 15. Logout borra la fila.
- **Alta de usuarios:** solo admin desde backoffice ([07c](../04-backoffice/spec.md)). No hay registro público.
- **Rate limit** en `/login` (p. ej. 5 intentos/min por IP) para frenar fuerza bruta.

### Roles

| Rol | Alcance |
|---|---|
| `admin` | Todo: tablero, CRUD auditorías, plantillas, usuarios, cierre, reabrir |
| `tecnico` | Solo sus auditorías asignadas (`audit.assigned_tech_id = user.id`), carga en campo y cierre técnico |

La autorización se chequea **en el servidor** (load functions / actions), no solo en el UI. Un técnico que pide una auditoría ajena por URL recibe 403.

---

## 3. Acceso del cliente (token, sin login)

- URL del briefing: `/briefing/{public_token}` — el token es la credencial.
- El token (`audit.public_token`) es aleatorio, único, largo (no adivinable), y tiene `token_expires_at`.
- **Qué habilita:** ver y completar **solo** los ítems con `filled_by='cliente'` de esa auditoría, mientras `status ∈ {briefing_enviado, briefing_completo}` y el token no haya vencido.
- **Qué NO habilita:** ver scores, secciones internas, otras auditorías, ni nada del backoffice.
- Token vencido o auditoría ya en relevamiento/cerrada → página "este enlace ya no está disponible".
- El token se puede **regenerar** desde backoffice (invalida el anterior).

---

## 4. Matriz de permisos (resumen)

| Acción | admin | técnico | cliente (token) | anónimo |
|---|---|---|---|---|
| Ver tablero / listado | ✅ | ✅ (solo suyas) | ❌ | ❌ |
| Crear/editar auditoría | ✅ | ❌ | ❌ | ❌ |
| Cargar relevamiento | ✅ | ✅ (asignadas) | ❌ | ❌ |
| Completar briefing | ✅ | ✅ | ✅ (la suya) | ❌ |
| Cerrar auditoría | ✅ | ✅ (asignadas) | ❌ | ❌ |
| Reabrir auditoría cerrada | ✅ | ❌ | ❌ | ❌ |
| Editar plantillas | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |

---

## 5. Dependencias

- Tablas `app_user`, `session`, `audit.public_token` → [SPEC-07a](../02-modelo-datos/spec.md).
- Implementación de hooks/cookies → [SPEC-07h](../10-deploy-dokploy/spec.md).

---

## 6. Criterios de aceptación

- [ ] Login válido crea sesión y cookie HttpOnly; inválido no filtra si falló user o pass.
- [ ] Técnico no puede abrir (ni por URL directa) una auditoría que no tiene asignada → 403.
- [ ] Token de cliente abre solo el briefing correcto y caduca al vencer o al cerrar.
- [ ] Logout invalida la sesión del lado servidor.
- [ ] Contraseñas hasheadas con argon2id/bcrypt; nunca en logs.

---

## 7. Estado y pendientes

- [ ] Definir vigencia exacta del token de briefing (default propuesto: 14 días).
- [ ] ¿Recuperación de contraseña? v1: el admin la resetea a mano. Magic-link queda para v2.
- [ ] Auditoría de accesos (log de logins) — opcional v2.
