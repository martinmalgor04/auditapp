# Review — feature 62 `62_escaneo_revision_ui`

**Veredicto:** APROBADO

- Rama revisada: `cursor/62-escaneo-revision-ui-impl-199b` (commit `319ce85`).
- Spec: `specs/62_escaneo_revision_ui/` con puerta humana 2026-08-30 sellada
  (OQ1=A fusión solo vínculo, OQ2=B revisión post-cierre permitida + R32,
  OQ3=A consolidado con todos los escaneos con dispositivos).
- Reviewer: sesión 2026-08-31, VM cloud (Postgres 16 vía apt, sin Docker).
- Toda la evidencia de gates se produjo con el árbol quieto (sin ediciones
  concurrentes; lección del incidente de #60/#62 respetada).

## Blockers

Ninguno.

## Cobertura de trazabilidad: 32/32

| R | Test(s) |
|---|---|
| R1 | `escaneos-revision-routes.test.ts › el detalle de auditoría enlaza a /escaneos` · e2e (click en `link-escaneos`) |
| R2 | `…routes › guards: sin sesión → 303 /login; técnico no asignado → 403; admin y asignado → 200` |
| R3 | mismo test (403 en lista, detalle y action `marcar`; fuera de scope de tipo → 404 vía `getAuditById`) |
| R4 | `…routes › auditoría cerrada: revisión permitida (R4); crear escaneo y tokens → 409 (R32)` |
| R5 | `…routes › action crearEscaneo → escaneo pendiente con el técnico de la sesión` |
| R6 | `…routes › action emitirToken → claro una vez + expiración; DB guarda solo hash` |
| R7 | `…routes › action revocarToken → el token deja de resolver de inmediato` |
| R8 | `…routes › load lista escaneos con estado, rango, conteo y token activo` · `escaneos-consolidado › listarEscaneosParaUi…` |
| R9 | `escaneos-consolidado › misma MAC en 2 escaneos → 1 dispositivo…` · `› misma MAC en otra auditoría NO se deduplica` |
| R10 | `escaneos-consolidado › misma MAC en 2 escaneos…` · `› consolidado incluye dispositivos de escaneos fallidos/cancelados (OQ3)` · e2e (chips ambas VLAN) |
| R11 | `escaneos-consolidado › precedencia por campo…` |
| R12 | `escaneos-consolidado › tipo 'desconocido' reciente no pisa un tipo conocido anterior` |
| R13 | `escaneos-consolidado › revisión efectiva: confirmado viejo + ocurrencia nueva…` |
| R14 | mismo test (la ocurrencia nueva `sin_revisar` no revierte la decisión) |
| R15 | `escaneos-consolidado › grupo sin MAC → identidadPorIp = true` · badge `identidad-debil-badge` en cards/tabla/detalle |
| R16 | `escaneos-consolidado › filtros por tipo, revisión efectiva y escaneo de origen, con paginación` |
| R17 | `escaneos-consolidado › contadores por revisión efectiva…` · `…routes › load lista escaneos…` |
| R18 | `escaneos-consolidado › detalle: software/servicios de la ocurrencia canónica y raw…` · e2e (`detalle-software`, `origen-canonico`) |
| R19 | mismo test de detalle (`ocurrenciasRaw` idéntico al payload insertado) · e2e (2 `raw-json-details`) |
| R20 | `escaneos-revision › marcarRevisionGrupo confirmado → todas las ocurrencias…` · `…routes › action marcar desde la lista aplica la revisión al grupo completo` · e2e (badge cambia) |
| R21 | `escaneos-revision › fusionarDispositivo → vínculo + fusionado…` · `› marcarRevisionGrupo con 'fusionado' → ValidationError` · `› CHECK de paridad…` · `…routes › fusión desde el detalle vincula sin tocar audit_response` · e2e |
| R22 | `escaneos-revision › fusión con destino inválido → VINCULO_RELEVAMIENTO_INVALIDO sin mutar nada` (ítem inexistente / no-tabla / otra plantilla / row ausente) |
| R23 | `escaneos-revision › la fusión NO escribe audit_response…` (value idéntico antes/después de fusionar y desvincular) · `…routes › fusión desde el detalle…` · verificación estática: grep sin INSERT/UPDATE/DELETE sobre `audit_response` en todo el código de #62 |
| R24 | `escaneos-revision › desvincularDispositivo → vínculo NULL y sin_revisar…` · `…routes › fusión desde el detalle…` (tramo desvincular) |
| R25 | `escaneos-revision › vínculo roto: se borra la fila del jsonb → vivo = false` (incluye re-vinculación) · bloque `vinculo-roto` en `dispositivos/[identidad]/+page.svelte` |
| R26 | `escaneos-revision › revertir a sin_revisar limpia revisor y fecha en el grupo` |
| R27 | Estructural: las 5 funciones nuevas de `consolidado.ts` y las 3 de `revision.ts` reciben `empresaId` primero y lo aplican en la misma query vía join `escaneo → audit`; cubierto por los tests de empresa ajena |
| R28 | `escaneos-consolidado › empresaId ajeno → lista vacía, contadores en cero y detalle not found` · `escaneos-revision › marcarRevisionGrupo…` (tramo empresa ajena) · `› fusión con destino inválido…` (tramo empresa ajena) |
| R29 | `…routes › error de dominio en action → fail() con mensaje legible, sin stack` (la respuesta serializada no contiene `stack` ni `SELECT`) |
| R30 | `…routes › markup: cards lg:hidden + tabla hidden lg:block…` |
| R31 | mismo test de markup (`--sys-touch-min` en cards/tabla/lista/raw-details; SysButton lo incorpora; badges con tokens `--sys-*` en `escaneo-view.ts`) |
| R32 | `…routes › auditoría cerrada: revisión permitida (R4); crear escaneo y tokens → 409 (R32)` |

## Tasks

T1–T16: todas `[x]` en `specs/62_escaneo_revision_ui/tasks.md` (verificado por
lectura directa; el diff de la rama sobre `tasks.md` es solo el marcado de
checkboxes, 16+/16-).

## Puntos críticos (resultado uno por uno)

1. **Read-model consolidado (`consolidado.ts`)** — ✓ Conforme. Dedup por
   `identidad` con `GROUP BY` (línea 249); precedencia `visto_at DESC NULLS
   LAST, updated_at DESC, id` (188-190); relleno de huecos por campo con
   `ARRAY_AGG … FILTER (WHERE … IS NOT NULL))[1]` (201-219); `tipo` salta
   `desconocido` con COALESCE (208-211); provenance incluye `escaneoEstado`
   vía `jsonb_agg` (238-247) y **no hay filtro de estado del escaneo** (OQ3:
   entran `fallido`/`cancelado`; test dedicado); `empresaId` en la misma
   query (194). Sin vista SQL ni tabla derivada. Orden `sin_revisar` primero,
   luego `ip`/`identidad`.
2. **Revisión por identidad, no por ocurrencia** — ✓ Conforme. Las 3
   mutaciones de `revision.ts` escriben sobre `WHERE d.identidad = …` con
   scope `EXISTS (escaneo → audit → empresa)`; la revisión efectiva en
   lectura es la más reciente ≠ `sin_revisar` por `revisado_at` (221-229 de
   `consolidado.ts`), de modo que una ocurrencia nueva no revierte la
   decisión humana (test R13/R14 lo prueba con 2 escaneos).
3. **R4/R32 (puerta 2026-08-30, OQ2 opción B)** — ✓ Conforme, verificado en
   código y test. Ninguna action de revisión (`marcar`, `confirmar`,
   `descartar`, `volverASinRevisar`, `fusionar`, `desvincular`) tiene guard
   de `cerrada`; `crearEscaneo`/`emitirToken`/`revocarToken` responden
   `fail(409)` con `cerrada` (`escaneos/+page.server.ts:153, 183, 208`). El
   test de rutas ejercita los dos lados sobre la misma auditoría cerrada.
   **No hay bloqueo de revisión con cerrada** (lo que sería blocker).
4. **Vinculación (migración 032)** — ✓ Conforme. Dos columnas + CHECK de
   paridad con guard `pg_constraint` + índice parcial; idempotente (re-run
   del runner: skipped). Validación del destino vía jsonb en la misma tx
   (`revision.ts:77-90`); `audit_response` jamás escrito (grep: solo JOINs
   de lectura en `consolidado.ts:378,514` y `revision.ts:81`); vínculo roto
   (R25) resuelto en lectura (`resolverVinculo`, `vivo=false`).
5. **Acceso** — ✓ Conforme. Load y actions con `requireStaff` +
   `getAuditById` (404 si fuera de scope de tipo, patrón del detalle de
   auditoría) + `techIsAssigned` (403 sin datos si no asignado); action
   `marcar` del no-asignado devuelve 403 sin ejecutar la mutación (test).
   `empresaId` presente en las 8 funciones nuevas del repo.
6. **Token en UI** — ✓ Conforme. El claro viaja una sola vez en la respuesta
   de `emitirToken` (`{ success, token, expiresAt }`); la DB guarda solo
   hash (test: `token_hash = hashToken(token)` y `≠ token`); los loads
   posteriores exponen solo `tokenActivo`/`tokenExpiresAt`;
   `escaneo-token-panel.svelte` avisa la única muestra.
7. **UI** — ✓ Conforme. Cards `lg:hidden` / tabla `hidden lg:block` (patrón
   CRM) en ambas secciones; todas las mutaciones son form actions
   server-side — grep confirma **cero `fetch(`/referencias a
   `/api/escaneos`** en las rutas y componentes nuevos; targets
   `min-h-[var(--sys-touch-min)]`; estados vacíos explícitos (`Sin escaneos
   todavía — creá el primero`, `Sin dispositivos para los filtros
   aplicados`); español rioplatense (`Copialo`, `No tenés permiso`);
   branding `--sys-*` en badges y componentes.
8. **Migración 032** — ✓ Conforme. Idempotente (`IF NOT EXISTS` + guard DO);
   solo toca `escaneo_dispositivo` (2 columnas + CHECK + índice); verificado
   aplicada en la DB de review y skipped en re-run.

## Desviaciones declaradas (evaluación)

1. **`fail-from-error.ts` no listado en el design — ACEPTADA.** Verificado en
   `src/lib/server/backoffice/route-helpers.ts:33-42`: `failFromError` solo
   mapea `BackofficeError`/`AuthError` y **relanza** cualquier otro error
   (→ 500). Las clases de `escaneos/errors.ts` (#59) son `Error` planas, así
   que sin el helper las acciones de #62 responderían 500 sin mensaje,
   violando R29. El helper es aditivo, no toca #59, y es el análogo de
   `mapErrorEscaneo` de #60 para form actions. Test R29 lo cubre.
2. **Tensión FK `ON DELETE SET NULL` vs CHECK de paridad — ACEPTADA.**
   Verificado empíricamente en esta VM (transacción con rollback): borrar un
   `template_item` vinculado se rechaza con violación del CHECK
   `escaneo_dispositivo_vinculo_ck` (SQLSTATE 23514), no con la FK — el
   SET NULL rompería la paridad. Comportamiento seguro (no queda `row_id`
   huérfano) e inalcanzable en la práctica: la única poda de ítems
   (`src/lib/server/db/seed/templates.ts:190`) exige `NOT EXISTS
   audit_response`, y toda fusión exige una response con la fila (R22).
   Implementa el spec al pie (T1) y queda documentada en el impl.
3. **404 vs 403 por scope de tipo (R3) — ACEPTADA.** `getAuditById(id, user)`
   devuelve null para técnico fuera de scope de tipo → 404 en load (no
   revela existencia, igual que el detalle de auditoría); técnico en scope
   no asignado → 403 vía `techIsAssigned`. Ambas ramas testeadas. (Ver
   observación menor 3 sobre el orden en actions.)

## Evidencia de gates (corridos por el reviewer en esta VM)

| Gate | Resultado | Detalle |
|---|---|---|
| `vitest run` 3 archivos nuevos | **33/33 ✓** | consolidado 12 + revision 10 + routes 11 |
| `pnpm test` (suite completa, dentro de `./init.sh`, con build presente) | **1599 passed / 14 failed / 2 skipped** (1615; 273 archivos) | 1599 = 1566 (medido en review de #60) + 33 nuevos, exacto |
| Baseline de master (worktree `master` limpio, misma VM, mismos 3 archivos) | **14 failed idénticas** | `tests/informe-manual.test.ts` ×8, `tests/api/report-html-download.test.ts` ×5, `tests/api/audit-crud.test.ts` ×1 — mismos nombres de test en rama y master → **cero fallas nuevas** |
| `pnpm run check` (rama) | **7 errores, todos en `tests/informe-manual.test.ts`** | master (misma VM): 7 errores idénticos → cero nuevos |
| `pnpm run build` | **✓ verde** | adapter-node, sin warnings nuevos relevantes |
| `playwright test e2e/escaneos-revision.spec.ts` | **1/1 ✓** (chromium headless) | flujo feliz R1/R20/R21 con seed propio |
| Migración 032 | **idempotente** | aplicada por el runner; re-run → skipped; guards `IF NOT EXISTS` |
| `./init.sh` | **rojo solo por baseline preexistente** | sección 3: feature 7 `done`+`sdd` sin `specs/07_form_tecnico/` (así en master, verificado); sección 4: las 14 fallas baseline de arriba. Secciones 1-2 verdes. Mismo criterio que `progress/review_60_escaneo_ingesta_api.md` (aprobada con idéntica situación) |

Nota de reconciliación: mi primera corrida de `pnpm test` dio 1596 passed /
5 skipped porque aún no existía build (`pwa-prod.test.ts` salta 3 tests sin
`build/manifest.webmanifest`) y Docker no está disponible en la VM
(`docker.test.ts` salta 2). Con build presente (corrida dentro de
`./init.sh`): **1599/14/2 exacto**, como reporta el implementer. Los 33
tests nuevos corren y pasan en ambas corridas.

## Checkpoints

- **C1** — Arnés completo ✓ (todos los archivos base presentes).
  `./init.sh` no termina en 0 por causas preexistentes de master (feature 7
  sin spec + 14 fallas baseline), verificado en worktree master limpio de
  esta misma VM. No introducido por #62.
- **C2** — ✓ Una sola feature `in_progress` (la 62); `progress/current.md`
  describe la sesión del implementer; `feature_list.json` válido (la rama no
  marca `done`: corresponde al leader tras este review).
- **C3** — ✓ SQL 100 % parametrizado (postgres.js) en los módulos nuevos;
  sin ORM; sin `console.log`/debug/TODO en el código de la feature (grep);
  sin secretos en código; cookies/auth sin cambios.
- **C4** — ✓ 33 tests nuevos contra Postgres real (sin mocks del query
  layer) cubriendo las funciones públicas nuevas; e2e del flujo crítico con
  seed propio (`e2e/ensure-escaneos-audit.ts`); trazabilidad 32/32.
- **C5** — ✓ Árbol limpio (`git status` vacío); 28 archivos en el diff,
  todos declarados en `progress/impl_62_escaneo_revision_ui.md`; la única
  modificación a página existente es el enlace R1 (+6 líneas en
  `auditorias/[id]/+page.svelte`).
- **C6** — ✓ Spec EARS completo con puerta sellada; tasks T1–T16 `[x]`;
  cada `R<n>` con al menos un test.

## Observaciones menores (no bloquean)

1. Varias líneas >100 chars en archivos nuevos, casi todas clases Tailwind
   en `.svelte` (peor caso: `consolidado-tabla.svelte:79`, 182). La
   convención (máx 100) ya se relaja de facto en el código aprobado — la
   página madre tiene 18 líneas >100 y `SysButton.svelte` 3. Consistente con
   el repo; `svelte-check` no agrega errores.
2. El botón "Re-vincular" del detalle se muestra también con el vínculo vivo
   (R25 solo exige ofrecerlo cuando está roto). Es una mejora de UX
   inofensiva: re-vincular es legítimo en cualquier momento.
3. En las actions, `assertAdminOrAssigned` corre antes que `getAuditById`,
   así que un técnico fuera de scope de tipo recibe 403 ("Auditoría no
   encontrada") en actions vs 404 en load. Fail-closed en ambos caminos, sin
   fuga de datos; inconsistencia cosmética de status, consistente con la
   desviación ③ documentada.
4. `revisadoPorNombre` se resuelve con un join chico a `app_user` en el load
   del detalle (desviación 4 del impl, no estaba en el design). No cambia el
   contrato del read-model; razonable.

## Recomendación al leader

Aprobar el merge de `cursor/62-escaneo-revision-ui-impl-199b`, marcar la
feature `done` en `feature_list.json` y mover el resumen a
`progress/history.md` conforme al lifecycle (§5 de AGENTS.md). La baseline
roja de master (14 tests + feature 7 sin spec) es deuda preexistente —
candidata a una feature de saneamiento aparte para que `./init.sh` vuelva a
ser un gate verde absoluto.
