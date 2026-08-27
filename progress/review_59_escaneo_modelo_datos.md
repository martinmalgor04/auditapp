# Review — feature #59 59_escaneo_modelo_datos

**Veredicto:** APPROVED (re-review 2, tras corrección del blocker B1)
**Rama revisada:** `origin/cursor/59-escaneo-modelo-datos-8007` @ `390e8ec` contra `master`. Sin checkout ni merge; ejecución en worktree temporal + Postgres 16 aislado (puerto 5433), ambos eliminados al terminar.

> Historial: Review 1 (HEAD `eacb8f3`) = CHANGES_REQUESTED por un blocker
> (B1 — R20 violado con `version IS NULL`). El implementer corrigió en dos
> commits (`acf9db9` fix, `390e8ec` docs). Este veredicto reemplaza al anterior.

## Verificación del fix B1 (diff `eacb8f3..390e8ec`)

Scope del fix: solo `migrations/030_escaneo_modelo_datos.sql`,
`tests/escaneos.test.ts` y los dos docs de progreso. **Nada fuera de scope**:
`.gitignore`, `src/lib/server/db/client.ts` y demás archivos intactos.

1. **Migración (in-place, no mergeada a ningún ambiente):**
   `CONSTRAINT escaneo_software_uq UNIQUE NULLS NOT DISTINCT (dispositivo_id, nombre, version)`
   con comentario que cita R20. Verificado en la DB real:
   `pg_get_constraintdef` → `UNIQUE NULLS NOT DISTINCT (...)`.
   `escaneo_servicio_uq` sin cambios (correcto: `puerto`/`protocolo` NOT NULL).
2. **Test 15° (`software sin versión reenviado se ignora`, R20):** cubre ambos
   niveles — dos chunks vía repo con `version: null` → 1 fila (dedup a nivel
   app vía `ON CONFLICT`), e INSERT directo duplicado → viola
   `escaneo_software_uq` (garantía DB sin `ON CONFLICT`).
3. **Assertion flaky `created_at`:** ahora con tolerancia de 2 s y cota
   superior. 3 corridas standalone del suite: **15/15 verdes en las 3** (antes
   fallaba 2/3 en este entorno por clock skew de 1 ms).
4. **Confirmación empírica independiente del reviewer (PG16):** 3 inserciones
   idénticas con NULL vía `ON CONFLICT` → `INSERT 0 1` + `0 0` + `0 0` (1 fila);
   INSERT directo duplicado → `duplicate key value violates unique constraint
   "escaneo_software_uq"` con `version=null`; `(NULL)` y `('11.0')` coexisten
   como filas distintas. Idéntico a lo reportado por el implementer.
5. **Docs:** la sección "Limitación conocida" se reemplazó por "Corrección
   post-review"; el mapa R↔test de R20 incluye el caso NULL; `current.md`
   refleja el estado de re-review.

## Trazabilidad (28/28 R con test, R20 ahora con cobertura completa)

Tests en `tests/escaneos.test.ts` (15 casos). Cada R tiene al menos un test:

- R1, R2, R6, R11, R16, R17, R19, R21, R25, R26, R28: [x] happy path
- R3, R8, R9: [x] sin consentimiento (app + CHECK `escaneo_consentimiento_ck`)
- R12, R13, R22: [x] mismo dispositivo / concurrencia
- R20: [x] mismo dispositivo (versión no-NULL) + **test 15° (versión NULL,
  app y DB)** — el hueco del review 1 quedó cerrado
- R4: [x] upsert sobre completado · R5: [x] cascada · R7: [x] escaneosColgados
- R10: [x] transición inválida sin mutar · R14: [x] raw + GIN · R15: [x] MAC
- R18: [x] NULL conserva previo · R23/R24/R25: [x] marcarRevision + CHECK
- R27: [x] empresaId ajeno en upsert y marcarRevision

## Tasks

- T1–T8: [x] todas marcadas y verificadas (migración aplicada + re-corrida
  no-op verificada por el reviewer en ambos reviews).

## Checkpoints

- C1: [x] arnés completo (`init.sh` rojo por causas preexistentes ajenas al
  diff — ver observaciones 2 y 3 del review 1, sin cambios)
- C2: [x] una sola `in_progress`; `current.md` de sesión activa
- C3: [x] SQL parametrizado en todo (postgres.js), sin ORM, sin `console.log`
  ni secretos en lo nuevo
- C4: [x] tests cubren las funciones públicas del módulo, incluido R20/NULL
- C5: [x] `history.md` con entrada
- C6: [x] spec EARS completo, tasks `[x]`, cobertura R↔test 28/28 efectiva

## Evidencia de gates (re-review, corrida por el reviewer en worktree + PG16)

- `pnpm exec vitest run tests/escaneos.test.ts`: **15/15 verdes × 3 corridas
  standalone** (coincide con el claim del implementer).
- `pnpm run check`: 7 errores, todos preexistentes en
  `tests/informe-manual.test.ts` (prop `version`, archivo no tocado por el
  diff). Cero errores nuevos.
- Suite completa: no re-corrida en este re-review (8.5 min); justificación: el
  delta respecto del review 1 toca únicamente la migración 030 y el test de la
  propia feature (diff 100% acotado, verificado), y en el review 1 se verificó
  1536/14 con las 14 fallas preexistentes por construcción. Claim del
  implementer (1537/14 = +1 test nuevo) es consistente con esa base.
- `pnpm run build`: verde en review 1; el delta no toca código de app ni config
  (solo SQL + test + docs), sin riesgo de regresión de build.
- Migración 030 con la constraint nueva: aplicada desde cero en DB limpia y
  verificada con `pg_get_constraintdef`.

## Observaciones menores vigentes (no bloquean; heredadas del review 1)

1. ~~Assertion `created_at` frágil~~ → **corregida** (tolerancia 2 s).
2. Harness (preexistente, no es de #59): `.gitignore` línea 13 (`specs/07*/`)
   hace que la carpeta EARS de la feature 07 no sea commiteable → `init.sh`
   sección 3 roja en clones frescos. Tarea de mantenimiento aparte.
3. Preexistente en master: `console.log('DBG getSql ...')` en
   `src/lib/server/db/client.ts` (viene de #48) viola C3. Limpieza aparte.
4. Las 14 fallas de tests preexistentes (`informe-manual` ×8,
   `report-html-download` ×5, `audit-crud` ×1) siguen intactas — el diff no
   las toca. Conviene feature de mantenimiento (usa `audit.client_id`,
   renombrada en migración 015).

## Verificado además (sin hallazgos, review 1 — reconfirmado el scope en review 2)

- Scope `empresaId` vía join con `audit` en las 8 funciones exportadas; única
  excepción `escaneosColgados` (job de sistema R7, documentada en spec).
- `TRANSICIONES` idéntica al design; consentimiento exigido para `en_curso`
  en app (R8) y en DB (R9); estados terminales no reabren.
- `FOR UPDATE OF e` en `upsertDispositivos` y `cambiarEstadoEscaneo`;
  `dispositivos_detectados` actualizado en la misma transacción (R28).
- COALESCE uniforme con guard de `tipo` (semántica R17/R18); errores de
  dominio tipados sin stack traces; convenciones de nombres/imports/comentarios.
