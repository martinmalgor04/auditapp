# Pruebas manuales — 3 auditorías completas

> **HTML interactivo:** [`docs/datos-prueba-auditorias.html`](./datos-prueba-auditorias.html)  
> **E2E Playwright:** `e2e/audit-full-flow.spec.ts` · datos en `e2e/fixtures/audit-scenarios.ts`

Cada caso recorre: **crear → briefing → relevamiento → cierre → cerrada**.

## Credenciales

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | `admin@serviciosysistemas.com.ar` | `changeme-admin` |
| Facu | `facu@serviciosysistemas.com.ar` | `changeme-tech` |
| Simón | `simon@serviciosysistemas.com.ar` | `changeme-tech` |

## Los 3 casos

| Caso | Empresa | Tipo | Seg. | Técnico |
|------|---------|------|------|---------|
| **A** | Distribuidora del Litoral SA | IT | A | Facu |
| **C** | Metalúrgica NEA SA | IT + ERP Tango | A | Facu |
| **D** | Boutique Moda & Estilo | ERP Tango | C | Simón |

Detalle de campos, briefing y cierre: ver HTML.

## Comandos

```bash
pnpm run db:seed    # usuarios + plantillas + clientes CSV
pnpm run dev        # http://localhost:5173

# Automatizar los 3 casos (requiere DB local)
pnpm exec playwright test e2e/audit-full-flow.spec.ts
```
