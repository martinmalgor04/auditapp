# Implementación — 46_paridad_informe_gold

Eleva el render automático del informe (`web-render.ts`) al nivel del informe
hecho a mano (gold standard), cerrando las brechas no cubiertas por #45. Todo el
contenido nuevo sale del canónico/`client_draft`, branded con tokens `--sys-*`,
sin material interno. La sección 06 "Propuesta de abono" queda EXCLUIDA (spec aparte).

## Archivos tocados

- `src/lib/informe/render-shared.ts` — campo opcional `seguridad` en `RenderClientDraft`.
- `src/lib/server/informe/schemas.ts` — `seguridad` opcional/nullable en el schema Zod (`.strict()`).
- `src/lib/server/informe/model.ts` — poblado de `draft.seguridad` desde la sección canónica de seguridad (null si no existe).
- `src/lib/informe/web-render.ts` — `renderSeguridad`, `renderProximosPasos`, `renderTimelineVertical`, umbral `TL_HORIZONTAL_MAX`, CSS de `.equip-table`/`.steps`/`.excl-grid`/`.tl`, y bloque `@media print` A4.
- `tests/informe-web-render.test.ts` + `tests/__snapshots__/informe-web-render.test.ts.snap` — cobertura R1–R19.

## Trazabilidad R ↔ test

| Req | Qué cubre | Verificación |
|---|---|---|
| R1 | Tabla control/estado/observaciones branded | snapshot "tabla seguridad presente" (T19) |
| R2 | Omisión limpia sin sección de seguridad | snapshot "tabla seguridad ausente" (T19) |
| R3 | `seguridad` opcional en draft + schema | tests de schema/draft (T1–T3) |
| R4 | `escapeHtml` por celda | test de escape en filas de seguridad |
| R5 | Pasos numerados `.steps/.step/.sn` | snapshot Próximos pasos (T20) |
| R6 | `excl-grid` necesitamos/no incluye | snapshot Próximos pasos (T20) |
| R7 | Pobla desde `client_draft.proximos_pasos` | snapshot + caso vacío (T20) |
| R8 | Reemplazo del `.twocol` por excl-grid | snapshot Próximos pasos (T20) |
| R9 | Timeline vertical con `.tl/.tl-item` | snapshot timeline vertical (T21) |
| R10 | Caso horizontal intacto bajo umbral | snapshot timeline horizontal (T21) |
| R11 | Umbral `TL_HORIZONTAL_MAX` | test de selección horizontal/vertical (T21) |
| R12 | `@page` A4 + saltos de página por sección | test de print (T22) |
| R13 | Gauge en valor final estático para PDF | test de print (T22) |
| R14 | Barras/contadores estáticos, `transition:none` | test de print (T22) |
| R15 | Tema claro impreso legible | test de print (T22) |
| R16 | `break-inside: avoid` en bloques | test de print (T22) |
| R17 | Tokens `--sys-*` en todo el CSS nuevo | snapshots + revisión de STYLE |
| R18 | Sin material interno / solo `client_draft` | test anti-upsell (T23) + schema `.strict()` |
| R19 | No-regresión snapshots ERP/IT | snapshots existentes sin cambios no intencionales (T24) |

## Verificación (T25)

- `tests/informe-web-render.test.ts`: 36 tests verdes (+20 respecto a master).
- `pnpm exec tsc --noEmit`: sin errores nuevos (los 3 de `SaveIndicatorState` ya existen en master).
- `pnpm test` (suite completa): 1325 passed. La única falla (`canonical-contract` snapshot)
  reproduce idéntica en master y es pollution de orden de suite, ajena a #46.

## Follow-up (no bloqueante)

- Limpiar CSS muerto `.twocol` en el `STYLE` de `web-render.ts` (markup ya removido por R8).
