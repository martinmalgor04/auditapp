# Review — #60 60_escaneo_ingesta_api

> Reviewer: sesión 2026-08-27. Rama revisada: `cursor/60-escaneo-ingesta-api-0ebf`
> (commits `060e96c` feat, `a3edbcd`/`2255576` docs). Spec:
> `specs/60_escaneo_ingesta_api/` (aprobado en puerta humana 2026-08-27).
> Trazabilidad del implementer: `progress/impl_60_escaneo_ingesta_api.md`.

## Veredicto: **APROBADO**

Cero blockers. Los 30 requisitos tienen cobertura de test (30/30), los 8
puntos críticos de seguridad verificados en código y con tests, y los 4 gates
reproducidos por el reviewer en VM limpia con Postgres 16 (apt, sin Docker).

## Blockers

Ninguno.

## Cobertura de trazabilidad: 30/30

Verificado contra `requirements.md` (R1–R30), el mapa del implementer y la
lectura completa de los 4 archivos de test (29 tests: token ×8, ingesta ×7,
estado ×11, colgados ×3):

| R | Evidencia (test / código) |
|---|---|
| R1 | token › emisión: 256 bits base64url (43 chars), DB guarda `hashToken(token)` de 64 hex, nunca el claro. `api.ts:53-54` (`randomBytes(32)` + SHA-256 de `password-reset.ts:33`) |
| R2 | token › emisión: TTL efectivo ≤ 12 h medido en DB; CHECK `escaneo_token_ttl_ck`; `ESCANEO_TOKEN_TTL_HORAS = 12` (`api.ts:5,65`) |
| R3 | token › rotación: 2° POST revoca el 1° (viejo 401, nuevo 200, un solo activo, historial de 2 filas); tx revocar+insertar (`api.ts:56-70`) + índice parcial `escaneo_token_activo_uq` |
| R4 | token › revocación: DELETE → 401 inmediato, fila conservada con `revoked_at`, DELETE repetido 200 idempotente (`api.ts:76-82`) |
| R5 | token › emisión: el claro solo en la respuesta de emisión; GET estado no lo contiene; en DB no aparece |
| R6 | token › guards staff: 401 sin sesión, 403 técnico no asignado (sin mutar), 404 escaneo inexistente, 200 admin y técnico asignado; ídem POST /api/escaneos. `requireStaffApi` + `techIsAssigned` en las 3 rutas staff |
| R7 | token › expirado: body 401 idéntico a token inexistente (`require-escaneo-token.ts:55-61`, mismo «No autorizado» para las 3 causas) |
| R8 | Estructural + happy paths: las 4 rutas del agente pasan por `requireAgenteRequest` → `requireEscaneoToken`, que devuelve `(escaneoId, empresaId)` del token (`require-escaneo-token.ts:48-52`); toda llamada al repo de #59 recibe `ambito.empresaId` (verificado por lectura de las 4 rutas). R9 prueba el rechazo cruzado |
| R9 | ingesta › mismatch path↔token: 404 con body idéntico a escaneo inexistente; el token sigue válido sobre su escaneo (`require-escaneo-token.ts:48-50`) |
| R10 | estado › terminal: GET 200 en `completado`; POST estado/consentimiento/dispositivos → 409 (vía repo #59) |
| R11 | estado › GET: todos los campos + `empresa.razonSocial/codigo` y `auditoria.id/refCode` verificados contra DB (`[escaneoId]/+server.ts:26-36`, `obtenerContextoEscaneo`) |
| R12 | estado › consentimiento: 200 en `pendiente`, 409 tras salir de `pendiente` |
| R13 | ingesta › chunk feliz: dispositivos + software + servicios persistidos en DB; respuesta `{ recibidos, dispositivosDetectados }` |
| R14 | ingesta › reenvío del mismo chunk: misma respuesta, mismos conteos, sin duplicados (idempotencia del repo #59) |
| R15 | ingesta › chunk vacío y de 101 → 400 sin escrituras; body > 2 MB → 400 pre-parse sin escrituras (`dispositivos/+server.ts:16-19`, `chunkDispositivosInput` 1–100 en `http.ts:15-19`) |
| R16 | estado › transiciones: `pendiente→en_curso` con consentimiento 200 con `iniciadoAt`; estado inválido en body → 400 |
| R17 | estado › `en_curso` sin consentimiento → 409 sin mutar; `pendiente→completado` → 409 |
| R18 | estado › `fallido` sin `errorDetalle` → 400 sin mutar; con detalle → 200 con `finalizadoAt` y `error_detalle` persistido |
| R19 | estado › sin `X-Agente-Version` → 400; valor no semver → 400 (`http.ts:40-49`, regex semver oficial) |
| R20 | estado › major `2.0.0` → 409 «actualice el agente» (`require-agente-escaneo.ts:39-41`, `AGENTE_MAJOR_SOPORTADO = 1`) |
| R21 | estado › versión `1.9.9` + `X-Agente-Hostname` persistidos en `agente_version`/`agente_hostname` (`api.ts:110-136`, UPDATE condicional scoped por empresa) |
| R22 | token › POST /api/escaneos: 201 en `pendiente` (admin y técnico asignado), 404 auditoría inexistente, 400 body inválido, 401/403 guards |
| R23 | ingesta › 31 chunks en 1 min con el mismo token → el 31 da 429 (`escaneo-rate-limit.ts:12,68`) |
| R24 | estado › 61 GETs en 1 min → el 61 da 429 (`escaneo-rate-limit.ts:13,73`) |
| R25 | ingesta › 11 fallos de auth desde una IP → 401 ×10 y el 11° 429 (`escaneo-rate-limit.ts:14,81`, solo camino de fallo) |
| R26 | colgados › marcado: solo el `en_curso` >24 h queda `fallido` con `error_detalle` y `finalizado_at`; activo y `pendiente` viejo intactos; `{ marcados: 1 }` (`jobs.ts:17-37`) |
| R27 | colgados › 401 sin token, con token incorrecto y fail-closed sin `ESCANEO_SYSTEM_TOKEN` (`require-system-token.ts:25-42`) |
| R28 | colgados › segunda corrida sin actividad → `{ marcados: 0 }` |
| R29 | estado › error inesperado del repo (stub) → 500 `{ error: 'Error interno' }` sin stack ni SQL, con `logger.error` server-side (`http.ts:82-83`) |
| R30 | estado › logs de auth fallida: `logger.warn` registra IP y motivo `not_found`, nunca el token; la respuesta tampoco lo expone (`require-escaneo-token.ts:56`) |

## Puntos críticos de seguridad (1–8)

1. **Token** — OK. 256 bits (`randomBytes(32).toString('base64url')`,
   `api.ts:53`); en DB solo SHA-256 hex (`hashToken` de `password-reset.ts:33`,
   CHECK `^[0-9a-f]{64}$`); TTL 12 h (`now() + 12 * interval '1 hour'`); rotación
   en transacción con revocación del previo + índice parcial único
   `escaneo_token_activo_uq` (verificado en DB con `\d escaneo_token`);
   revocación explícita idempotente con historial. Ningún log persiste ni expone
   el claro (grep de `log|console` sobre todo el diff: solo
   `escaneo_token_auth_failed` con `{ ip, motivo }`).
2. **Scope** — OK. El guard resuelve `(escaneoId, empresaId)` del token y ambos
   llegan al repo de #59; mismatch path↔token → 404 «Escaneo no encontrado»
   (idéntico a inexistente, test R9 compara bodies). Las 4 rutas del agente
   (`GET [escaneoId]`, consentimiento, dispositivos, estado) pasan por
   `requireAgenteRequest` → `requireEscaneoToken`; ninguna confía solo en el
   path (verificado por lectura de las 4 rutas).
3. **Staff** — OK. `POST /api/escaneos` y `POST/DELETE .../token` exigen
   `requireStaffApi` + (admin o `techIsAssigned(auditId, user.id)`), patrón
   #33/#57. En `POST /api/escaneos` el 403 precede al 404 (no confirma
   existencia ajena al técnico no asignado). Tests: técnico no asignado → 403
   sin mutar (0 filas en `escaneo_token`).
4. **Frontera** — OK. Zod con schemas de #59 en cada endpoint
   (`crearEscaneoInput`, `registrarConsentimientoInput`, `dispositivoInput` vía
   `chunkDispositivosInput` 1–100, `escaneoEstado` vía `cambiarEstadoInput`,
   `.strict()` en los nuevos); body ≤ 2 MB por `Content-Length` pre-parse;
   `X-Agente-Version` obligatorio semver (400) y major incompatible → 409.
5. **Rate limit** — OK. 30/min ingesta por token, 60/min resto por token, 10
   fallos auth/min por IP (este último solo en camino de fallo, como
   `isLoginRateLimited`); flag `ESCANEO_RATE_LIMIT_DISABLED=1` respetado
   (`escaneo-rate-limit.ts:43`); `resetEscaneoRateLimits()` usado en
   `beforeEach` de los 4 archivos.
6. **Endpoint de sistema** — OK. `require-system-token.ts` es copia del patrón
   `require-crm-token.ts` (`timingSafeEqual`, rechazo de placeholder `<...>`,
   fail-closed 401 sin env configurada), sin sesión. El job compone
   `escaneosColgados()` + `resolverAmbitoEscaneo` + `cambiarEstadoEscaneo` de
   #59 (`jobs.ts`), con guard por ítem ante carreras (log warn y skip).
   Documentado en `docs/deploy-dokploy.md` (cron horario, generación con
   `openssl rand -base64 32`) y `.env.example:99` comentada — sin secretos
   reales en ninguno de los dos.
7. **Estados** — OK. El endpoint `POST .../estado` y el job delegan en
   `cambiarEstadoEscaneo` de #59 (TRANSICIONES + consentimiento R8 de #59);
   no reimplementan la máquina (verificado: ninguna ruta hace UPDATE de estado
   propio).
8. **Migración 031** — OK. Idempotente (`IF NOT EXISTS` en tabla e índices;
   re-corrida verificada por el reviewer: `Migrations applied: []`). Solo crea
   `escaneo_token` + 3 índices; no toca tablas de #59. Estructura verificada en
   DB: CHECKs de hash y TTL, FK `CASCADE` a `escaneo`, FK `RESTRICT` a
   `app_user`, índice parcial de token activo.

## Evidencia de gates (corrida propia del reviewer, VM limpia)

Entorno: Postgres 16 vía apt (Docker no disponible), rol/DB `auditapp` según
`.env.example`, `DATABASE_URL=postgres://auditapp:changeme@localhost:5432/auditapp`,
`pg_isready` OK, `pnpm install` OK.

| Gate | Resultado | Esperado | OK |
|---|---|---|---|
| `pnpm run db:migrate` (1ª) | `031_escaneo_token` aplicada | aplicada | ✓ |
| `pnpm run db:migrate` (re-corrida) | `Migrations applied: []` | no-op | ✓ |
| `pnpm exec vitest run tests/api/escaneos-*.test.ts` | **29/29 passed** (4 archivos, 3.0 s) | 29/29 | ✓ |
| `pnpm test` (rama) | **1566 passed / 14 failed / 2 skipped** (1582; 270 archivos) | 1566/14 | ✓ |
| `pnpm test` (master limpio, misma VM) | **1537 passed / 14 failed / 2 skipped** (1553; 266 archivos) | baseline | ✓ |
| `pnpm run check` | **7 errores**, todos en `tests/informe-manual.test.ts` (líneas 69, 99, 148, 220, 268, 315, 353; prop `version`) — archivo fuera del diff | 7 preexistentes | ✓ |
| `pnpm run build` | verde (adapter-node, 7.2 s) | verde | ✓ |

Notas sobre la evidencia:

- **1566 = 1537 + 29 exacto.** Las 14 fallas de la rama se reprodujeron
  aisladas en `tests/informe-manual.test.ts` ×8, `tests/api/report-html-download.test.ts`
  ×5 y `tests/api/audit-crud.test.ts` ×1 — idénticas en archivos y conteos a la
  baseline de master medida en la misma VM. El diff es 100 % aditivo sobre
  código (24 archivos, todos nuevos salvo `.env.example`, `docs/deploy-dokploy.md`,
  `progress/*` y `specs/60/tasks.md`): cero fallas nuevas.
- **Discrepancia menor detectada y explicada:** la primera corrida de la rama
  dio 1563 passed / 5 skipped. Causa: `tests/pwa-prod.test.ts` (3 tests) se
  salta si no existe `build/client/manifest.webmanifest`; el build del snapshot
  no estaba presente en esa corrida y sí en la de master. Tras `pnpm run build`,
  la re-corrida de la rama dio exactamente 1566/14/2 skipped (los 2 skipped
  restantes son `tests/docker.test.ts`, sin Docker en la VM). No es un defecto
  del diff.
- `./init.sh` no se corrió como gate de review: sus FAILs declarados
  (feature 7 sin `specs/07_form_tecnico/` en master + las 14 fallas
  preexistentes) son anteriores a este diff; los gates componentes
  (test/check/build) se corrieron individuales y verdes.

## Observaciones menores (no bloquean)

1. **Límite de 2 MB apoyado en `Content-Length`** (`dispositivos/+server.ts:16-19`):
   un body chunked sin ese header lo evadiría. Mitigación parcial existente: el
   schema limita a 100 dispositivos, aunque `raw` (`z.record(z.unknown())`) no
   tiene tope de bytes. Riesgo acotado a memoria de parseo; candidato a endurecer
   en una feature futura (medir el body real en `parseJsonBody` o límite en el
   adapter).
2. **Rate limit por token antes de autenticar** (`require-agente-escaneo.ts:20-28`):
   tokens inválidos aleatorios crean entradas efímeras en el Map (una por hash).
   Purgadas por ventana de 60 s y mitigado por el límite de 10 fallos/min por IP;
   mismo patrón que `auth/rate-limit.ts`.
3. **Expiración comparada con reloj del app server** (`api.ts:102`,
   `expires_at <= new Date()`) en vez de `now()` en SQL como sugería el sketch
   del design. Irrelevante con TTL de 12 h y app+DB en el mismo host Dokploy.
4. **`registrarAgente` persiste aunque la operación posterior falle** (p. ej.
   409 en estado terminal): el preludio escribe versión/hostname antes de la
   lógica del endpoint. R21 no lo condiciona y es consistente con «reflejar lo
   que realmente ejecutó».
5. **Desviaciones del design documentadas** en el impl doc (10 ítems, entre
   ellas la unión discriminada de `resolverTokenEscaneo` para R30 y el preludio
   compuesto `requireAgenteRequest`): revisadas una por una, todas razonables y
   fieles a los R.

## Recomendación

Aprobar y mergear. El leader puede marcar `done` en `feature_list.json` y
archivar la sesión según `AGENTS.md` §5.
