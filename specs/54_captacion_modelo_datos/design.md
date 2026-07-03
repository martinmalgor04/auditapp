# Design — #54 54_captacion_modelo_datos

## Alcance

Contrato de datos de la máquina de captación en el Postgres de auditapp, con auditapp como única
autoridad de DDL. Una migración idempotente crea siete tablas (`captacion_prospecto_meta`,
`content_asset`, `campaign`, `sequence_step`, `message`, `email_event`, `suppression_list`), extiende
`empresa_evento.tipo` con `'email'`, actualiza la derivación de estado (#23) para contar el email
como contacto (paridad TS↔SQL), y agrega la vista de lectura `captacion_prospecto`. La **`captacion-app`**
(Python, Dokploy) consume estas tablas vía DML sobre el mismo `DATABASE_URL`. #54 NO incluye lógica
de captación ni UI/endpoints en auditapp.

| Incluido (#54) | Excluido (va en `captacion-app`) |
|---|---|
| Migración: 7 tablas + índices + CHECKs + FKs a `empresa`/`app_user` (R1–R8) | Scraping, generación con Claude, secuencias en ejecución |
| `empresa_evento.tipo += 'email'` (R9) | Envío real, dominios/warmup, deliverability |
| Derivación: `'email'` cuenta como contacto, paridad SQL↔TS (R10) | Tracking de webhooks, panel de aprobación por lote |
| Vista `captacion_prospecto` (R11) | Endpoints HTTP de captación (integración por DB) |
| Helpers de lectura en `db/` para la ficha de empresa (R13) | Migrar el scraper a `empresa` (decisión abierta) |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `02_modelo_datos` (#2) | Runner `runMigrations` (`src/lib/server/db/migrate.ts`), patrón `migrations/NNN_*.sql`, cliente `sql` postgres.js, `schema_migration` |
| `23_crm_empresa_unificada` (#23) | `empresa` (tabla base), `empresa_evento`, `deriveEmpresaEstado`/`EstadoInputs` (`src/lib/server/crm/empresa-estado.ts`), `estadoSelectSql` (`src/lib/server/db/empresa.ts`), test de paridad `tests/empresa-estado.test.ts` |
| `03_auth_roles` (#3) | `app_user(id)` para `created_by`/`aprobado_by` |

## Arquitectura — dos apps, un Postgres

```
┌────────────────────────┐            ┌─────────────────────────────┐
│ auditapp (SvelteKit/TS)│            │ captacion-app (Python, Dokploy)│
│ · DUEÑO del DDL (#54)   │            │ · scraper + sysmkt (reuso)   │
│ · CRM/auditorías        │            │ · genera con Claude          │
│ · ficha empresa muestra │            │ · campañas/secuencias        │
│   actividad de email    │            │ · envío cold + tracking      │
│   (timeline #23 + R13)  │            │ · panel de aprobación (UI)   │
└───────────┬────────────┘            └──────────────┬──────────────┘
            │ migra (DDL) + lee            DML: insert/select/update
            │                                          │
            └──────────────┬───────────────────────────┘
                  ┌─────────▼──────────┐
                  │ Postgres (Dokploy)  │  public.empresa · empresa_evento
                  │ DATABASE_URL único  │  + captacion_prospecto_meta · content_asset
                  └─────────────────────┘  + campaign · sequence_step · message
                                           + email_event · suppression_list
```

Flujo de datos (de prospecto a contactado):

```
scraper (captacion-app)
   └─ upsert empresa(relacion='prospecto') + captacion_prospecto_meta   (DML)
generación (captacion-app)
   └─ insert content_asset(version) + message(estado='borrador', confianza)
aprobación por lote (captacion-app UI)
   └─ message.estado='aprobado' (aprobado_by/at)
envío (captacion-app → proveedor)
   └─ message.estado='enviado' (provider_message_id, enviado_at)
webhook proveedor (captacion-app)
   └─ insert email_event('delivered'|'open'|'click'|'bounce'|'reply'…)
   └─ al 'delivered': insert empresa_evento(tipo='email', texto='Cold email entregado: …')
                       └─ deriveEmpresaEstado ⇒ 'contactada'  (R10, visible en auditapp)
   └─ al 'unsubscribe'/'bounce' duro: insert suppression_list(email, motivo)
```

**Por qué la integración es por DB y no por HTTP:** decisión de puerta 1/2. Mantiene las apps
desacopladas en runtime (cada una se despliega/escala sola) y usa Postgres como contrato. auditapp
no necesita saber de la `captacion-app`: solo lee `message`/`empresa_evento` para mostrar la ficha.

**Por qué `'email'` como `empresa_evento` (y no un estado nuevo):** reusa la timeline y la
derivación de #23 sin agregar máquina de estados. El cold email entregado aparece en la actividad de
la empresa igual que una llamada o reunión, y mueve el estado derivado a `contactada` sin override
manual. El funnel `crm_lead` (`lead→contactado→…`) queda deprecado; el estado vigente es el derivado
de `empresa` (#23).

## Cambios de schema — migración `0NN_captacion_modelo_datos.sql`

(`0NN` = siguiente disponible tras `028_notificaciones_push_pwa.sql`.)

```sql
-- 0NN_captacion_modelo_datos.sql — Feature #54. Idempotente. Anclado en `empresa` (#23).
-- DDL propiedad de auditapp; la captacion-app hace solo DML. Runner envuelve en sql.begin.

-- ── 1) Metadata de prospección (1:1 con empresa). No infla `empresa` ni la vista `client`.
CREATE TABLE IF NOT EXISTS captacion_prospecto_meta (
  empresa_id     uuid PRIMARY KEY REFERENCES empresa(id) ON DELETE CASCADE,
  icp_score      int CHECK (icp_score IS NULL OR icp_score BETWEEN 0 AND 100),
  segmento       text CHECK (segmento IS NULL OR segmento IN ('A','B','C')),
  buy_signals    jsonb NOT NULL DEFAULT '[]'::jsonb,
  fuente_scraper text,
  url_origen     text,
  fecha_crawl    timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 2) Biblioteca de contenido versionada y multi-tipo.
CREATE TABLE IF NOT EXISTS content_asset (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  version     int  NOT NULL CHECK (version >= 1),
  tipo        text NOT NULL CHECK (tipo IN (
                'cold_email','linkedin','ig','newsletter','vsl','informe','propuesta','snippet')),
  estado      text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','aprobado','archivado')),
  titulo      text,
  segmento    text CHECK (segmento IS NULL OR segmento IN ('A','B','C')),
  asunto      text,
  cuerpo      text NOT NULL,
  cuerpo_html text,
  tags        text[] NOT NULL DEFAULT '{}',
  meta        jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);
CREATE INDEX IF NOT EXISTS content_asset_tipo_idx     ON content_asset (tipo);
CREATE INDEX IF NOT EXISTS content_asset_slug_idx     ON content_asset (slug);

-- ── 3) Campañas.
CREATE TABLE IF NOT EXISTS campaign (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  objetivo   text,
  segmento   text CHECK (segmento IS NULL OR segmento IN ('A','B','C')),
  fuente     text CHECK (fuente IS NULL OR fuente IN ('scraper','crm','manual','otro')),
  estado     text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','activa','pausada','finalizada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 4) Pasos de secuencia.
CREATE TABLE IF NOT EXISTS sequence_step (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  paso         int  NOT NULL CHECK (paso >= 1),
  delay_dias   int  NOT NULL DEFAULT 0 CHECK (delay_dias >= 0),
  condicion    text NOT NULL DEFAULT 'siempre' CHECK (condicion IN ('siempre','si_no_abrio','si_no_respondio')),
  content_slug text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, paso)
);

-- ── 5) Mensajes (instancia a una empresa).
CREATE TABLE IF NOT EXISTS message (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  campaign_id         uuid REFERENCES campaign(id) ON DELETE SET NULL,
  sequence_step_id    uuid REFERENCES sequence_step(id) ON DELETE SET NULL,
  content_asset_id    uuid REFERENCES content_asset(id) ON DELETE SET NULL,
  to_email            text NOT NULL,
  asunto              text,
  cuerpo              text,
  estado              text NOT NULL DEFAULT 'borrador' CHECK (estado IN (
                        'borrador','aprobado','encolado','enviado','fallido','rebotado','descartado')),
  confianza           numeric(4,3) CHECK (confianza IS NULL OR (confianza >= 0 AND confianza <= 1)),
  necesita_revision   boolean NOT NULL DEFAULT false,
  motivo_revision     text,
  aprobado_by         uuid REFERENCES app_user(id),
  aprobado_at         timestamptz,
  provider_message_id text,
  enviado_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_empresa_idx   ON message (empresa_id);
CREATE INDEX IF NOT EXISTS message_campaign_idx  ON message (campaign_id);
CREATE INDEX IF NOT EXISTS message_estado_idx    ON message (estado);
CREATE INDEX IF NOT EXISTS message_provider_idx  ON message (provider_message_id);

-- ── 6) Eventos de tracking (append-only).
CREATE TABLE IF NOT EXISTS email_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN (
                'delivered','open','click','bounce','complaint','reply','unsubscribe','failed')),
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_event_message_idx ON email_event (message_id);
CREATE INDEX IF NOT EXISTS email_event_tipo_idx    ON email_event (tipo);

-- ── 7) Lista de supresión (opt-out / bounces). Unicidad case-insensitive por email.
CREATE TABLE IF NOT EXISTS suppression_list (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  motivo     text NOT NULL CHECK (motivo IN ('unsubscribe','hard_bounce','complaint','manual')),
  empresa_id uuid REFERENCES empresa(id) ON DELETE SET NULL,
  nota       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppression_email_key ON suppression_list (lower(email));

-- ── 8) empresa_evento admite 'email' (idempotente: drop+add del CHECK).
ALTER TABLE empresa_evento DROP CONSTRAINT IF EXISTS empresa_evento_tipo_check;
ALTER TABLE empresa_evento ADD  CONSTRAINT empresa_evento_tipo_check
  CHECK (tipo IN ('llamada','reunion','nota','cambio_estado','sistema','email'));

-- ── 9) Vista de lectura para la captacion-app (selección sin tocar crm_lead).
--   Excluye emails en suppression_list. Estado derivado se reusa de empresa.ts del lado app;
--   acá se expone lo necesario para seleccionar a quién contactar.
CREATE OR REPLACE VIEW captacion_prospecto AS
SELECT e.id AS empresa_id, e.razon_social, e.email, e.telefono, e.rubro, e.provincia,
       e.relacion, e.fuente,
       m.icp_score, m.segmento, m.buy_signals, m.fuente_scraper, m.url_origen, m.fecha_crawl
FROM empresa e
LEFT JOIN captacion_prospecto_meta m ON m.empresa_id = e.id
WHERE e.relacion = 'prospecto'
  AND e.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM suppression_list s WHERE lower(s.email) = lower(e.email));
```

Idempotencia: `CREATE TABLE/INDEX IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, y el CHECK de
`empresa_evento` con `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`. Re-ejecutable sin error.

## Cambio en la derivación de estado (#23) — R10

`src/lib/server/crm/empresa-estado.ts` y `src/lib/server/db/empresa.ts` se editan **juntos** (política
de reconciliación #23):

- **TS** (`empresa-estado.ts`): el comentario de `EstadoInputs.hasContactEvent` pasa a
  "empresa_evento de tipo llamada/reunion/nota/email". La lógica de `deriveEmpresaEstado` no cambia
  (ya consume el booleano `hasContactEvent`); lo que cambia es **cómo se computa** ese booleano.
- **SQL** (`empresa.ts`, `estadoSelectSql`/CTE): el predicado que calcula `hasContactEvent` suma
  `'email'` al `tipo IN (...)`. El test de paridad `tests/empresa-estado.test.ts` se extiende con un
  caso `tipo='email'`.

Decisión: tratar `'email'` como contacto (igual que `llamada/reunion/nota`) y NO como `'sistema'`
(que no cuenta), porque un cold email entregado SÍ es un contacto saliente real con el prospecto.

## Archivos a crear/modificar (auditapp)

### Migración y DB

| Archivo | Propósito |
|---|---|
| `migrations/0NN_captacion_modelo_datos.sql` (nuevo) | 7 tablas + índices + CHECKs + FKs + `empresa_evento.tipo += 'email'` + vista `captacion_prospecto` (R1–R9, R11) |
| `src/lib/server/db/empresa.ts` (extender) | `estadoSelectSql`: sumar `'email'` al predicado `hasContactEvent` (R10) |
| `src/lib/server/db/captacion.ts` (nuevo) | Helpers de lectura que auditapp consume: `listMessagesByEmpresa(empresaId)`; tipos `MessageRow` (R13). Escritura = `captacion-app`, no aquí |

### Dominio

| Archivo | Cambio |
|---|---|
| `src/lib/server/crm/empresa-estado.ts` (extender) | Comentario de `hasContactEvent` → incluye `'email'` (R10). Sin cambio de lógica de `deriveEmpresaEstado` |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/captacion-schema.test.ts` (nuevo) | R1–R9, R11, R12 (migración 2x idempotente; columnas/CHECK/FK/unique de las 7 tablas; `empresa_evento` `tipo='email'`; vista filtra supresión; `crm_lead` intacta) |
| `tests/captacion-db.test.ts` (nuevo) | R13 (`listMessagesByEmpresa`; timeline de empresa incluye `tipo='email'`) |
| `tests/empresa-estado.test.ts` (extender) | R10 (un evento `tipo='email'` deriva `contactada`; paridad SQL↔TS con el nuevo tipo) |

## Firmas principales

```typescript
// src/lib/server/db/captacion.ts
export type MessageEstado =
  | 'borrador' | 'aprobado' | 'encolado' | 'enviado' | 'fallido' | 'rebotado' | 'descartado';

export type MessageRow = {
  id: string;
  empresaId: string;
  campaignId: string | null;
  toEmail: string;
  asunto: string | null;
  estado: MessageEstado;
  confianza: number | null;
  necesitaRevision: boolean;
  enviadoAt: Date | null;
  createdAt: Date;
};

/** Mensajes de captación de una empresa, recientes primero. Solo lectura (auditapp). */
export async function listMessagesByEmpresa(empresaId: string): Promise<MessageRow[]>;
```

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Schema `captacion` propio, migrado por la `captacion-app` | Decisión de puerta 2: una sola autoridad de DDL (auditapp/`public`). Evita dos migradores sobre la misma DB y FKs cross-schema |
| Comunicación auditapp ↔ captacion-app por HTTP/API | Decisión de puerta 1: integración por DB compartida; menos acoplamiento en runtime |
| Anclar `message`/prospectos en `crm_lead` | `crm_lead` está deprecada (#23/017). La entidad canónica es `empresa` |
| Columnas de captación (score/segmento/signals) dentro de `empresa` | Inflaría la tabla base y la vista `client` legacy. Tabla 1:1 `captacion_prospecto_meta` aísla la metadata |
| Estado de funnel propio (tabla `lead_funnel`) para captación | Duplicaría el estado derivado de #23. Se reusa `empresa_evento` + derivación; el cold email es un evento de contacto más |
| `'sistema'` para registrar el email enviado | `'sistema'` no cuenta como contacto en la derivación; un cold email entregado SÍ es contacto → tipo `'email'` dedicado (R9/R10) |
| Plantillas/contenido como archivos `.md` en repo (estado actual de `sysmkt`) | Sin versionado consultable ni reuso cross-formato; `content_asset` da versión, estado y trazabilidad en DB |
| Tabla única `email_log` (#49) para tracking cold | Distinta semántica: `email_log` es traza transaccional append-only de avisos internos. Cold email necesita `message` (estado/aprobación/proveedor) + `email_event` (open/click/bounce/reply) |

## Open questions (puerta humana) — PENDIENTES (no bloquean #54)

1. **Proveedor de envío cold** (SaaS vs SMTP self-hosted) — se decide en la `captacion-app`. El
   modelo `message.provider_message_id` + `email_event` sirve a ambos.
2. **Dominio**: subdominios + warmup vs root de `auditoriaserviciosysistemas.com.ar` — `captacion-app`.
3. **Migrar el scraper a `empresa`** (vs seguir en `crm_lead`) — feature de prospección de la
   `captacion-app`. #54 ya deja `empresa` + `captacion_prospecto_meta` listos para recibirlos.
