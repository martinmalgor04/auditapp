# Implementación — #59 59_escaneo_modelo_datos

> Implementer: sesión 2026-08-27. Spec: `specs/59_escaneo_modelo_datos/`
> (aprobado en puerta humana 2026-08-27). Rama: `cursor/59-escaneo-modelo-datos-8007`.

## Archivos

| Archivo | Cambio |
|---|---|
| `migrations/030_escaneo_modelo_datos.sql` | Nuevo. SQL copiado TAL CUAL del design §Esquema (4 tablas, CHECKs, UNIQUEs, FKs, índices; idempotente). |
| `src/lib/server/escaneos/schemas.ts` | Nuevo. Enums Zod, `macNormalizada`, inputs, `identidadDispositivo`, `TRANSICIONES`. |
| `src/lib/server/escaneos/errors.ts` | Nuevo. Errores tipados; reusa `AuditNotFoundError` de backoffice (design §Errores). |
| `src/lib/server/escaneos/repo.ts` | Nuevo. Las 9 funciones del design, SQL puro parametrizado, scope empresa vía join con `audit` en cada una (salvo `escaneosColgados`, job de sistema R7). |
| `tests/escaneos.test.ts` | Nuevo. 14 casos del design §Tests contra Postgres real. |

## Mapa de trazabilidad R ↔ test

Tests en `tests/escaneos.test.ts` (nombres abreviados). Cada R tiene al menos
un test; cada test declara sus R en el nombre.

| R | Test(s) que lo cubren |
|---|---|
| R1 | happy path (escaneo asociado a auditoría de la empresa; empresa ajena → AUDIT_NOT_FOUND) |
| R2 | happy path (rango, técnico, versión de agente, created_at persistidos) |
| R3 | sin consentimiento (estado inicial `pendiente`); transición inválida (CHECK `escaneo_estado_check` rechaza estado fuera del conjunto vía SQL directo) |
| R4 | upsert sobre completado (ESCANEO_NO_MUTABLE, cero escrituras) |
| R5 | cascada (DELETE audit → 0 filas en las 4 tablas) |
| R6 | happy path (dos escaneos en la misma auditoría, ambos listados) |
| R7 | escaneosColgados (solo >24h en `en_curso`/`sincronizando`; `pendiente` viejo excluido) |
| R8 | sin consentimiento (transición a `en_curso` → CONSENTIMIENTO_FALTANTE; tras `registrarConsentimiento`, permitida) |
| R9 | sin consentimiento (UPDATE directo a `en_curso` sin consentimiento → viola `escaneo_consentimiento_ck`) |
| R10 | transición inválida (`pendiente→completado`, `sincronizando→en_curso`, terminal→`en_curso`; sin mutar) |
| R11 | happy path (dispositivo con `escaneo_id` correcto) |
| R12 | mismo dispositivo (identidad = MAC normalizada; sin MAC → identidad = IP) |
| R13 | mismo dispositivo (reenvío actualiza, total no crece); concurrencia (dos upserts simultáneos, sin duplicados) |
| R14 | raw GIN (`raw` persiste igual al payload y responde a `raw @>`) |
| R15 | MAC (separadores/mayúsculas → 12 hex minúsculas; inválida → rechazo Zod; CHECK `escaneo_dispositivo_mac_ck` vía SQL directo) |
| R16 | happy path (tipo `servidor` persiste; tipo `tablet` → rechazo Zod) |
| R17 | happy path (campos omitidos → NULL en DB, sin defaults sintéticos) |
| R18 | NULL conserva (hostname/so_nombre/fabricante/tipo prevalecen; modelo nuevo sí actualiza) |
| R19 | happy path (software con `dispositivo_id` correcto) |
| R20 | mismo dispositivo (software idéntico reenviado → 1 sola fila) |
| R21 | happy path (servicio con puerto/protocolo/estado) |
| R22 | mismo dispositivo (mismo puerto/protocolo → actualiza estado y versión, 1 fila) |
| R23 | marcarRevision (default `sin_revisar`, sin revisor) |
| R24 | marcarRevision (registra quién/cuándo; CHECK `escaneo_dispositivo_revision_ck` impide revisión sin revisor vía SQL directo) |
| R25 | happy path (lectura expone `revision`); marcarRevision (filtro por revisión en `listarDispositivos`) |
| R26 | happy path (`listarEscaneosDeAuditoria` con empresa ajena → `[]`; `obtenerEscaneo` ajeno → ESCANEO_NOT_FOUND) |
| R27 | empresaId ajeno (upsert → ESCANEO_NO_MUTABLE, cero escrituras); marcarRevision con empresa ajena → ESCANEO_NOT_FOUND |
| R28 | happy path (conteo tras chunk); dispositivos_detectados (2 → 3 → 3 tras reenvío) |

