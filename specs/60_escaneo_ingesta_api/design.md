# Design — #60 60_escaneo_ingesta_api

## Alcance

API HTTP de ingesta para el agente `sys-scan-agent` (#61) + emisión y
revocación de tokens de escaneo por staff + job de escaneos colgados.
**No incluye** UI (#62), agente (#61), scoring (#63), diff (#64).

Consume de #59 (rama `cursor/59-escaneo-modelo-datos-8007`, ya aprobada):
`crearEscaneo`, `registrarConsentimiento`, `upsertDispositivos`,
`cambiarEstadoEscaneo`, `obtenerEscaneo`, `escaneosColgados`, schemas Zod
(`crearEscaneoInput`, `registrarConsentimientoInput`, `dispositivoInput`,
`escaneoEstado`, `TRANSICIONES`) y errores de dominio. **No modifica** el
repo de #59: todo lo nuevo vive en módulos propios que componen esas
funciones (R26/R27 de #59 se respetan pasando `empresaId` resuelto del token,
nunca del cliente).

## Decisiones de diseño (resumen)

1. **El escaneo lo crea el staff, no el agente.** El token tiene scope de UN
   escaneo → el escaneo debe existir antes de emitirlo. El flujo «crear y
   preparar» es staff-side (sesión + admin o `techIsAssigned`, patrón
   #33/#57); la UI de #62 consume `POST /api/escaneos` +
   `POST /api/escaneos/[id]/token`. Refina el acceptance del backlog («el
   agente puede crear escaneo») — **validar en puerta humana**.
2. **Token opaco tipo password-reset** (#50): 256 bits aleatorios, se
   persiste SHA-256 hex, TTL 12 h, rotación con revocación del previo,
   historial conservado. Nada de JWT: no hace falta claims ni refresh; la
   revocación inmediata es trivial contra DB.
3. **El token resuelve el ámbito, el path lo confirma.** `requireEscaneoToken`
   devuelve `(escaneoId, empresaId)` del token; mismatch con el path → 404
   (no se confirma existencia ajena). El repo siempre recibe el `empresaId`
   del token (R26/R27 de #59).
4. **Rate limit en memoria**, mismo patrón Map + prune de
   `auth/rate-limit.ts`, con claves por token (no por IP: el agente sale a
   internet desde la red del cliente, IP variable y compartida). Fail-open
   controlado por flag de tests, igual que login.
5. **Job de colgados = endpoint de sistema + scheduler externo.** El repo no
   tiene cron; se introduce la convención mínima: endpoint protegido por
   token de env var (patrón `require-crm-token.ts`) que un scheduler externo
   (cron del host Dokploy, GitHub Actions schedule, etc.) invoca cada hora.
   El marcado compone `escaneosColgados()` + `cambiarEstadoEscaneo(...,
   'fallido', detalle)` de #59 — la máquina de estados sigue siendo la única
   vía de transición (R10 de #59).
6. **Versión del agente por header.** `X-Agente-Version` obligatorio en
   endpoints del agente; si difiere de `escaneo.agente_version` se persiste
   (lo que realmente corrió manda sobre el placeholder de creación). Major
   distinto del soportado → 409. Esto responde cómo se versiona el agente
   contra el campo del modelo (#59 R2) sin tocar el contrato de creación.

## Archivos

| Archivo | Cambio |
|---|---|
| `migrations/031_escaneo_token.sql` | Tabla `escaneo_token` + índices |
| `src/lib/server/escaneos/api.ts` | Emisión/revocación/resolución de token, ámbito, `registrarAgente` |
| `src/lib/server/escaneos/jobs.ts` | `marcarColgadosFallidos()` (compone repo #59) |
| `src/lib/server/escaneos/http.ts` | Mapeo errores de dominio → envelope + schema de chunk |
| `src/lib/server/api/require-escaneo-token.ts` | Guard Bearer → `(escaneoId, empresaId)` |
| `src/lib/server/api/require-system-token.ts` | Guard Bearer por env var (patrón CRM) |
| `src/lib/server/api/escaneo-rate-limit.ts` | Limitadores por token y por IP |
| `src/routes/api/escaneos/+server.ts` | `POST` crear escaneo (sesión staff) |
| `src/routes/api/escaneos/[escaneoId]/+server.ts` | `GET` estado (token) |
| `src/routes/api/escaneos/[escaneoId]/token/+server.ts` | `POST` emitir / `DELETE` revocar (sesión staff) |
| `src/routes/api/escaneos/[escaneoId]/consentimiento/+server.ts` | `POST` (token) |
| `src/routes/api/escaneos/[escaneoId]/dispositivos/+server.ts` | `POST` chunk (token) |
| `src/routes/api/escaneos/[escaneoId]/estado/+server.ts` | `POST` transición (token) |
| `src/routes/api/system/escaneos-colgados/+server.ts` | `POST` job (token de sistema) |
| `tests/api/escaneos-token.test.ts` | Emisión, rotación, revocación, guards staff |
| `tests/api/escaneos-ingesta.test.ts` | Chunks, idempotencia, límites, rate limit |
| `tests/api/escaneos-estado.test.ts` | Transiciones, consentimiento, GET estado, versión |
| `tests/api/escaneos-colgados.test.ts` | Job de sistema |

## Esquema — `migrations/031_escaneo_token.sql`

Idempotente (guards `IF NOT EXISTS`), convenciones de #59 (singular,
`created_at`, `text + CHECK`).

```sql
-- =====================================================================
-- 031_escaneo_token.sql — #60
-- Tokens opacos por escaneo para el agente externo (#61).
-- =====================================================================

CREATE TABLE IF NOT EXISTS escaneo_token (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escaneo_id   uuid NOT NULL REFERENCES escaneo(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,        -- SHA-256 hex del token en claro
  creado_por   uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_token_hash_ck CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT escaneo_token_ttl_ck CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS escaneo_token_hash_uq
  ON escaneo_token (token_hash);

-- Un solo token activo por escaneo (rotación = revocar + insertar, R3)
CREATE UNIQUE INDEX IF NOT EXISTS escaneo_token_activo_uq
  ON escaneo_token (escaneo_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS escaneo_token_escaneo_idx
  ON escaneo_token (escaneo_id);
```

Notas:

- **`ON DELETE CASCADE` desde `escaneo`**: borrar la auditoría elimina en
  cascada escaneos (#59 R5) y con ellos sus tokens.
- **Historial conservado** (R4): filas revocadas quedan para auditoría
  («quién emitió, cuándo, cuándo se revocó»). Sin purga, igual que #59.
- **`creado_por ... RESTRICT`**: un usuario con tokens emitidos no se borra
  (mismo criterio que `escaneo.tecnico_id` en #59).

## Módulo de tokens — `src/lib/server/escaneos/api.ts`

```ts
export const ESCANEO_TOKEN_TTL_HORAS = 12;
export const AGENTE_MAJOR_SOPORTADO = 1;

export type AmbitoEscaneo = {
  escaneoId: string;
  auditId: string;
  empresaId: string;
};

/** Ámbito para rutas staff (emisión/revocación): null si no existe. */
export async function resolverAmbitoEscaneo(
  escaneoId: string
): Promise<AmbitoEscaneo | null>;

/** Emite token: revoca el activo (R3), inserta hash, devuelve claro UNA vez (R5). */
export async function emitirTokenEscaneo(
  escaneoId: string,
  usuarioId: string
): Promise<{ token: string; expiresAt: Date }>;

/** Revocación idempotente (R4). */
export async function revocarTokenEscaneo(escaneoId: string): Promise<void>;

/** Resolución para el guard: null si inexistente, revocado o expirado (R7). */
export async function resolverTokenEscaneo(
  tokenClaro: string
): Promise<{ escaneoId: string; empresaId: string } | null>;

/** Persiste versión/hostname del agente cuando difieren (R21). */
export async function registrarAgente(
  empresaId: string,
  escaneoId: string,
  version: string,
  hostname?: string
): Promise<void>;
```

Queries clave:

```ts
// emitirTokenEscaneo — transacción: revocar activo + insertar nuevo
const token = randomBytes(32).toString('base64url'); // 256 bits (R1)
const tokenHash = createHash('sha256').update(token).digest('hex');
// UPDATE escaneo_token SET revoked_at = now()
//   WHERE escaneo_id = ${escaneoId} AND revoked_at IS NULL;
// INSERT INTO escaneo_token (escaneo_id, token_hash, creado_por, expires_at)
//   VALUES (${escaneoId}, ${tokenHash}, ${usuarioId},
//           now() + interval '12 hours');

// resolverTokenEscaneo — ámbito completo en una sola query (R8)
// SELECT t.escaneo_id, a.empresa_id
//   FROM escaneo_token t
//   JOIN escaneo e ON e.id = t.escaneo_id
//   JOIN audit a ON a.id = e.audit_id
//  WHERE t.token_hash = ${hashToken(tokenClaro)}
//    AND t.revoked_at IS NULL
//    AND t.expires_at > now()
```

## Guards — `src/lib/server/api/`

```ts
// require-escaneo-token.ts
export function requireEscaneoToken(
  request: Request,
  escaneoIdPath: string
): Promise<{ escaneoId: string; empresaId: string } | Response>;
```

1. Sin `Authorization: Bearer` → 401 «No autorizado».
2. `resolverTokenEscaneo` null → 401 «No autorizado» (mismo mensaje para
   inexistente/revocado/expirado, R7) + log categorizado sin token (R30).
3. `escaneoIdPath !== token.escaneoId` → 404 «Escaneo no encontrado» (R9).
4. OK → `{ escaneoId, empresaId }` del token (R8).

```ts
// require-system-token.ts — copia del patrón require-crm-token.ts
export function requireSystemToken(request: Request): Response | null;
```

Env var `ESCANEO_SYSTEM_TOKEN`, comparación `timingSafeEqual`, fail-closed si
no está configurada (R27).

## Rate limit — `src/lib/server/api/escaneo-rate-limit.ts`

Mismo patrón Map + prune throttled de `auth/rate-limit.ts`, con flag
`ESCANEO_RATE_LIMIT_DISABLED=1` para tests E2E (espejo de
`LOGIN_RATE_LIMIT_DISABLED`).

```ts
export function isIngestaRateLimited(tokenHash: string, now?: number): boolean;
//   30 req/min por token — solo POST dispositivos (R23)
export function isAgenteRateLimited(tokenHash: string, now?: number): boolean;
//   60 req/min por token — resto de endpoints del agente (R24)
export function isTokenAuthRateLimited(clientIp: string, now?: number): boolean;
//   10 fallos de auth/min por IP (R25)
export function resetEscaneoRateLimits(): void; // solo tests
```

Dimensionamiento de R23: clientes SyS son PyMEs; un /24 son 254 hosts ≈ 3
chunks de 100. Aun una red de 3.000 hosts son 30 chunks: cabe en 1 minuto.
El límite frena loops rotos del agente, no el uso legítimo.

## Endpoints

Convenciones comunes: envelope `apiSuccess`/`apiError`; `parseJsonBody`;
Zod `safeParse` con mensajes de issues unidos (patrón `crm/leads/batch`);
errores de dominio mapeados por `http.ts`; requests del agente exigen
`X-Agente-Version` (R19) y pasan por rate limit antes de tocar DB.

### Staff (sesión)

**`POST /api/escaneos`** — crea escaneo en `pendiente` (R22).

- Guard: `requireStaffApi`; si rol ≠ admin → exigir
  `techIsAssigned(body.auditId, user.id)` (R6, patrón #33/#57).
- Body: `crearEscaneoInput` de #59 (incluye `auditId`; `agenteVersion` es la
  versión vigente del agente que la UI #62 precarga — la corrige el agente
  vía R21 al conectarse).
- Empresa: se resuelve desde la auditoría (`SELECT empresa_id FROM audit
  WHERE id = ...`); 404 si no existe (R22). Luego
  `crearEscaneo(empresaId, user.id, input)` (#59).
- 201 con la fila del escaneo.

**`POST /api/escaneos/[escaneoId]/token`** — emite (R1, R3, R5).

- Guard: `requireStaffApi` + `resolverAmbitoEscaneo` + (admin o
  `techIsAssigned(ambito.auditId, user.id)`) → 404 si no existe, 403 si no
  autorizado (R6).
- 200 `{ token, expiresAt }`. Única respuesta con el claro (R5).

**`DELETE /api/escaneos/[escaneoId]/token`** — revoca (R4). Mismos guards.
200 siempre que exista el escaneo (idempotente).

### Agente (token)

**`GET /api/escaneos/[escaneoId]`** — estado (R10, R11).

- `requireEscaneoToken` → ámbito; `obtenerEscaneo(empresaId, escaneoId)`
  (#59) + join de contexto (empresa `razon_social`/`codigo`, audit
  `id`/`ref_code`).
- 200 `{ estado, dispositivosDetectados, consentimientoOtorgado, etiqueta,
  rangoObjetivo, iniciadoAt, finalizadoAt, empresa: {...}, auditoria: {...} }`.

**`POST /api/escaneos/[escaneoId]/consentimiento`** (R12).

- Body: `registrarConsentimientoInput` (#59). Repo:
  `registrarConsentimiento(empresaId, escaneoId, input)`.
- `EscaneoNoMutableError` → 409 (ya salió de `pendiente`).

**`POST /api/escaneos/[escaneoId]/dispositivos`** — chunk (R13, R14, R15).

- Rechazo previo al parse si `Content-Length > 2 MB` → 400 (R15).
- Body: `chunkDispositivosInput` (nuevo en `http.ts`):

```ts
export const chunkDispositivosInput = z.object({
  dispositivos: z.array(dispositivoInput).min(1).max(100) // #59 + R15
}).strict();
```

- Rate limit `isIngestaRateLimited` (R23) → 429.
- `upsertDispositivos(empresaId, escaneoId, parsed.dispositivos)` (#59) →
  200 `{ recibidos: n, dispositivosDetectados: total }` (el total se relee
  con `obtenerEscaneo`).
- `EscaneoNoMutableError` → 409 (estado terminal o `pendiente`: el repo de
  #59 solo acepta `en_curso`/`sincronizando` — R4/R10).

**`POST /api/escaneos/[escaneoId]/estado`** — transición (R16, R17, R18).

- Body: `z.object({ estado: escaneoEstado, errorDetalle: z.string().min(1)
  .max(2000).optional() }).strict()` (schemas #59).
- `cambiarEstadoEscaneo(empresaId, escaneoId, estado, errorDetalle)` (#59).
- `TransicionInvalidaError`/`ConsentimientoFaltanteError` → 409;
  `ValidationError` (fallido sin detalle) → 400.

### Sistema

**`POST /api/system/escaneos-colgados`** — job R7 de #59 (R26–R28).

- `requireSystemToken` (R27) + rate limit por IP.
- `marcarColgadosFallidos()` de `jobs.ts`:

```ts
export async function marcarColgadosFallidos(): Promise<{ marcados: number }> {
  const colgados = await escaneosColgados(); // #59 R7: >24 h en en_curso/sincronizando
  let marcados = 0;
  for (const esc of colgados) {
    const ambito = await resolverAmbitoEscaneo(esc.id); // empresaId real vía join
    if (!ambito) continue;
    // La máquina de estados de #59 valida la transición (R10) y setea
    // finalizado_at; error_detalle obligatorio para fallido.
    await cambiarEstadoEscaneo(
      ambito.empresaId, esc.id, 'fallido',
      'Sin actividad por más de 24 horas (job de limpieza)'
    );
    marcados += 1;
  }
  return { marcados };
}
```

- 200 `{ marcados: n }`. Idempotente: tras marcar, los escaneos quedan en
  estado terminal y `escaneosColgados()` ya no los devuelve (R28).
- Scheduler externo (fuera de alcance del código): cron horario en el host
  Dokploy o GitHub Actions schedule con `curl -X POST -H "Authorization:
  Bearer $ESCANEO_SYSTEM_TOKEN"`. Se documenta en `docs/deploy-dokploy.md`
  al implementar.

## Mapeo de errores — `src/lib/server/escaneos/http.ts`

```ts
export function mapErrorEscaneo(err: unknown): Response;
```

| Error | HTTP | Mensaje al cliente |
|---|---|---|
| `EscaneoNotFoundError` | 404 | «Escaneo no encontrado» |
| `AuditNotFoundError` | 404 | «Auditoría no encontrada» |
| `EscaneoNoMutableError` | 409 | mensaje del error |
| `TransicionInvalidaError` | 409 | mensaje del error |
| `ConsentimientoFaltanteError` | 409 | mensaje del error |
| `ValidationError` | 400 | mensaje del error |
| `ZodError` | 400 | issues unidos (patrón CRM batch) |
| desconocido | 500 | «Error interno» + `logger.error` con contexto (sin stack al cliente, R29) |

## Consumo explícito de R de #59

| R de #59 | Cómo lo consume #60 |
|---|---|
| R4 (no escritura en terminal) | `upsertDispositivos` lo garantiza; el endpoint mapea a 409 (R10). |
| R7 (escaneos colgados) | `escaneosColgados()` es el núcleo del job (R26). |
| R8 (consentimiento para `en_curso`) | `cambiarEstadoEscaneo` valida; el endpoint expone 409 (R17). |
| R10 (máquina de estados) | Toda transición pasa por `cambiarEstadoEscaneo`, también el job. |
| R12/R13/R18 (identidad, upsert, COALESCE) | Idempotencia de chunks (R14) sin lógica extra en la API. |
| R14 (raw sin transformación) | La API valida con Zod y pasa el payload tal cual al repo. |
| R26/R27 (scope empresa query-level) | El guard resuelve `empresaId` del token y lo pasa siempre (R8). |
| R28 (`dispositivos_detectados`) | El endpoint de ingesta lo devuelve actualizado (R13). |

## Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| **El agente crea el escaneo por API** (lectura literal del backlog) | El token tiene scope de UN escaneo: para crear con token haría falta un token por auditoría o de larga vida — más superficie, menos trazabilidad. La creación staff-side además captura `tecnico_id` real (R2 de #59) y habilita la UI de preparación (#62). Refinamiento a validar en puerta. |
| **JWT firmado en vez de token opaco** | Revocación inmediata (R4) exigiría denylist en DB igualmente; el lookup de token opaco es un índice único y punto. JWT no aporta claims que se necesiten. |
| **Columna `token_hash` en `escaneo`** | Impide historial y rotación auditable (R3/R4); tabla propia con índice parcial es la convención (`password_reset_token`). |
| **Rate limit por IP en ingesta** | El agente sale desde la red del cliente (IP compartida/variable); la unidad natural de abuso es el token. Por IP solo para fallos de auth (R25). |
| **Redis para rate limit** | No hay Redis en el stack; el deploy es un solo contenedor (Dokploy), el Map en memoria alcanza — mismo criterio que login. |
| **Job interno con `setInterval`/`node-cron`** | Procesos de fondo dentro del server SvelteKit no sobreviven deploys ni escalan; el repo no tiene la convención. Endpoint + scheduler externo es observable y fail-closed. |
| **Auto-revocar token al entrar en estado terminal** | El agente puede necesitar reintentar el cierre o leer el estado final; el TTL de 12 h limita la ventana. Complejidad sin beneficio. |
| **Prefijo visible en el token (`ssa_...`)** | Los tokens del repo (briefing, reset) no usan prefijo; homogeneidad. |
| **Reusar `CRM_API_TOKEN` para el job** | Un solo token de sistema para todo acopla rotaciones; variable dedicada `ESCANEO_SYSTEM_TOKEN` con el mismo patrón de guard. |

## Tests — `tests/api/escaneos-*.test.ts`

Contra Postgres real (test DB), handlers importados directamente, fixtures
empresa + audit + técnico (patrón `crm-leads-batch.test.ts` +
`tests/helpers/`). Rate limit con `now` inyectable o flag de disable según
el caso.

| Caso | R |
|---|---|
| Emisión: 401 sin sesión, 403 técnico no asignado, 200 admin y técnico asignado; claro solo en la respuesta; DB guarda hash de 64 hex | R1, R5, R6 |
| Rotación: segundo `POST token` revoca el primero (el viejo da 401, el nuevo funciona) | R3 |
| Revocación: `DELETE` → el token deja de funcionar de inmediato; historial conservado | R4 |
| Token expirado (fixture con `expires_at` pasado) → 401 mismo mensaje que inválido | R7 |
| Path `escaneoId` ≠ token → 404 idéntico a escaneo inexistente | R9 |
| `GET` estado devuelve contexto (empresa/auditoría) y funciona en terminal | R10, R11 |
| Consentimiento: 200 en `pendiente`; 409 si ya está `en_curso` | R12 |
| Chunk feliz: dispositivos + software + servicios persistidos; respuesta con conteo | R13 |
| Reenvío del mismo chunk → mismo `dispositivos_detectados`, sin duplicados | R14 |
| Chunk de 101 dispositivos o body > 2 MB → 400, cero escrituras | R15 |
| `pendiente → en_curso` sin consentimiento → 409; con consentimiento → 200; `pendiente → completado` → 409; `fallido` sin `errorDetalle` → 400 | R16, R17, R18 |
| Sin `X-Agente-Version` → 400; major distinto → 409; versión distinta se persiste en `agente_version` | R19, R20, R21 |
| `POST /api/escaneos`: 201 en `pendiente`; 404 auditoría inexistente; 403 técnico no asignado | R22, R6 |
| 31 chunks en 1 min con mismo token → el 31 da 429 | R23 |
| 61 GETs en 1 min → 429 | R24 |
| 11 fallos de auth desde una IP → 429 | R25 |
| Job: sin token de sistema → 401; con token marca `fallido` solo los >24 h con `error_detalle`; segunda corrida marca 0 | R26, R27, R28 |
| Error inesperado del repo (stub) → 500 genérico sin stack; logs sin token en claro | R29, R30 |

## Gates

`pnpm test -- tests/api/escaneos-*.test.ts` · `pnpm run check` ·
`pnpm run build` · `./init.sh`
