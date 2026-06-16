# Review — feature 23 `23_crm_empresa_unificada` · Fase 2

**Veredicto:** APPROVED

> Alcance de esta revisión: **solo Fase 2** (reconexión del importador #21 a `empresa` con selector
> de `relacion`). Tasks T6, T7, T7b, T8, T8b + Gate Fase 2. Fase 1 ya estaba validada; Fases 3–6
> siguen `[ ]` y quedan fuera de alcance.

## Trazabilidad R ↔ test (Fase 2)

- R24: [x] `tests/clients-import-upsert.test.ts` — escribe en tabla base `empresa` (relkind r/v),
  upsert por CUIT (nuevo crea / existente actualiza), no hay `client` físico separado.
- R25: [x] `tests/clients-import-upsert.test.ts` — empresa nueva toma `relacion` del selector
  (`cliente` y `prospecto`), no nula, no inferida por origen.
- R29: [x] `tests/api/clients-import.test.ts` — 401 sin sesión, 403 rol técnico (guard
  `requireAdminApi` intacto).
- R31: [x] `tests/clients-import-upsert.test.ts` + `tests/api/clients-import.test.ts` (Zod 400 si
  falta/inválida, rechaza `ex_cliente`) + `e2e/crm-import.spec.ts` (selector en UI; prospecto→
  prospecto, cliente→cliente verificado en DB).

## Tasks

- T6: [x] `clients-import.ts` → `INSERT INTO empresa`, `applyClientImport(plan, relacion)`, INSERT
  incluye columna `relacion` (parámetro), UPDATE no la pisa. Verificado en código.
- T7: [x] `empresaImportSchema` en `crm/schemas.ts`; endpoint valida `relacion` con Zod (400),
  guard `requireAdminApi` intacto. Verificado.
- T7b: [x] `<select data-testid="crm-import-relacion">` (cliente/prospecto, default `cliente`) en
  el panel del CRM; `submitImport` envía `relacion`. Verificado.
- T8: [x] `clients-import-upsert.test.ts` reescrito sobre tabla base `empresa`. 7/7 verde.
- T8b: [x] `e2e/crm-import.spec.ts` (nuevo). 3/3 chromium.

## Checkpoints

- C1: [x] arnés completo; `init.sh` existe (ver nota gate abajo).
- C2: [x] tests asociados a la fase pasan. (3 features `in_progress` es decisión humana conocida.)
- C3: [x] SQL parametrizado (postgres.js tagged templates), sin ORM, sin `console.log` debug, sin
  secretos. `ON CONFLICT (cuit) WHERE cuit IS NOT NULL` correcto.
- C4: [x] `tests/` cubre `applyClientImport`; vitest > 0 y verde; flujo crítico con e2e.
- C5: [x] sin archivos sospechosos sin trackear (solo `e2e/crm-import.spec.ts` nuevo, esperado);
  `feature_list.json` NO tocado; sin commit/push.
- C6: [x] cada R de Fase 2 cubierto por test; tasks `[x]` solo donde realmente hechas.

## Verificación independiente (reproducida por el reviewer)

- `pnpm run check` → **0 errores**, 25 warnings pre-existentes (`state_referenced_locally`). OK.
- `pnpm run build` → **OK** (adapter-node, built in ~2.8s).
- Suite import + empresa (9 archivos) → **48/48 passed**.
- e2e import chromium (`crm-import` + `import-clientes`) → **5/5 passed**.

Coinciden exactamente con los números reportados por el implementer.

## Puntos de criterio confirmados

1. **UPDATE no pisa `relacion` — CORRECTO.** R24 pide upsert por CUIT (existente actualiza, nuevo
   crea), sin mandar reclasificar existentes. R25 acota el selector a la empresa **nueva**. La
   lectura del implementer es la correcta; reclasificar en masa por un import sería destructivo y el
   spec no lo pide. Consistente con R24/R25.