## Desviaciones del design (con justificación)

1. **Lista de columnas completa en los INSERT de `upsertDispositivos`.** El
   snippet del design está abreviado (omite `fqdn`, `so_arquitectura`,
   `cpu_descripcion`, `disco_total_gb`, `banner`, `instalado_at`). Se
   persisten TODOS los campos del schema Zod: R17 exige persistir lo que el
   agente provee y NULL cuando no.
2. **COALESCE extendido a todos los campos descriptivos anulables** en el
   `ON CONFLICT` de dispositivo (el design listaba 3 como ejemplo). Es la
   aplicación uniforme del patrón R18 documentado en el design ("NULL
   entrante = no lo sé"). Se agrega guard para `tipo`: el default
   `'desconocido'` del schema no pisa un tipo ya conocido (misma semántica
   "no lo sé"; comentado en código).
3. **`tx.json(...)` explícito** para columnas `jsonb` dentro del helper
   `tx({...})` (el snippet del design pasa el objeto crudo). El runtime de
   postgres.js resuelve ambos, pero sus tipos TS exigen `Parameter` para
   jsonb; es además la convención del repo (`sql.json(value as never)`).
4. **`obtenerEscaneo` devuelve la fila + `metricas`** (conteos de software,
   servicios y breakdown por revisión): implementa "Detalle + métricas" del
   design §Funciones restantes.
5. **`listarDispositivos` devuelve `{ items, total }`** con
   `limit` máximo 500 y orden `created_at, id`: paginado completo para #62.
6. **`marcarRevision` a `sin_revisar` limpia `revisado_por`/`revisado_at`**:
   coherente con R24 y con el CHECK (que solo exige revisor fuera de
   `sin_revisar`).
7. **`escaneosColgados` usa `updated_at`** como proxy de última actividad
   (cada chunk la toca vía `upsertDispositivos`); comentado en código.
8. **`fallido` sin `errorDetalle` → `ValidationError`** (reusada de
   backoffice) antes de tocar la DB; el CHECK `escaneo_error_ck` queda como
   segunda línea. El design no tipaba este caso.

## Limitación conocida del schema aprobado (no se modifica: SQL TAL CUAL)

- `escaneo_software_uq UNIQUE (dispositivo_id, nombre, version)` no deduplica
  cuando `version IS NULL` (Postgres trata NULLs como distintos). R20 se
  verifica con versión no-NULL. Si el agente reporta software sin versión con
  frecuencia, evaluar `NULLS NOT DISTINCT` (PG15+) en una migración futura.

## Notas de verificación

- Concurrencia (R13): el cliente de DB del repo es `max: 1` (postgres.js), así
  que los dos `upsertDispositivos` se serializan a nivel driver en el mismo
  proceso; el `FOR UPDATE` se ejerce en cada transacción y queda como defensa
  multi-proceso. El test verifica el criterio de aceptación: sin duplicados,
  sin deadlock, conteo correcto.
- Entorno VM: Docker no disponible → Postgres 16 instalado vía apt; rol/DB
  `auditapp` según `.env.example`; migración 030 aplicada con
  `scripts/db-migrate.ts` y re-corrida verificada no-op (`applied: []`).
- `pnpm test` completo: 1536 passed / 14 failed — las 14 fallas son
  PREEXISTENTES en master (verificado con `git stash -u`: mismas 14 en
  `tests/informe-manual.test.ts` ×8, `tests/api/report-html-download.test.ts`
  ×5, `tests/api/audit-crud.test.ts` ×1; la causa raíz de informe-manual es
  `audit.client_id`, columna renombrada en la migración 015).
- `pnpm run check`: 7 errores, todos preexistentes en
  `tests/informe-manual.test.ts` (prop `version`). Cero errores nuevos.
- `pnpm run build`: verde.
- El hook `afterFileEdit` del harness (`.cursor/hooks.json`) lanza
  `pnpm test` por edición; sus corridas zombie se mataron durante la sesión
  (mismo problema documentado en la sesión mobile 2026-08-11).
