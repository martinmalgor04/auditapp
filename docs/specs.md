# Spec Driven Development (SDD)

> Flujo Kiro-style: requirements → design → tasks → code.
> El código no se escribe hasta que el spec está aprobado por un humano.

## Estructura

Cada feature con `"sdd": true` tiene carpeta dedicada cuando deja `pending`:

```
specs/<feature-name>/
├── requirements.md   # QUÉ (EARS notation)
├── design.md         # CÓMO (decisiones técnicas)
└── tasks.md          # PASOS concretos
```

El `feature-name` coincide con el campo `name` de `feature_list.json`.

## Estados

| Estado | Significado |
|---|---|
| `pending` | Sin spec. `spec_author` actúa primero. |
| `spec_ready` | Spec drafted. Esperando aprobación humana. NO código. |
| `in_progress` | Spec aprobado. `implementer` trabajando. |
| `done` | Código verde, `reviewer` aprobó. |
| `blocked` | Atascado. Razón en `progress/current.md`. |

## Puerta de aprobación humana

```
pending → [spec_author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

## requirements.md — EARS estricto

| Patrón | Plantilla |
|---|---|
| **Ubicuo** | `El sistema DEBE <acción>.` |
| **Evento** | `CUANDO <disparador>, el sistema DEBE <acción>.` |
| **Estado** | `MIENTRAS <estado>, el sistema DEBE <acción>.` |
| **Opcional** | `DONDE <feature opcional>, el sistema DEBE <acción>.` |
| **No deseado** | `SI <evento no deseado> ENTONCES el sistema DEBE <acción>.` |

Reglas:

- Cada requirement: id estable `R1`, `R2`, ...
- Verificable por al menos un test concreto.
- Un solo `DEBE` por requirement. Si hay más, partir.
- Solo `DEBE` / `NO DEBE`. Sin "podría", "puede", "soporta".

## design.md

Antes de código:

- Archivos a crear/modificar.
- Firmas nuevas (funciones, tipos, rutas).
- Errores reutilizados o nuevos.
- Alternativa descartada con justificación.

Apóyate en `docs/architecture.md`, `docs/conventions.md` y
`docs/source-specs/` para contexto de negocio.

## tasks.md

Pasos discretos en orden, checkbox, cada uno referencia `R<n>`:

```markdown
- [ ] T1 — Crear migración `001_initial.sql`. Cubre: R1, R2.
- [ ] T2 — Añadir `tests/schema.test.ts`. Cubre: R1.
```

## Trazabilidad (regla dura)

- Cada test mapea a un `R<n>`.
- Cada `R<n>` tiene al menos un test.
- Mapa en `progress/impl_<name>.md`.
- El `reviewer` rechaza si falta.

## Material de referencia

Al redactar specs, consultar (no copiar literal sin adaptar a EARS):

- `docs/source-specs/prds/auditapp-0*.prd.md`
- `docs/source-specs/specs-07/07*/spec.md`
