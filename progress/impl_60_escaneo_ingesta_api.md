# Implementación — #60 60_escaneo_ingesta_api

> Implementer: sesión 2026-08-27. Spec: `specs/60_escaneo_ingesta_api/`
> (aprobado en puerta humana 2026-08-27). Rama: `cursor/60-escaneo-ingesta-api-0ebf`.
> Consume #59 (ya mergeada en master) sin modificarla.

## Archivos

| Archivo | Cambio |
|---|---|
| `migrations/031_escaneo_token.sql` | Nuevo. Tabla `escaneo_token` con CHECKs (hash 64 hex, TTL positivo), índice único por hash e índice parcial de un solo token activo por escaneo. Idempotente; re-corrida verificada no-op (`applied: []`). |
| `src/lib/server/escaneos/api.ts` | Nuevo. `ESCANEO_TOKEN_TTL_HORAS=12`, `AGENTE_MAJOR_SOPORTADO=1`, `resolverAmbitoEscaneo`, `resolverEmpresaDeAuditoria`, `emitirTokenEscaneo` (rotación en tx), `revocarTokenEscaneo` (idempotente), `resolverTokenEscaneo`, `registrarAgente` (R21), `obtenerContextoEscaneo` (R11). |
| `src/lib/server/escaneos/http.ts` | Nuevo. `chunkDispositivosInput` (1–100, schemas #59), `cambiarEstadoInput`, helpers `X-Agente-Version`/`X-Agente-Hostname` (semver + major), `mapErrorEscaneo` (dominio → envelope). |
| `src/lib/server/escaneos/jobs.ts` | Nuevo. `marcarColgadosFallidos()` compone `escaneosColgados` + `resolverAmbitoEscaneo` + `cambiarEstadoEscaneo` de #59. |
| `src/lib/server/api/require-escaneo-token.ts` | Nuevo. Guard Bearer → `(escaneoId, empresaId)` del token; 401 genérico, 404 en mismatch path↔token, log categorizado sin token (R30) + conteo por IP (R25). |
| `src/lib/server/api/require-system-token.ts` | Nuevo. Bearer por env `ESCANEO_SYSTEM_TOKEN`, `timingSafeEqual`, fail-closed (patrón `require-crm-token.ts`). |
| `src/lib/server/api/require-agente-escaneo.ts` | Nuevo. Preludio compartido de endpoints del agente: rate limit por token antes de DB + guard + versión (R19/R20) + `registrarAgente` (R21). |
| `src/lib/server/api/escaneo-rate-limit.ts` | Nuevo. Tres limitadores Map + prune throttled (30/min ingesta, 60/min resto, 10 fallos auth/min por IP), flag `ESCANEO_RATE_LIMIT_DISABLED`, reset para tests. |
| `src/routes/api/escaneos/+server.ts` | Nuevo. `POST` crear escaneo (sesión staff, admin o `techIsAssigned`). |
| `src/routes/api/escaneos/[escaneoId]/+server.ts` | Nuevo. `GET` estado + contexto empresa/auditoría (token). |
| `src/routes/api/escaneos/[escaneoId]/token/+server.ts` | Nuevo. `POST` emitir (rotación) / `DELETE` revocar (idempotente), sesión staff. |
| `src/routes/api/escaneos/[escaneoId]/consentimiento/+server.ts` | Nuevo. `POST` consentimiento (token). |
| `src/routes/api/escaneos/[escaneoId]/dispositivos/+server.ts` | Nuevo. `POST` chunk (token; 2 MB pre-parse, rate limit ingesta). |
| `src/routes/api/escaneos/[escaneoId]/estado/+server.ts` | Nuevo. `POST` transición (token; TRANSICIONES + consentimiento de #59). |
| `src/routes/api/system/escaneos-colgados/+server.ts` | Nuevo. `POST` job de colgados (token de sistema + rate limit por IP). |
| `tests/api/escaneos-token.test.ts` | Nuevo. 8 tests: emisión, rotación, revocación, expiración, guards staff, creación. |
| `tests/api/escaneos-ingesta.test.ts` | Nuevo. 7 tests: chunk feliz, idempotencia, límites, rate limits, mismatch path. |
| `tests/api/escaneos-estado.test.ts` | Nuevo. 11 tests: GET estado, terminal, consentimiento, transiciones, versión, 500 genérico, logs sin token. |
| `tests/api/escaneos-colgados.test.ts` | Nuevo. 3 tests: 401/fail-closed, marcado >24 h, idempotencia del job. |
| `docs/deploy-dokploy.md` | Sección nueva: `ESCANEO_SYSTEM_TOKEN` + cron horario externo del job. |
| `.env.example` | Entrada `ESCANEO_SYSTEM_TOKEN` (convención `CRM_API_TOKEN`). |

## Mapa de trazabilidad R ↔ test

Tests en `tests/api/escaneos-*.test.ts` (nombres abreviados), contra Postgres
real con handlers importados directamente. Cada R tiene al menos un test.

| R | Test(s) que lo cubren |
|---|---|
| R1 | token › emisión admin/técnico (256 bits base64url; DB guarda hash de 64 hex = SHA-256 del claro, nunca el claro) |
| R2 | token › emisión (TTL efectivo ≤ 12 h; CHECK `escaneo_token_ttl_ck` confirmado al rechazar el primer fixture de expirado) |
| R3 | token › rotación (2° POST revoca el 1° en la misma operación: viejo 401, nuevo 200, un solo activo, historial de 2 filas) |
| R4 | token › revocación (DELETE → 401 inmediato al usar; fila conservada con `revoked_at`; DELETE repetido → 200 idempotente) |
| R5 | token › emisión (el claro solo viaja en la respuesta de emisión: GET estado no lo contiene y en DB no aparece) |
| R6 | token › guards staff (401 sin sesión, 403 técnico no asignado, 404 escaneo inexistente, 200 admin y técnico asignado, sin mutar en los rechazos); token › POST /api/escaneos guards |
| R7 | token › expirado (401 con body idéntico al de token inexistente); rotación/revocación (el token viejo/revocado da el mismo 401) |
| R8 | Estructural + happy paths: todo endpoint del agente pasa por `requireEscaneoToken`, que resuelve `(escaneoId, empresaId)` del token y los pasa al repo (los happy paths de ingesta/estado/consentimiento funcionan solo con el ámbito del token; R9 prueba el rechazo cruzado) |
| R9 | ingesta › mismatch path↔token (404 con body idéntico a escaneo inexistente; el token sigue válido sobre su propio escaneo) |
| R10 | estado › terminal (GET 200 en `completado`; POST estado/consentimiento/dispositivos → 409) |
| R11 | estado › GET estado (todos los campos + `empresa.razonSocial/codigo` y `auditoria.id/refCode` verificados contra DB) |
| R12 | estado › consentimiento (200 en `pendiente`; 409 tras salir de `pendiente`) |
| R13 | ingesta › chunk feliz (dispositivos + software + servicios persistidos y verificados en DB; respuesta `{ recibidos, dispositivosDetectados }`) |
| R14 | ingesta › reenvío del mismo chunk (misma respuesta, mismos conteos, sin duplicados) |
| R15 | ingesta › chunk vacío y de 101 → 400 sin escrituras; body > 2 MB → 400 pre-parse sin escrituras |
| R16 | estado › transiciones (`pendiente→en_curso` con consentimiento → 200 con `iniciadoAt`); estado › estado inválido en body → 400 |
| R17 | estado › transiciones (`en_curso` sin consentimiento → 409 sin mutar; `pendiente→completado` → 409) |
| R18 | estado › fallido sin `errorDetalle` → 400 sin mutar; con detalle → 200 con `finalizadoAt` y `error_detalle` persistido |
| R19 | estado › versión (sin `X-Agente-Version` → 400; valor no semver → 400) |
| R20 | estado › versión (major `2.0.0` → 409 «actualice el agente») |
| R21 | estado › versión distinta (`1.9.9` + `X-Agente-Hostname` persistidos en `agente_version`/`agente_hostname`) |
| R22 | token › POST /api/escaneos (201 en `pendiente` admin y técnico asignado; 404 auditoría inexistente; 400 body inválido) |
| R23 | ingesta › 31 chunks en 1 min con el mismo token → el 31 da 429 |
| R24 | estado › 61 GETs en 1 min con el mismo token → el 61 da 429 |
| R25 | ingesta › 11 fallos de auth desde una IP → 401 ×10 y el 11° 429 |
| R26 | colgados › marcado (solo el `en_curso` >24 h queda `fallido` con `error_detalle` y `finalizado_at`; el activo y el `pendiente` viejo intactos; respuesta `{ marcados: 1 }`) |
| R27 | colgados › 401 sin token, con token incorrecto y fail-closed sin `ESCANEO_SYSTEM_TOKEN` |
| R28 | colgados › segunda corrida sin actividad intermedia → `{ marcados: 0 }` |
| R29 | estado › error inesperado del repo (stub `mockRejectedValueOnce`) → 500 `{ error: 'Error interno' }` sin stack ni detalle SQL, con `logger.error` server-side; los errores de dominio mapean a 404/409/400 en todos los tests anteriores |
| R30 | estado › logs de auth fallida (spy sobre `logger.warn`: registra IP y motivo `not_found`, nunca el token; la respuesta tampoco lo expone) |

## Desviaciones del design (con justificación)

1. **`resolverTokenEscaneo` devuelve unión discriminada** (`{ ok: true, … } |
   { ok: false, reason: 'not_found' | 'revoked' | 'expired' }`) en vez de
   `| null`. R30 exige «motivo categorizado» en los logs de auth fallida y el
   guard no podía conocerlo con `null` sin una segunda query. Es el mismo
   patrón que `resolveResetToken` de #50 (citado por el design como referencia).
   R7 se mantiene: las tres razones mapean al mismo 401 genérico.
2. **Preludio del agente compuesto en `requireAgenteRequest`**
   (`require-agente-escaneo.ts`, archivo no listado en el design). El design
   repartía rate limit + guard + versión + R21 en cada ruta; componerlo evita
   duplicar ~20 líneas × 4 rutas y fija el orden «rate limit antes de tocar
   DB» (§Endpoints). `requireEscaneoToken` recibe además `clientIp` (el design
   no indicaba cómo llegaba la IP al guard para R25/R30; viene de
   `getClientAddress()` como en login).
3. **`isTokenAuthRateLimited` se invoca solo en el camino de fallo** (incrementa
   y chequea en una llamada, como `isLoginRateLimited`). Los requests que
   autentican bien no consumen la ventana de fallos: el escenario de R25
   (fuerza bruta → todos los intentos fallan) queda cubierto y un agente
   legítimo detrás de la misma IP compartida no hereda el castigo.
4. **`obtenerContextoEscaneo` y `resolverEmpresaDeAuditoria`** agregadas a
   `escaneos/api.ts`: queries de contexto para R11 (empresa/auditoría) y R22
   (empresa desde la auditoría) que el design describía pero no listaba como
   funciones del módulo.
5. **`registrarAgente` también escribe cuando solo difiere el hostname**
   (misma versión, otra máquina): «reflejar lo que realmente ejecutó» (R21).
   Sigue siendo no-op cuando nada cambió (un solo `UPDATE` condicional).
6. **`marcarColgadosFallidos` con guard por ítem**: si un candidato cambió de
   estado entre la lectura y el marcado (carrera), se loguea warn y se saltea
   sin abortar el lote ni contarse. Sin esto, un ítem podrido abortaría el job
   en cada corrida horaria.
7. **Header opcional `X-Agente-Hostname`** como canal del hostname de R21 (el
   design decía «si viene» sin nombrar el canal). Se trunca a 300 (límite del
   schema de creación de #59).
8. **Chequeo de `Content-Length` > 2 MB antes que auth/rate limit** en
   `POST dispositivos`: es el rechazo más barato y protege el parse; R15 solo
   exige «sin escrituras», que se cumple en ambos órdenes.
9. **Campos camelCase en las respuestas del agente** (`razonSocial`, `codigo`,
   `refCode`): el sketch del design ya usaba camelCase para los campos del
   escaneo; se extendió al contexto por consistencia interna de la respuesta.
10. **`.env.example`** suma `ESCANEO_SYSTEM_TOKEN` (convención de
    `CRM_API_TOKEN`); T12 solo nombraba `deploy-dokploy.md`.

## Notas de verificación

- Entorno VM: Docker no disponible → Postgres 16 instalado vía apt; rol/DB
  `auditapp` según `.env.example`; migraciones con `scripts/db-migrate.ts`
  (031 aplicada; re-corrida `applied: []`). `pg_isready` verificado.
- `pnpm exec vitest run tests/api/escaneos-*.test.ts`: 29/29 verdes.
- Zombies vitest: el hook `afterFileEdit` del harness (`.cursor/hooks.json`)
  y los timeouts dejan procesos que retienen el advisory lock de la DB de test
  (problema ya documentado en #59 y en la sesión mobile 2026-08-11). Se
  mitigó matando los procesos entre corridas; los runs limpios salen limpios.
- Bugs encontrados por los propios tests durante la sesión (ambos en fixtures
  de test, no en código de app): el fixture de token expirado violaba
  `escaneo_token_ttl_ck` (el CHECK funciona) y un default de parámetro TS
  hacía que el test «sin header» sí enviara `X-Agente-Version`.