2. **`origen` físico = `'presupuestos'` — OK.** R31/R25 desacoplan `relacion` (selector) de `origen`
   (etiqueta de carga). R32 confirma que la inferencia por origen es exclusiva de la migración
   histórica, no del import en vivo. Verificado por test (`origen='presupuestos'` con relacion
   cliente y prospecto).
3. **Fix CUIT en `import-clientes.spec.ts` — LEGÍTIMO.** `normalizeCuit` exige `/^\d{11}$/`; el
   viejo `slice(-7)` generaba 12 dígitos → fila siempre inválida → caía en "omitidos". El fix
   (`slice(-6)` → 11 dígitos) restaura el camino "created" que el test pretendía ejercitar. NO toca
   ni enmascara lógica de Fase 2 (el endpoint usa el default `cliente` del selector). Bug de
   data-de-test pre-existente de #21, ajeno a Fase 2.

## Reglas del arnés

- [x] `feature_list.json` NO modificado por el implementer.
- [x] Sin commit ni push.
- [x] T6–T8b `[x]` solo donde el trabajo está real y verificado.
- Nota: `./init.sh` §3 `[FAIL]` por ">1 in_progress" (#12/#23/#24) es condición conocida y
  aceptada (decisión humana/leader). NO es motivo de rechazo para Fase 2.

## Hallazgos

- (Menor / informativo) El test `clients-import-upsert > CUIT nuevo crea; existente actualiza`
  precarga la fila existente con `relacion='cliente'` y luego importa con selector `'cliente'`, así
  que no distingue explícitamente "el UPDATE no pisó relacion" de "coincidían". El comportamiento
  está garantizado por el SQL (el SET del UPDATE no incluye `relacion`) y revisado en código, pero
  un assert con relacion existente ≠ selector lo dejaría blindado contra regresión. No bloquea.

## Recomendación

**Avanzar a Fase 3.** Fase 2 cumple su Gate: el import en vivo crea/actualiza en `empresa` con la
relacion del selector, verificado en código, vitest y e2e, con `check`/`build` verdes.

---

# Review — feature 23 `23_crm_empresa_unificada` · Fase 3

**Veredicto:** APPROVED

> Alcance: **solo Fase 3** (reconectar form de nueva auditoría + dashboard de mercado de la vista
> `client` a la tabla base `empresa`). Tasks T9–T13 + Gate Fase 3. Fases 1–2 ya aprobadas; Fases 4–6
> siguen `[ ]`, fuera de alcance.

## Trazabilidad R ↔ test (Fase 3)

- R27: [x] `tests/audits-create.test.ts` (4/4) — picker resuelve sobre tabla base `empresa`
  (`relkind='r'`), FK `audit.empresa_id` válida hacia empresa, CAB precargado, empresa nueva
  `relacion='prospecto'`, sync vía `syncClientFromCab` a la tabla base. + `e2e/auditorias-new.spec.ts`.
- R28: [x] `tests/mercado-queries.test.ts` (2/2) — universo cuenta empresa de la tabla base; el JOIN
  recupera `erp_actual`/`rubro` desde `empresa` (marcadores únicos prueban que el join pega en
  `empresa`, no en la vista). + `tests/mercado-aggregations.test.ts` (10/10) sin regresión.
- R21: [x] cubierto por R27 — CAB precargado vía `cab-client-map` reutilizado, sin cambio de forma del
  tipo `ClientCabFields`. (La acción "crear auditoría desde la ficha" propiamente dicha es Fase 5/T23.)

## Tasks

- T9: [x] `backoffice/audits.ts` — 5 sitios reapuntados a `empresa` (verificado por grep SQL:
  0 reads de `client` a nivel tabla; los 3 tokens `client` restantes son nombres de archivo/variable JS).
- T10: [x] `mercado/queries.ts` — 10/10 `JOIN client c` → `JOIN empresa c` (verificado por grep).
- T11: [x] `auditorias/new/*` y `cab-client-map.ts` sin cambios necesarios (working tree no los toca).
- T12: [x] `tests/audits-create.test.ts` + `e2e/auditorias-new.spec.ts`.
- T13: [x] `tests/mercado-queries.test.ts`.

## Checkpoints / Gate Fase 3

- C-check: [x] `pnpm run check` → 0 errores (25 warnings pre-existentes de Svelte).
- C-build: [x] `pnpm run build` OK (reportado; check verde + suite verde).
- C-suite: [x] Slice dirigido reproducido: audits-create 4/4, mercado-queries 2/2,
  mercado-aggregations 10/10, empresa-schema 7/7, empresa-compat 4/4, clients-import-upsert 7/7
  (36/36). Suite completa reportada 797 passed / 2 skipped / 0 failed (consistente).
- C-hot-reads: [x] Sin lecturas calientes de la vista `client` en `audits.ts` ni `mercado/queries.ts`.
- C-FK: [x] `audit.empresa_id` apunta a `empresa`; FK válida (test).
- C-init.sh: [N/A bloqueante] §3 FAIL por ">1 in_progress" (#12/#23/#24) — condición conocida/aceptada.

## Puntos de criterio verificados

1. **Default `relacion='prospecto'` en `createAudit`** — CONSISTENTE con R27/R21 y el design. El design
   (línea 218) solo manda `INSERT INTO empresa` sin fijar valor; R27 exige FK válida y sin regresión,
   no exige `cliente`. El default es no-destructivo (nunca eleva a `cliente`), coherente con el default
   del selector de import, y `relacion` (clasif. maestra) ≠ `estado` de seguimiento. Ningún requisito
   impone que una empresa con auditoría deba ser `cliente`. Aprobado.
2. **Sin lecturas calientes de la vista `client`** — CONFIRMADO por grep SQL en ambos archivos. La vista
   queda solo como compat/rollback (decisión humana 8).
3. **Desvíos pre-existentes (follow-up aceptable, NO bloquean Fase 3):**
   a. e2e `mercado.spec` "admin ve dashboard" rojo: brittle-selector REAL, no regresión. `SysShell.svelte`
      renderiza el snippet `nav` 2 veces (header desktop L57 + strip `md:hidden` L65) → `nav a[href="/mercado"]`
      matchea 2 → strict-mode. `SysShell.svelte`/`+layout.svelte`/`mercado.spec.ts` NO están modificados en
      el working tree (solo `audits.ts` y `mercado/queries.ts`). El dashboard renderiza y las queries
      `empresa` ejecutan (cobertura R28 verde en vitest). Queda como follow-up fuera de #23.
   b. `action_unhandled_error` en alta: `redirect(303)` dentro del `try` (L35 de `auditorias/new/+page.server.ts`)
      cae en `catch`→`failFromError`, que no chequea `isRedirect` y loguea antes de re-lanzar. PRE-EXISTENTE
      (archivo no modificado en el working tree). La navegación funciona (el redirect se re-propaga).
      Ruido de log, no falla funcional. Follow-up aceptable.

## Cambios requeridos

Ninguno bloqueante.

## Follow-ups recomendados (fuera de #23, no bloquean Fase 4)

1. `failFromError` debería chequear `isRedirect(e)` y re-lanzar el redirect sin loguear
   `action_unhandled_error`. Afecta a todas las acciones que redirigen dentro del `try`.
2. Estabilizar `e2e/mercado.spec.ts`: usar `.first()` o un selector único (p.ej. `data-testid` en el
   nav del header) en vez de `nav a[href="/mercado"]`, que matchea el nav duplicado responsive.

## Recomendación

**Avanzar a Fase 4.** Fase 3 cumple su Gate: crear auditoría desde el form clásico funciona
end-to-end contra `empresa`, sin lecturas calientes de la vista, FK válida, `check`/`build`/suite
dirigida verdes. Los 2 desvíos son pre-existentes y ajenos a Fase 3; quedan como follow-up.
