# Spec 07d — Briefing externo (cliente)

| Campo | Valor |
|---|---|
| **ID** | SPEC-07d |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | El form público sin login para que el cliente precargue datos básicos |

---

## 1. Propósito

Paso **1b** del flujo: antes de la visita, el cliente abre un link y completa los **datos básicos** de su empresa. Eso le ahorra tiempo al técnico (los ve precargados en campo) y arranca la conversación.

Sin login, sin instalación, sin fricción: el cliente abre el link, completa, manda. Tiene que funcionar perfecto en el celular del cliente (que puede ser cualquiera).

---

## 2. Acceso

- URL: `/briefing/{public_token}` — el token (generado en backoffice, [07c](../07c-backoffice/spec.md)) es la única credencial.
- Válido mientras `audit.status ∈ {briefing_enviado, briefing_completo}` y el token no haya vencido.
- Vencido / auditoría avanzada / token inválido → pantalla amable: "Este enlace ya no está disponible. Contactá a Servicios y Sistemas."

---

## 3. Qué completa el cliente

Solo los ítems con `filled_by='cliente'` (subconjunto de la cabecera `CAB` y de algunos ítems precargables `is_prefillable` con `prefill_source='briefing'`). Ejemplos típicos:

- Razón social / CUIT (confirmar o corregir lo que el admin precargó).
- Rubro / actividad.
- Cantidad de empleados, terminales/puestos, sedes.
- Referente del cliente (nombre + cargo + contacto).
- Proveedor de correo, quién administra el dominio, quién da soporte IT hoy.
- Qué sistema de gestión / ERP usan hoy.

> La lista exacta es **data-driven**: sale de los `template_item` marcados `filled_by='cliente'`. Cambiarla = marcar/desmarcar ítems, sin tocar código.

El cliente **no ve** scores, secciones técnicas internas ni nada del relevamiento. Solo su formulario de básicos.

---

## 4. Experiencia (UX)

- **Mobile-first**, una sola página o wizard corto de 2–3 pasos. Pocos campos, etiquetas claras, sin jerga.
- Branding SyS (skill `sys-brand`): logo, colores, tono cercano.
- **Autosave** igual que el form técnico ([07e](../07e-form-tecnico-mobile/spec.md)): si el cliente cierra y vuelve con el mismo link, retoma donde quedó.
- Al enviar: confirmación ("¡Listo! Nos vemos en la visita.") y `audit.status → briefing_completo`.
- Validaciones suaves (CUIT con formato, números no negativos), pero permisivas: mejor un dato parcial que abandono.
- Las respuestas se guardan como `audit_response` con `source='cliente'`, `updated_by=null`.

---

## 5. Seguridad

- Token largo, aleatorio, no enumerable (ver [07b §3](../07b-auth-roles/spec.md)).
- El form solo escribe ítems `filled_by='cliente'` de **esa** auditoría; cualquier otro `item_id` se rechaza en el servidor.
- Rate limit por token/IP para evitar abuso.
- Sin datos sensibles expuestos: el cliente nunca ve hallazgos, scores ni info de otras auditorías.

---

## 6. Dependencias

- Token y estados: [SPEC-07b](../07b-auth-roles/spec.md), [SPEC-07a §4](../07a-modelo-datos/spec.md).
- Render data-driven y autosave: comparte motor con [SPEC-07e](../07e-form-tecnico-mobile/spec.md).
- Marca: skill `sys-brand`.

---

## 7. Criterios de aceptación

- [ ] Con un token válido, el cliente ve solo los ítems `filled_by='cliente'` y los completa sin login.
- [ ] Al enviar, la auditoría pasa a `briefing_completo` y los datos quedan como `source='cliente'`.
- [ ] El técnico ve esos datos precargados en el form de campo.
- [ ] Token vencido o auditoría avanzada → pantalla de "no disponible".
- [ ] El cliente no puede acceder a ningún dato fuera de su briefing.
- [ ] Funciona en mobile en una conexión lenta.

---

## 8. Estado y pendientes

- [ ] Definir el set exacto de campos del briefing (marcar `filled_by='cliente'` en la plantilla).
- [ ] ¿Mensaje/recordatorio automático al cliente si no completa? — v2 (n8n).
- [ ] ¿Pre-llenar el briefing con datos automáticos (WHOIS/DNS del dominio) antes de mandarlo? — se cruza con `prefill_source` automáticos ([SPEC-00](../../../specs/00-proyecto-lead-magnet/spec.md)).
