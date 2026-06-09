# Review — feature 05_briefing_externo (#5)

**Veredicto:** CHANGES_REQUESTED  
**Fecha:** 2026-06-09  
**Reviewer:** reviewer agent

## Resumen

La implementación de dominio, rutas, UI y cobertura de tests para briefing externo está completa en código y specs. Sin embargo, la verificación final **no es reproducible**: `./init.sh` falló en 4/4 ejecuciones del reviewer (137–139/145 tests), y `e2e/briefing.spec.ts` falla de forma consistente en el flujo feliz (1/2). El código funciona cuando el fixture E2E se carga manualmente (`ensure-audit.ts` + `preview`), pero el arnés no garantiza ese estado al correr Playwright. No se puede marcar `done` hasta estabilizar la infra de tests.

## Trazabilidad

- R1: [x] `tests/api/briefing-load.test.ts > returns form without session cookie`; `e2e/briefing.spec.ts` (flujo feliz — **falla en reviewer**)
- R2: [x] `tests/briefing-form.test.ts > includes only cliente items from template`
- R3: [x] `tests/api/briefing-save.test.ts > upserts audit_response with source cliente` (**intermitente**: `duplicate key audit_public_token_key`)
- R4: [x] `tests/api/briefing-submit.test.ts > transitions briefing_enviado to briefing_completo`
- R5: [x] `tests/api/briefing-load.test.ts` (unknown token, `en_relevamiento`, `cerrada`); `e2e/briefing.spec.ts > token inválido` (**pasa**)
- R6: [x] `e2e/briefing.spec.ts` (logo + botón Enviar — **falla**: página muestra unavailable)
- R7: [x] `tests/api/briefing-save.test.ts > rejects tecnico item with 403`
- R8: [x] `tests/briefing-token.test.ts` (matriz estados + `isTokenExpired` stub documentado)
- R9: [x] `tests/api/briefing-submit.test.ts > form action returns success flag`; `e2e/briefing.spec.ts` confirmación (**no alcanzado**: falla antes)
- R10: [x] `tests/briefing-form.test.ts > page load exposes razon_social`; e2e header (**no alcanzado**)
- R11: [x] `tests/api/briefing-rate-limit.test.ts > returns 429 after burst`
- R12: [x] `tests/briefing-validation.test.ts` (5 tests permisivos)
- R13: [x] `tests/briefing-form.test.ts` (stepCount 1 vs wizard)
- R14: [x] Suite `tests/api/briefing-*.test.ts` + `tests/briefing-*.test.ts` (archivos presentes; suite **no estable** en init.sh)
- R15: [x] `e2e/briefing.spec.ts` flujo feliz (**falla consistentemente**)

## Tasks

- T1–T29: [x] Todas marcadas completas en `specs/05_briefing_externo/tasks.md`

## Checkpoints

- C1: [ ] `./init.sh` — **FAIL** (exit 1; 137–139/145 en reviewer; 9 fallos en peor corrida)
- C2: [ ] Tests asociados pasan de forma fiable — **FAIL** (flaky: seed, users-admin, backoffice-dashboard, backoffice-routes, briefing-save)
- C2: [x] Una sola feature `in_progress` (#5)
- C2: [x] `progress/current.md` describe sesión activa sin basura histórica
- C3: [x] Capas respetadas (`lib/server/briefing/`, `db/briefing.ts`, rutas); SQL parametrizado; sin `console.log` en briefing
- C3: [x] `token_expires_at` ausente en schema — stub documentado en `impl_05_briefing_externo.md` (aceptable como deuda #2)
- C4: [ ] Vitest 145/145 reproducible — **FAIL** (1 corrida aislada verde, init.sh no)
- C4: [ ] E2E briefing flujo crítico — **FAIL** (1/2 tests; happy path muestra «Este enlace ya no está disponible»)
- C5: [ ] `progress/history.md` sin entrada #5 — esperado hasta `done`
- C6: [x] `specs/05_briefing_externo/` completo (requirements, design, tasks)
- C6: [x] Tasks `[x]` completas
- C6: [ ] Cobertura R↔test ejecutable al 100% — **FAIL** por tests rojos/flaky

## Verificación ejecutada (reviewer)

| Comando | Resultado |
|---|---|
| `./init.sh` (4 corridas) | FAIL — 137/145, 139/145, 136/145, 9 fallos |
| `pnpm exec vitest run` (aislado) | PASS — 145/145 (1 corrida) |
| `pnpm exec playwright test e2e/briefing.spec.ts` (3 corridas) | FAIL — flujo feliz falla; token inválido pasa |
| `ensure-audit.ts` + `preview` + `curl` manual | PASS — formulario con logo, «Hola, E2E Cliente Demo», campos |

### Fallos observados en init.sh

1. `tests/seed.test.ts` — plantilla `erp-estandar` duplicada (4 templates activos vs 3 esperados).
2. `tests/api/users-admin.test.ts` — `Ya existe un usuario con ese email`.
3. `tests/api/backoffice-dashboard.test.ts` — búsqueda Mazzoni (0 filas) y paginación (4 vs 50).
4. `tests/api/backoffice-routes.test.ts` — `User not found: admin@...` (seed no presente).
5. `tests/api/briefing-save.test.ts` — `duplicate key audit_public_token_key` (intermitente).

### Fallo E2E (flujo feliz)

Playwright renderiza `BriefingUnavailable` en lugar del formulario. `error-context.md` confirma heading «Este enlace ya no está disponible». Causa probable: fixture `e2e-briefing-token-demo` no persiste en DB al momento del test (race entre vitest `afterEach`/truncate y `ensure-audit.ts` en `webServer`, o reutilización de preview en puerto 4173 sin re-seed). Verificado: tras `ensure-audit.ts` manual el HTML incluye logo y saludo correctos.

## Cambios requeridos

1. **Estabilizar aislamiento DB en vitest** — `tests/setup.ts` / `tests/helpers/db.ts`: las 4+ corridas consecutivas de `./init.sh` deben dar 145/145 sin fallos intermitentes (`User not found`, duplicate templates, duplicate `public_token`).
2. **Arreglar fixture E2E** — garantizar que `e2e/ensure-audit.ts` deje la auditoría `e2e-briefing-token-demo` disponible **antes** de que corra el test feliz (evitar race con vitest global; considerar `reuseExistingServer`, puerto exclusivo, o seed en `beforeAll` del spec).
3. **Re-ejecutar verificación** — `./init.sh` exit 0 (145/145) y `pnpm exec playwright test e2e/briefing.spec.ts` 2/2 verdes en al menos 3 corridas consecutivas.
4. **Actualizar `progress/impl_05_briefing_externo.md`** — quitar afirmación «145/145 estable» hasta que init.sh sea reproducible.

## Notas positivas (no bloquean, pero listas)

- Spec EARS completo con trazabilidad R→test documentada.
- Dominio briefing bien estructurado (`validate-token`, `load-form`, `save-response`, `submit`, rate-limit).
- UI mobile-first con componentes de marca (`briefing-header`, wizard condicional, confirmación).
- Token inválido E2E y suite vitest de briefing pasan cuando el seed baseline está presente.
