# Requirements — 60_escaneo_ingesta_api

> Endpoints HTTP para que el agente externo `sys-scan-agent` (#61) sincronice
> chunks de dispositivos contra AuditApp, más la emisión/revocación del token
> de escaneo por parte del staff y el job de escaneos colgados (R7 de #59).
> Consume el modelo y el repositorio de #59 (`specs/59_escaneo_modelo_datos/`).
> Sin UI (#62), sin agente (#61), sin scoring (#63), sin diff (#64).
>
> **Refinamiento respecto del backlog (a validar en puerta humana):** la
> entrada #60 del backlog menciona «el agente puede crear escaneo». Como el
> token es **por escaneo** (scope limitado a ESE escaneo), el escaneo debe
> existir antes de emitir el token. Por eso la creación del escaneo queda del
> lado staff (sesión, admin o técnico asignado — patrón #33/#57) y el agente
> opera todo lo demás con su token. El acceptance del backlog se cumple vía
> flujo combinado: staff crea + emite token → agente hace el resto por API.

## Contexto verificado (repo real)

- Repo de #59 (`src/lib/server/escaneos/repo.ts`, rama
  `cursor/59-escaneo-modelo-datos-8007`): toda función recibe `empresaId`
  (R26/R27 de #59); `upsertDispositivos` solo acepta estados
  `en_curso`/`sincronizando`; `cambiarEstadoEscaneo` valida TRANSICIONES y
  consentimiento (R8); `escaneosColgados()` es job de sistema sin `empresaId`.
- Envelope API: `apiSuccess` / `apiError` / `parseJsonBody` en
  `src/lib/server/api/envelope.ts` (`{ success, data, error }`).
- Guards de sesión: `requireStaffApi` en `src/lib/server/api/guards.ts`;
  asignación con `techIsAssigned(auditId, userId)` (#33/#57).
- Token por env var con comparación constante: `require-crm-token.ts`
  (patrón a reutilizar para el endpoint de sistema).
- Token aleatorio + hash SHA-256 + TTL + revocación: patrón de
  `src/lib/server/auth/password-reset.ts` (`randomBytes(32).toString('base64url')`,
  `createHash('sha256')`, `expires_at`, invalidación de tokens previos).
- Rate limit en memoria por ventana (Map + prune throttled, flag de tests):
  `src/lib/server/auth/rate-limit.ts` (login y password-reset).
- Errores de dominio tipados con `code` (#59 `errors.ts`):
  `EscaneoNotFoundError`, `EscaneoNoMutableError`, `TransicionInvalidaError`,
  `ConsentimientoFaltanteError`, `AuditNotFoundError`, `ValidationError`.
- Migraciones: próxima libre `031` (`030` es de #59). Tests API:
  `tests/api/<ruta>.test.ts` contra Postgres real (`tests/helpers/db.ts`),
  handlers importados directamente (patrón `tests/api/crm-leads-batch.test.ts`).
- **No existe** convención de cron/jobs programados en el repo: esta feature
  la introduce (endpoint de sistema protegido, invocado por scheduler externo).

## Requisitos

### Token de escaneo (emisión y ciclo de vida)

**R1** — CUANDO un usuario staff emita un token de escaneo, el sistema DEBE
generar un token aleatorio de 256 bits y persistir únicamente su hash SHA-256,
nunca el token en claro.

**R2** — El sistema DEBE asociar cada token de escaneo a exactamente un
escaneo, con una expiración no mayor a 12 horas desde su emisión.

**R3** — CUANDO se emita un token para un escaneo que ya tiene un token
activo, el sistema DEBE revocar el token previo en la misma operación
(rotación: un solo token activo por escaneo).

**R4** — CUANDO un usuario staff revoque el token de un escaneo, el sistema
DEBE impedir su uso de inmediato, conservando el registro histórico de la
emisión.

**R5** — El sistema DEBE devolver el token en claro únicamente en el cuerpo
de la respuesta de emisión (ninguna otra respuesta, log ni lectura posterior
lo expone; ver también R30).

**R6** — CUANDO un usuario invoque los endpoints de emisión o revocación de
token, el sistema DEBE exigir sesión con rol `admin` o
`techIsAssigned(auditId, userId)` sobre la auditoría dueña del escaneo; SI no
se cumple ENTONCES el sistema DEBE responder 403 sin mutar nada.

### Autenticación y scope del agente

**R7** — CUANDO un request del agente presente un token inexistente, revocado
o expirado, el sistema DEBE responder 401 con un mensaje genérico que no
revele cuál condición falló.

**R8** — CUANDO un request del agente se autentique con un token válido, el
sistema DEBE resolver desde el token el par `(escaneoId, empresaId)` y pasar
AMBOS a las funciones del repositorio de #59 (defensa en profundidad,
R26/R27 de #59).

**R9** — SI el `escaneoId` del path no coincide con el escaneo del token
ENTONCES el sistema DEBE responder 404 con el mismo mensaje que un escaneo
inexistente (sin confirmar existencia ajena).

**R10** — MIENTRAS un escaneo esté en estado terminal (`completado`,
`fallido`, `cancelado`), el sistema DEBE rechazar las escrituras del agente
con 409 (vía R4 de #59) y DEBE permitir la lectura de estado.

### Endpoints del agente (token)

**R11** — CUANDO el agente invoque `GET /api/escaneos/[escaneoId]`, el
sistema DEBE responder el estado del escaneo con: `estado`,
`dispositivos_detectados`, `consentimiento_otorgado`, `etiqueta`,
`rango_objetivo`, `iniciado_at`, `finalizado_at`, y los datos de contexto
para confirmación del técnico (empresa: `razon_social`, `codigo`; auditoría:
`id`, `ref_code`).

**R12** — CUANDO el agente invoque `POST /api/escaneos/[escaneoId]/consentimiento`
con un cuerpo válido según `registrarConsentimientoInput` (#59), el sistema
DEBE registrar el consentimiento vía el repositorio; SI el escaneo ya salió
de `pendiente` ENTONCES el sistema DEBE responder 409.

**R13** — CUANDO el agente invoque `POST /api/escaneos/[escaneoId]/dispositivos`
con un chunk válido (array de `dispositivoInput` de #59, entre 1 y 100
dispositivos), el sistema DEBE persistirlo vía `upsertDispositivos` y
responder 200 con la cantidad recibida y el `dispositivos_detectados`
resultante.

**R14** — CUANDO el agente reenvíe un chunk ya enviado (reintento por red),
el sistema DEBE producir el mismo estado final sin duplicar dispositivos,
software ni servicios (idempotencia por R13/R20/R22 de #59).

**R15** — SI el cuerpo de un request de ingesta supera 2 MB o el chunk supera
100 dispositivos ENTONCES el sistema DEBE rechazarlo sin ejecutar ninguna
escritura en la base.

**R16** — CUANDO el agente invoque `POST /api/escaneos/[escaneoId]/estado`
con un estado destino, el sistema DEBE aplicar la máquina TRANSICIONES de #59
incluyendo la validación de consentimiento para `en_curso` (R8 de #59).

**R17** — SI la transición solicitada es inválida o falta consentimiento
para `en_curso` ENTONCES el sistema DEBE responder 409 sin mutar el escaneo.

**R18** — SI el estado destino es `fallido` sin `errorDetalle` ENTONCES el
sistema DEBE responder 400 sin mutar el escaneo.

**R19** — CUANDO el agente invoque cualquier endpoint de escaneo, el sistema
DEBE exigir el header `X-Agente-Version` con semver válido (400 si falta o
es inválido).

**R20** — SI el major de la versión del agente no coincide con el major
soportado por AuditApp ENTONCES el sistema DEBE responder 409 indicando que
actualice el agente.

**R21** — CUANDO la versión recibida difiera de `agente_version` persistido,
el sistema DEBE actualizarlo (junto a `agente_hostname` si viene) para
reflejar lo que realmente ejecutó.

### Endpoints staff (sesión)

**R22** — CUANDO un usuario staff autorizado (R6) invoque
`POST /api/escaneos` con un cuerpo válido según `crearEscaneoInput` (#59), el
sistema DEBE crear el escaneo en estado `pendiente` vía el repositorio y
responder 201; SI la auditoría no existe o no pertenece a la empresa
resuelta ENTONCES el sistema DEBE responder 404.

### Rate limiting

**R23** — SI un token supera 30 requests de ingesta de dispositivos por
minuto ENTONCES el sistema DEBE responder 429 hasta que venza la ventana.

**R24** — SI un token supera 60 requests por minuto en el resto de los
endpoints del agente ENTONCES el sistema DEBE responder 429 hasta que venza
la ventana.

**R25** — SI una IP supera 10 fallos de autenticación de token por minuto
ENTONCES el sistema DEBE responder 429 a los siguientes intentos desde esa
IP hasta que venza la ventana.

### Job de escaneos colgados (R7 de #59)

**R26** — CUANDO un scheduler externo invoque
`POST /api/system/escaneos-colgados` con el token de sistema configurado por
variable de entorno, el sistema DEBE marcar `fallido` (con `error_detalle`
descriptivo) todo escaneo que `escaneosColgados()` (#59) exponga como
candidato, usando la máquina de estados (R10 de #59), y responder la
cantidad marcada.

**R27** — SI el request al endpoint de sistema no presenta el token de
sistema válido ENTONCES el sistema DEBE responder 401; SI la variable de
entorno no está configurada ENTONCES el sistema DEBE responder 401 a todo
request (fail-closed, patrón `require-crm-token.ts`).

**R28** — CUANDO el job de escaneos colgados se ejecute dos veces seguidas
sin actividad intermedia, la segunda ejecución DEBE marcar cero escaneos
(idempotencia del job).

### Errores y observabilidad

**R29** — El sistema NO DEBE exponer stack traces, SQL ni datos de otros
escaneos en ninguna respuesta de estos endpoints; los errores de dominio de
#59 DEBEN mapear al envelope `apiError` con el status semántico (404/409/400)
y los errores inesperados a 500 con mensaje genérico y log server-side.

**R30** — El sistema NO DEBE loguear el token de escaneo en claro en ningún
camino (ni en errores); los logs de autenticación fallida DEBEN registrar IP
y motivo categorizado, sin material del token.

## Acceptance

- El agente puede: consultar estado, registrar consentimiento, transicionar a
  `en_curso`, enviar chunks idempotentes y cerrar (`completado`/`fallido`)
  vía API con token de scope limitado.
- Un token no puede operar sobre escaneos ajenos (404 en mismatch; repo
  recibe `empresaId` del token, no del cliente).
- Un técnico no asignado no puede emitir ni revocar tokens (403).
- El token nunca se persiste en claro; rotación y revocación inmediatas.
- Job de colgados protegido por token de sistema, idempotente.
- Validación Zod en frontera con los schemas de #59; errores sin stack
  traces ni datos sensibles.
- Tests de integración API contra Postgres real verdes; `pnpm run check`,
  `pnpm run build`, `pnpm test` y `./init.sh` verdes.

## Diferido a features posteriores

| Tema | Feature | Motivo |
|---|---|---|
| UI de creación de escaneo y emisión de token (pantallas) | #62 | #60 expone los endpoints; las pantallas son de la UI de revisión. |
| Lectura de dispositivos para revisión humana | #62 | `listarDispositivos`/`marcarRevision` ya están en el repo (#59); su exposición es de la UI. |
| Vista consolidada multi-VLAN | #62 | Decisión de puerta 2026-08-27 (#59). |
| Auto-revocación de token al entrar en estado terminal | — | Descartado: el agente puede necesitar reintentar el cierre; el TTL de 12 h alcanza. |
| Métricas de rate limit / observabilidad de ingesta | futura | Sin infraestructura de métricas en el repo hoy. |

## Material de referencia

- `specs/59_escaneo_modelo_datos/` — modelo, repo, máquina de estados,
  decisiones de puerta 2026-08-27 (fuente de verdad).
- `src/lib/server/api/` — envelope, guards, patrón de token por env var.
- `src/lib/server/auth/password-reset.ts` — patrón token aleatorio + hash +
  TTL + revocación.
- `src/lib/server/auth/rate-limit.ts` — patrón de rate limit en memoria.
- `docs/source-specs/`: no existe material previo sobre escaneo de red; la
  saga nace del spec provisto por el usuario en chat (2026-08-27, ver #59).
