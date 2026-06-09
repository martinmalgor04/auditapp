# auditapp — Briefing externo (cliente)

**ID**: SPEC-07d | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 4 de 8 | **Depende de**: 07a, 07b

---

## Problem

Antes de la visita, el técnico no sabe nada del cliente más allá de lo que el admin cargó en la cabecera. Ese gap se puede resolver si el cliente mismo completa sus datos básicos desde un link — sin cuenta, sin fricción. Hoy no hay ningún mecanismo para eso, y el técnico pierde tiempo en campo preguntando cosas que el cliente podría haber respondido en 5 minutos desde su escritorio.

## Evidence

- Las visitas de Facu/Simón empiezan con preguntas básicas (CUIT, cantidad de empleados, quién da soporte IT) que el cliente podría mandar antes.
- El cliente no tiene cuenta en ningún sistema de SyS y no debería tener que crearse una para responder un briefing de una vez.
- Las plantillas v2 tienen ítems marcados `filled_by='cliente'` — ese set ya existe, falta solo exponerlo.

## Users

- **Primary — Cliente (contacto del cliente auditado)**: abre el link, completa sus datos básicos, lo manda. Puede hacerlo desde cualquier celular.
- **Secondary — Técnico**: ve los datos del cliente precargados en el form cuando llega a la visita.
- **Not for**: clientes que quieran ver el relevamiento técnico, resultados, scores o cualquier dato interno.

## Hypothesis

Creemos que un form público sin login, mobile-first, con solo los campos marcados `filled_by='cliente'` y autosave, logrará que el cliente complete sus datos básicos antes de la visita. Sabremos que funciona cuando el técnico llegue a la visita y vea los datos del briefing precargados en el form de campo.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Tasa de completado del briefing | ≥ 70% de los links enviados | Conteo de `briefing_completo` vs `briefing_enviado` |
| Datos visibles en form técnico post-briefing | 100% de los ítems `filled_by='cliente'` | Test de integración |
| Tiempo de completado del briefing | < 10 minutos | Test de usabilidad con un cliente real |

## Scope

**MVP** — Form público en `/briefing/{token}`, renderiza ítems `filled_by='cliente'`, autosave, confirmación de envío, pantalla de "no disponible" para tokens inválidos o auditorías ya avanzadas (`en_relevamiento`/`cerrada`). Branding SyS aplicado.

**Out of scope**

- Recordatorio automático al cliente si no completa (v2, vía n8n).
- Pre-llenado automático desde WHOIS/DNS del dominio — **sí es factible** (ver Open Questions); queda como mejora v2, no MVP.
- El cliente no puede subir archivos en el briefing (eso es el form técnico).
- Wizard de múltiples pasos (v1: una sola página o 2-3 pasos máximo).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 4a | Ruta pública y validación de token | `/briefing/[token]` válido muestra form; inválido o auditoría avanzada muestra pantalla amable | pending | — |
| 4b | Render data-driven de campos del cliente | Solo ítems `filled_by='cliente'`, con sus `field_type` correspondientes | pending | — |
| 4c | Autosave y confirmación | Cada cambio hace upsert `source='cliente'`; "Enviar" → `briefing_completo` | pending | — |

## Open Questions

- [x] ~~¿Pre-llenado WHOIS/DNS del dominio?~~ — **✅ SÍ es factible**: un job server-side consulta WHOIS/DNS del dominio del cliente (registrador, MX/proveedor de correo, NS/quién administra el DNS) y precarga esos ítems con `prefill_source='whois'|'dns'`. El cliente confirma/corrige. Queda como mejora v2 (no bloquea MVP), pero el modelo (`prefill_source`) ya lo contempla desde 07a.
- [ ] Set exacto de ítems `filled_by='cliente'` — confirmar al cargar el seed de plantillas (07a).
- [x] ~~¿Mostrar nombre de la empresa en el header?~~ — **✅ SÍ ("Hola, {razon_social}"). Personaliza y da confianza; solo expone razón social.**
- [x] ~~¿1 página o wizard?~~ — **✅ Adaptativo: 1 página si son pocos campos, wizard de 2-3 pasos si son >8.**

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Cliente abandona el form a mitad | Media | Medio | Autosave — si vuelve con el mismo link, retoma donde quedó |
| Token compartido por accidente | Baja | Bajo | El token solo lee/escribe ítems `filled_by='cliente'` de esa auditoría; se invalida al pasar a `en_relevamiento` |
| Carga lenta en celular del cliente | Media | Medio | Página liviana, sin JS pesado, SSR de SvelteKit |

---

## Spec técnica de referencia

### Ruta SvelteKit

```
briefing/
  [token]/    → load: validar token → mostrar form o "no disponible"
    +page.server.ts  → acción de autosave (PATCH audit_response)
    +page.server.ts  → acción de envío (PUT audit.status = briefing_completo)
```

### Seguridad

- Server-side: solo escribe `item_id` donde `template_item.filled_by = 'cliente'` Y el `audit_id` corresponde al token.
- Rate limit por token/IP en el endpoint de save.
- Sin scores, secciones internas, ni datos de otras auditorías expuestos.

### UX

- Mobile-first, campos grandes, una acción principal ("Enviar").
- Al enviar: "¡Listo! Nos vemos en la visita." — sin mostrar nada más.
- Branding SyS (skill `sys-brand`): logo, colores, tono cercano.

---

*Status: DRAFT. Spec de referencia completa en [`specs/05_briefing_externo/requirements.md`](../../specs/05_briefing_externo/requirements.md).*
