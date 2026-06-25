# Sesión actual

**Feature activa:** 46_paridad_informe_gold

**Estado:** BLOCKED — pre-condición del implementer no cumplida.
- `feature_list.json` marca la feature #46 como `spec_ready`, no `in_progress`.
- El gate del arnés SDD es `spec_ready → ⏸ HUMANO → in_progress`. La feature no pasó
  la puerta de aprobación humana.
- `tasks.md` indica explícitamente: "NO empezar hasta aprobación humana
  (resolver OQ-1..OQ-5 de design.md)".
- Hay 5 Open Questions sin resolver que condicionan el diseño/implementación:
  - OQ-1 numeración de la sección "Próximos pasos" (eyebrow) → afecta T9.
  - OQ-2 valor del umbral `TL_HORIZONTAL_MAX` → afecta T11/T12.
  - OQ-3 (BLOQUEANTE) qué `code`/criterio canónico identifica la sección de
    seguridad → afecta T3 (no se puede poblar `draft.seguridad` sin esto).
  - OQ-4 alcance del `@media print` (solo web-render o también render A4 del editor).
  - OQ-5 estado de la tabla seguridad: texto libre vs enum con color.

**Verificación:** no ejecutada (no se inició implementación).

**Re-pasada implementer (2026-06-25):** el reviewer rechazó la pasada previa pidiendo
"corregir bloqueantes e implementar". Tras re-verificar el repo, el implementer
mantiene la decisión de NO implementar, por dos motivos que ninguna corrección de
código resuelve:

1. **Puerta humana no franqueada.** #46 sigue en `spec_ready`. La corrección del
   bloqueante "no está en `in_progress`" NO es que el implementer se auto-promueva el
   status — eso saltea el control central del arnés (`spec_ready → ⏸ HUMANO →
   in_progress`). El cambio de status lo hace la puerta humana (Martín), no el agente.
2. **OQ-3 deja la implementación técnicamente inviable.** T3 exige el `code`/criterio
   canónico que identifica la sección de seguridad para poblar `draft.seguridad`. Ese
   dato NO existe en `src/lib/server/canonical/schema.ts` ni en el spec. Inventarlo
   violaría "no inventes requirements fuera del spec". Sin él, T3→T6 y los tests R1/R2
   no se pueden construir.

OQ-1, OQ-2, OQ-4 y OQ-5 siguen igualmente sin resolver y condicionan T9, T11/T12,
T14–T18 y T4/T5.

**Próximo paso (desbloqueo, acción de Martín, NO del implementer):**
1. Resolver OQ-1..OQ-5 en `design.md` (OQ-3 es prerequisito duro).
2. Pasar #46 a `in_progress` en `feature_list.json`.
Recién entonces el implementer ejecuta T1..T25.
