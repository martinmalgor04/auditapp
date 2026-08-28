# Sesión — spec_author de 62_escaneo_revision_ui (2026-08-28)

## Objetivo

Redactar el spec EARS completo de la feature `62_escaneo_revision_ui`
(pending → spec_ready) y frenar en la puerta humana.

## Estado

- Spec creado en `specs/62_escaneo_revision_ui/`:
  - `requirements.md` — 31 requisitos EARS (R1–R31) con mapa acceptance→R.
  - `design.md` — read-model consolidado multi-VLAN (query SQL con
    `GROUP BY identidad` + `ARRAY_AGG` ordenado, sin vista ni tabla
    derivada), vinculación con relevamiento manual vía
    `(relevamiento_item_id, relevamiento_row_id)` en migración 032 (sin
    normalizar `audit_response`), revisión por grupo de identidad, rutas
    `/auditorias/[id]/escaneos` + detalle por `[identidad]`, 11 alternativas
    descartadas y 3 preguntas abiertas (OQ1 copia asistida, OQ2 revisión con
    auditoría cerrada, OQ3 estados que entran al consolidado).
  - `tasks.md` — 16 tasks (T1–T16) con trazabilidad "Cubre: R<n>".
- `feature_list.json`: feature 62 → `spec_ready` (única tocada).
- Rama: `cursor/62-escaneo-revision-ui-e2e6`.
- Hallazgo clave de investigación: el relevamiento manual vive en
  `audit_response.value.rows[*]` con `row_id` UUID estable (no hay tabla
  normalizada); las filas pueden borrarse → el spec contempla vínculo roto
  (R25).

## Próximo paso

⏸ Puerta humana: revisar el spec (especialmente las 3 OQ del design).
Tras aprobación, el leader pasa la feature a `in_progress` y lanza
`implementer`. Nota: T11 (actions de token) requiere #60 mergeada.
