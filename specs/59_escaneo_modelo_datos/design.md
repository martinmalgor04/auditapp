# Design — #59 59_escaneo_modelo_datos

## Alcance

Persistencia + contratos de tipos para escaneo automatizado de red.
**No incluye** endpoints (#60), agente (#61), UI (#62), scoring (#63), diff (#64).

## Adaptaciones respecto del documento fuente (verificado contra el repo)

| Documento fuente asumía | Realidad del repo | Adaptación |
|---|---|---|
| `auditorias`, `empresas`, `usuarios` | `audit`, `empresa`, `app_user` | FKs reales |
| Tablas plurales (`escaneos`, ...) | Convención singular (`audit_response`, `empresa_evento`) | `escaneo`, `escaneo_dispositivo`, `escaneo_software`, `escaneo_servicio` |
| `creado_at` / `actualizado_at` | `created_at` / `updated_at` | Convención repo |
| Trigger `set_actualizado_at()` | No existe; `updated_at = now()` manual en cada UPDATE | Sin triggers; mismo patrón manual |
| `CREATE TYPE ... AS ENUM` | `text + CHECK` en todo el schema | `text + CHECK` |
| Migración `0059_...` | Secuencial, próxima libre: `030` | `030_escaneo_modelo_datos.sql` |
| FK `relevamiento_items(id)` | No existe esa tabla | Sale de esta migración → #62 |
| Tests en `src/lib/server/.../repo.test.ts` | Convención `tests/<modulo>.test.ts` | `tests/escaneos.test.ts` |
| Scope por empresa como autorización | Autorización real = rol + `techIsAssigned` (#33/#57) | Empresa = defensa en profundidad query-level (R26/R27); autorización en rutas (#60/#62) |

## Decisiones de puerta humana (2026-08-27)

1. **Consentimiento condicionado**: `pendiente`/`cancelado` pueden existir sin
   consentimiento; cualquier otro estado lo exige completo (CHECK en DB, R9) y
   la transición a `en_curso` lo valida en aplicación (R8).
2. **Multi-VLAN consolidada**: N escaneos por auditoría = tandas de colección;
   el inventario del cliente es uno solo. Dedup por MAC en read-time con
   provenance por escaneo. El read-model se construye en #62; #59 solo
   garantiza identidad comparable entre escaneos (índice por `mac`).
3. **Sin purga**: escaneos y `raw` viven indefinidamente. Volumen estimado
   (~90k dispositivos en 3 años) es trivial para Postgres. Revisar con datos
   reales.
4. **No es app aparte**: el agente (#61) ya es el componente externo. Los
   datos son de la auditoría y viven en la misma base.

## Archivos

| Archivo | Cambio |
|---|---|
| `migrations/030_escaneo_modelo_datos.sql` | Tablas + constraints + índices |
| `src/lib/server/escaneos/schemas.ts` | Zod + `identidadDispositivo` + `TRANSICIONES` |
| `src/lib/server/escaneos/repo.ts` | Funciones de repositorio (SQL puro) |
| `src/lib/server/escaneos/errors.ts` | Errores de dominio tipados |
| `tests/escaneos.test.ts` | Integración contra Postgres real (test DB) |

## Esquema — `migrations/030_escaneo_modelo_datos.sql`

Idempotente (runner envuelve en transacción; guards `IF NOT EXISTS`).
Columnas de infraestructura en inglés (`created_at`/`updated_at`), columnas
de dominio en español (misma mezcla que `empresa_evento`).

```sql
-- =====================================================================
-- 030_escaneo_modelo_datos.sql — #59
-- Modelo de datos para escaneo automatizado de red (agente externo #61).
-- =====================================================================

CREATE TABLE IF NOT EXISTS escaneo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id              uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  tecnico_id            uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,

  etiqueta              text,              -- "VLAN administración", "Depósito"
  rango_objetivo        text NOT NULL,     -- "192.168.1.0/24"
  estado                text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
                          'pendiente', 'en_curso', 'sincronizando',
                          'completado', 'fallido', 'cancelado'
                        )),

  agente_version        text NOT NULL,
  agente_hostname       text,

  -- Consentimiento condicionado por estado (decisión puerta 2026-08-27)
  consentimiento_otorgado  boolean NOT NULL DEFAULT false,
  consentimiento_por       text,
  consentimiento_at        timestamptz,

  dispositivos_detectados  integer NOT NULL DEFAULT 0,
  error_detalle            text,

  iniciado_at           timestamptz,
  finalizado_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_consentimiento_ck CHECK (
    estado IN ('pendiente', 'cancelado')
    OR (consentimiento_otorgado
        AND consentimiento_por IS NOT NULL
        AND consentimiento_at IS NOT NULL)
  ),
  CONSTRAINT escaneo_fechas_ck CHECK (
    finalizado_at IS NULL OR iniciado_at IS NULL OR finalizado_at >= iniciado_at
  ),
  CONSTRAINT escaneo_error_ck CHECK (
    estado <> 'fallido' OR error_detalle IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS escaneo_audit_idx ON escaneo (audit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS escaneo_estado_idx ON escaneo (estado)
  WHERE estado IN ('en_curso', 'sincronizando');

CREATE TABLE IF NOT EXISTS escaneo_dispositivo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escaneo_id        uuid NOT NULL REFERENCES escaneo(id) ON DELETE CASCADE,

  -- Identidad determinística (R12): mac normalizada, o ip si no hay mac
  identidad         text NOT NULL,
  mac               text,
  ip                inet NOT NULL,

  hostname          text,
  fqdn              text,
  fabricante        text,
  modelo            text,
  serial            text,
  tipo              text NOT NULL DEFAULT 'desconocido' CHECK (tipo IN (
                      'servidor', 'workstation', 'notebook', 'switch',
                      'router', 'firewall', 'impresora', 'camara', 'nas',
                      'ups', 'telefonia', 'movil', 'virtual', 'desconocido'
                    )),

  so_familia        text,
  so_nombre         text,
  so_version        text,
  so_arquitectura   text,

  cpu_descripcion   text,
  memoria_mb        integer,
  disco_total_gb    integer,

  visto_at          timestamptz,
  fuente            text NOT NULL DEFAULT 'open-audit',
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,

  revision          text NOT NULL DEFAULT 'sin_revisar' CHECK (revision IN (
                      'sin_revisar', 'confirmado', 'descartado', 'fusionado'
                    )),
  revisado_por      uuid REFERENCES app_user(id) ON DELETE SET NULL,
  revisado_at       timestamptz,
  nota_tecnico      text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_dispositivo_identidad_uq UNIQUE (escaneo_id, identidad),
  CONSTRAINT escaneo_dispositivo_mac_ck CHECK (
    mac IS NULL OR mac ~ '^[0-9a-f]{12}$'
  ),
  CONSTRAINT escaneo_dispositivo_memoria_ck CHECK (
    memoria_mb IS NULL OR memoria_mb > 0
  ),
  CONSTRAINT escaneo_dispositivo_revision_ck CHECK (
    revision = 'sin_revisar'
    OR (revisado_por IS NOT NULL AND revisado_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS escaneo_dispositivo_escaneo_idx
  ON escaneo_dispositivo (escaneo_id);
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_mac_idx
  ON escaneo_dispositivo (mac) WHERE mac IS NOT NULL;
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_tipo_idx
  ON escaneo_dispositivo (escaneo_id, tipo);
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_revision_idx
  ON escaneo_dispositivo (escaneo_id, revision);
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_raw_gin
  ON escaneo_dispositivo USING gin (raw);

CREATE TABLE IF NOT EXISTS escaneo_software (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id  uuid NOT NULL REFERENCES escaneo_dispositivo(id) ON DELETE CASCADE,

  nombre          text NOT NULL,
  version         text,
  publisher       text,
  instalado_at    date,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_software_uq UNIQUE (dispositivo_id, nombre, version)
);

CREATE INDEX IF NOT EXISTS escaneo_software_dispositivo_idx
  ON escaneo_software (dispositivo_id);
CREATE INDEX IF NOT EXISTS escaneo_software_nombre_idx
  ON escaneo_software (lower(nombre));

CREATE TABLE IF NOT EXISTS escaneo_servicio (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id  uuid NOT NULL REFERENCES escaneo_dispositivo(id) ON DELETE CASCADE,

  puerto          integer NOT NULL,
  protocolo       text NOT NULL DEFAULT 'tcp'
                  CHECK (protocolo IN ('tcp', 'udp', 'sctp')),
  estado_puerto   text NOT NULL DEFAULT 'open',
  servicio        text,
  producto        text,
  version         text,
  banner          text,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_servicio_uq UNIQUE (dispositivo_id, puerto, protocolo),
  CONSTRAINT escaneo_servicio_puerto_ck CHECK (puerto BETWEEN 1 AND 65535)
);

CREATE INDEX IF NOT EXISTS escaneo_servicio_dispositivo_idx
  ON escaneo_servicio (dispositivo_id);
CREATE INDEX IF NOT EXISTS escaneo_servicio_puerto_idx
  ON escaneo_servicio (puerto, protocolo);
```

### Notas del esquema

- **`escaneo_consentimiento_ck`** es la versión condicionada (decisión de
  puerta): `pendiente` y `cancelado` pueden no tener consentimiento; el resto
  de los estados lo exigen completo. Un escaneo `cancelado` desde `pendiente`
  nunca corrió, por eso queda exento.
- **`ip inet`** (no `text`): comparación, ordenamiento y contención de subred
  nativos, útiles para el diff (#64).
- **`raw jsonb` + GIN**: consultar campos no modelados sin migración. Si el
  volumen crece, se evalúa `jsonb_path_ops`.
- **Sin FK a relevamiento manual**: no existe tabla destino hoy. La
  vinculación (y su FK) se diseña en #62.
- **`ON DELETE RESTRICT` en `tecnico_id`**: un técnico con escaneos no se
  puede borrar (el escaneo es registro de quién ejecutó). El resto del repo
  usa default `NO ACTION`; acá la restricción es semántica de auditoría.

## Tipos y validación — `src/lib/server/escaneos/schemas.ts`

Zod 3.25 (API verificada). Límites defensivos contra agente comprometido o
con bug: un dispositivo con 2000 entradas de software ya es sospechoso.

```ts
import { z } from 'zod';

export const escaneoEstado = z.enum([
  'pendiente', 'en_curso', 'sincronizando', 'completado', 'fallido', 'cancelado'
]);

export const dispositivoTipo = z.enum([
  'servidor', 'workstation', 'notebook', 'switch', 'router', 'firewall',
  'impresora', 'camara', 'nas', 'ups', 'telefonia', 'movil', 'virtual', 'desconocido'
]);

export const dispositivoRevision = z.enum([
  'sin_revisar', 'confirmado', 'descartado', 'fusionado'
]);

export const servicioProtocolo = z.enum(['tcp', 'udp', 'sctp']);

/** MAC en cualquier formato → 12 hex minúsculas (R15). */
export const macNormalizada = z
  .string()
  .transform((v) => v.replace(/[^0-9a-fA-F]/g, '').toLowerCase())
  .refine((v) => v.length === 12, { message: 'MAC inválida' });

export const softwareInput = z.object({
  nombre: z.string().min(1).max(500),
  version: z.string().max(200).nullish(),
  publisher: z.string().max(300).nullish(),
  instaladoAt: z.coerce.date().nullish(),
  raw: z.record(z.unknown()).default({})
});

export const servicioInput = z.object({
  puerto: z.number().int().min(1).max(65535),
  protocolo: servicioProtocolo.default('tcp'),
  estadoPuerto: z.string().max(50).default('open'),
  servicio: z.string().max(200).nullish(),
  producto: z.string().max(300).nullish(),
  version: z.string().max(200).nullish(),
  banner: z.string().max(2000).nullish(),
  raw: z.record(z.unknown()).default({})
});

export const dispositivoInput = z.object({
  mac: macNormalizada.nullish(),
  ip: z.string().ip(),
  hostname: z.string().max(300).nullish(),
  fqdn: z.string().max(500).nullish(),
  fabricante: z.string().max(300).nullish(),
  modelo: z.string().max(300).nullish(),
  serial: z.string().max(200).nullish(),
  tipo: dispositivoTipo.default('desconocido'),
  soFamilia: z.string().max(100).nullish(),
  soNombre: z.string().max(300).nullish(),
  soVersion: z.string().max(100).nullish(),
  soArquitectura: z.string().max(50).nullish(),
  cpuDescripcion: z.string().max(300).nullish(),
  memoriaMb: z.number().int().positive().nullish(),
  discoTotalGb: z.number().int().positive().nullish(),
  vistoAt: z.coerce.date().nullish(),
  fuente: z.string().max(50).default('open-audit'),
  raw: z.record(z.unknown()).default({}),
  software: z.array(softwareInput).max(2000).default([]),
  servicios: z.array(servicioInput).max(500).default([])
});

/** Identidad determinística (R12). */
export function identidadDispositivo(d: { mac?: string | null; ip: string }): string {
  return d.mac && d.mac.length === 12 ? d.mac : d.ip;
}

export const crearEscaneoInput = z.object({
  auditId: z.string().uuid(),
  etiqueta: z.string().max(200).nullish(),
  rangoObjetivo: z.string().min(1).max(200),
  agenteVersion: z.string().max(50),
  agenteHostname: z.string().max(300).nullish(),
  // Consentimiento opcional al crear (decisión puerta); obligatorio para en_curso (R8)
  consentimientoPor: z.string().min(1).max(300).nullish(),
  consentimientoAt: z.coerce.date().nullish()
});

export const registrarConsentimientoInput = z.object({
  consentimientoPor: z.string().min(1).max(300),
  consentimientoAt: z.coerce.date()
});

export type DispositivoInput = z.infer<typeof dispositivoInput>;
export type CrearEscaneoInput = z.infer<typeof crearEscaneoInput>;
```

## Errores de dominio — `src/lib/server/escaneos/errors.ts`

Siguiendo `docs/conventions.md` (clases tipadas con `code`):

| Error | code | Cuándo |
|---|---|---|
| `AuditNotFoundError` (reusar si ya existe en dominio) | `AUDIT_NOT_FOUND` | `crearEscaneo` con auditoría ajena/inexistente |
| `EscaneoNotFoundError` | `ESCANEO_NOT_FOUND` | id inexistente o de otra empresa (R27) |
| `EscaneoNoMutableError` | `ESCANEO_NO_MUTABLE` | escritura sobre estado terminal (R4) |
| `TransicionInvalidaError` | `TRANSICION_INVALIDA` | transición fuera de la máquina (R10) |
| `ConsentimientoFaltanteError` | `CONSENTIMIENTO_FALTANTE` | transición a `en_curso` sin consentimiento (R8) |

## Repositorio — `src/lib/server/escaneos/repo.ts`

**Regla estructural (R26/R27):** toda función exportada recibe `empresaId`
como primer parámetro y lo aplica en la misma query vía join con `audit`.
Única excepción: `escaneosColgados()` (job de sistema, R7, no expuesta a
rutas). La autorización (admin / `techIsAssigned`) vive en la capa de rutas
— patrón #57 — y es responsabilidad de #60/#62.

```ts
export async function crearEscaneo(
  empresaId: string,
  tecnicoId: string,
  input: CrearEscaneoInput
) {
  const tieneConsentimiento = input.consentimientoPor != null;
  const [row] = await sql`
    INSERT INTO escaneo (
      audit_id, tecnico_id, etiqueta, rango_objetivo,
      agente_version, agente_hostname,
      consentimiento_otorgado, consentimiento_por, consentimiento_at
    )
    SELECT
      a.id, ${tecnicoId}, ${input.etiqueta ?? null}, ${input.rangoObjetivo},
      ${input.agenteVersion}, ${input.agenteHostname ?? null},
      ${tieneConsentimiento}, ${input.consentimientoPor ?? null},
      ${input.consentimientoAt ?? null}
    FROM audit a
    WHERE a.id = ${input.auditId}
      AND a.empresa_id = ${empresaId}
    RETURNING *
  `;
  if (!row) throw new AuditNotFoundError();
  return row;
}
```

El `INSERT ... SELECT FROM audit WHERE empresa_id = ...` es el patrón clave:
si la auditoría no pertenece a la empresa, no inserta nada. El scope queda
garantizado por la query, no por un chequeo previo que alguien puede olvidar.

```ts
export async function upsertDispositivos(
  empresaId: string,
  escaneoId: string,
  dispositivos: DispositivoInput[]
) {
  return sql.begin(async (tx) => {
    // Pertenencia (R27) + mutabilidad (R4) + serialización de chunks
    const [esc] = await tx`
      SELECT e.id
      FROM escaneo e
      JOIN audit a ON a.id = e.audit_id
      WHERE e.id = ${escaneoId}
        AND a.empresa_id = ${empresaId}
        AND e.estado IN ('en_curso', 'sincronizando')
      FOR UPDATE
    `;
    if (!esc) throw new EscaneoNoMutableError();

    for (const d of dispositivos) {
      const [dev] = await tx`
        INSERT INTO escaneo_dispositivo ${tx({
          escaneo_id: escaneoId,
          identidad: identidadDispositivo(d),
          mac: d.mac ?? null,
          ip: d.ip,
          hostname: d.hostname ?? null,
          fabricante: d.fabricante ?? null,
          modelo: d.modelo ?? null,
          serial: d.serial ?? null,
          tipo: d.tipo,
          so_familia: d.soFamilia ?? null,
          so_nombre: d.soNombre ?? null,
          so_version: d.soVersion ?? null,
          memoria_mb: d.memoriaMb ?? null,
          visto_at: d.vistoAt ?? null,
          fuente: d.fuente,
          raw: d.raw
        })}
        ON CONFLICT (escaneo_id, identidad) DO UPDATE SET
          ip         = EXCLUDED.ip,
          hostname   = COALESCE(EXCLUDED.hostname, escaneo_dispositivo.hostname),
          so_nombre  = COALESCE(EXCLUDED.so_nombre, escaneo_dispositivo.so_nombre),
          raw        = EXCLUDED.raw,
          updated_at = now()
        RETURNING id
      `;

      if (d.software.length) {
        await tx`
          INSERT INTO escaneo_software ${tx(
            d.software.map((s) => ({
              dispositivo_id: dev.id,
              nombre: s.nombre,
              version: s.version ?? null,
              publisher: s.publisher ?? null,
              raw: s.raw
            }))
          )}
          ON CONFLICT (dispositivo_id, nombre, version) DO NOTHING
        `;
      }

      if (d.servicios.length) {
        await tx`
          INSERT INTO escaneo_servicio ${tx(
            d.servicios.map((s) => ({
              dispositivo_id: dev.id,
              puerto: s.puerto,
              protocolo: s.protocolo,
              estado_puerto: s.estadoPuerto,
              servicio: s.servicio ?? null,
              producto: s.producto ?? null,
              version: s.version ?? null,
              raw: s.raw
            }))
          )}
          ON CONFLICT (dispositivo_id, puerto, protocolo) DO UPDATE SET
            estado_puerto = EXCLUDED.estado_puerto,
            servicio = COALESCE(EXCLUDED.servicio, escaneo_servicio.servicio),
            version  = COALESCE(EXCLUDED.version, escaneo_servicio.version)
        `;
      }
    }

    await tx`
      UPDATE escaneo SET
        dispositivos_detectados = (
          SELECT count(*) FROM escaneo_dispositivo WHERE escaneo_id = ${escaneoId}
        ),
        updated_at = now()
      WHERE id = ${escaneoId}
    `;
  });
}
```

- **`COALESCE` intencional (R18):** un reintento parcial del agente no borra
  datos de chunks anteriores. `NULL` entrante = "no lo sé", no "está vacío".
- **`FOR UPDATE`** serializa chunks concurrentes del mismo escaneo
  (reintentos por conexión mala pueden solaparse).

### Funciones restantes (mismo patrón de scope)

| Función | Propósito | R |
|---|---|---|
| `listarEscaneosDeAuditoria(empresaId, auditId)` | Listado para UI | R26 |
| `obtenerEscaneo(empresaId, escaneoId)` | Detalle + métricas | R26 |
| `registrarConsentimiento(empresaId, escaneoId, input)` | Completa consentimiento en `pendiente` | R8 |
| `cambiarEstadoEscaneo(empresaId, escaneoId, estado, errorDetalle?)` | Máquina de estados (valida TRANSICIONES + consentimiento para `en_curso`) | R8, R10 |
| `listarDispositivos(empresaId, escaneoId, filtros)` | Paginado, filtro por tipo y revisión | R25, R26 |
| `marcarRevision(empresaId, dispositivoId, revision, usuarioId, nota?)` | Consumido por #62 | R23, R24 |
| `escaneosColgados()` | Job de limpieza, >24h en `en_curso`/`sincronizando`. Sin `empresaId`: función de sistema, no expuesta a rutas | R7 |

## Máquina de estados

```
pendiente ──> en_curso ──> sincronizando ──> completado
    │             │              │
    │             ▼              ▼
    │          fallido        fallido
    ▼
cancelado
```

```ts
export const TRANSICIONES: Record<string, string[]> = {
  pendiente:     ['en_curso', 'cancelado'],
  en_curso:      ['sincronizando', 'fallido', 'cancelado'],
  sincronizando: ['completado', 'fallido'],
  completado:    [],
  fallido:       [],
  cancelado:     []
};
```

`completado`, `fallido` y `cancelado` son terminales. Un re-escaneo genera un
escaneo nuevo, nunca reabre uno cerrado — preserva el histórico del que
depende #64. Transición a `en_curso` exige consentimiento completo (R8);
transición a `completado`/`fallido` setea `finalizado_at`; a `en_curso`
setea `iniciado_at`.

## Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| **App aparte para datos de escaneo** | Los datos nacen/mueren con la auditoría; app aparte = auth duplicada + sync entre bases + joins cross-app para el informe. La separación real ya existe: el agente (#61). Decisión de puerta 2026-08-27. |
| **Consentimiento rígido (CHECK siempre true)** | Descartado por el humano en puerta: el flujo real crea el escaneo antes de capturar consentimiento. Se adopta condicionado por estado. |
| **ENUMs nativos de Postgres** | Convención del repo es `text + CHECK`; agregar valores a un ENUM nativo exige `ALTER TYPE` y complica migraciones. |
| **Trigger `set_actualizado_at()`** | No existe en el repo; la convención es `updated_at = now()` manual. Crear la función para 2 tablas rompe homogeneidad. |
| **FK a `relevamiento_items` en esta migración** | La tabla no existe; el relevamiento manual es `audit_response`/`template_item`. Se difiere a #62. |
| **Scope por empresa como mecanismo de autorización** | AuditApp no es multi-tenant; `empresa` es el cliente auditado. La amenaza real es IDOR entre auditorías → se resuelve con rol + `techIsAssigned` (#33/#57) en rutas. Empresa queda como defensa en profundidad query-level. |
| **Purga de `raw` programada** | Decisión de puerta: sin purga. Volumen trivial; valor histórico alto para #64. |

## Tests — `tests/escaneos.test.ts`

Contra Postgres real en Docker (test DB), no mocks: el valor de esta feature
está en las constraints. Fixtures: empresa + audit + técnico por test.

| Caso | R |
|---|---|
| Happy path: crear escaneo con consentimiento, chunk completo con software y servicios | R1, R2, R11, R19, R21, R28 |
| Crear escaneo sin consentimiento queda `pendiente`; transición a `en_curso` rechazada; tras `registrarConsentimiento`, permitida | R8, R9 |
| Mismo dispositivo dos veces en el mismo escaneo → actualiza, no duplica | R13 |
| Campo en `NULL` tras valor → conserva el previo | R18 |
| MAC con separadores/mayúsculas → persiste normalizada; MAC inválida → rechazo | R15 |
| `upsertDispositivos` con `empresaId` ajeno → `ESCANEO_NO_MUTABLE`, cero escrituras | R27 |
| `upsertDispositivos` sobre escaneo `completado` → error, cero escrituras | R4 |
| Borrar auditoría → cascada completa (escaneo, dispositivos, software, servicios) | R5 |
| Transición inválida (`pendiente → completado`) → rechazada | R10 |
| Dos `upsertDispositivos` concurrentes → sin duplicados ni deadlock | R13 |
| `dispositivos_detectados` = conteo real tras cada chunk | R28 |
| `escaneosColgados` devuelve solo >24h en `en_curso`/`sincronizando` | R7 |
| `marcarRevision` registra quién/cuándo; CHECK impide revisión sin revisor | R23, R24 |
| Payload `raw` se persiste sin transformación y es consultable vía GIN | R14 |

## Gates

`pnpm test -- tests/escaneos.test.ts` · `pnpm run check` · `pnpm run build` · `./init.sh`
