# Requirements — #54 54_captacion_modelo_datos

> **Modelo de datos compartido de la máquina de captación**, en el mismo Postgres de auditapp y
> con auditapp como **única autoridad de DDL** (migraciones `0NN_*.sql` en su runner). Crea las
> tablas que una **segunda app (`captacion-app`, Python, en Dokploy)** lee/escribe conectándose al
> mismo `DATABASE_URL` SIN correr DDL: biblioteca de contenido versionada, campañas, secuencias,
> mensajes (instancias de cold email), eventos de email (open/click/bounce/reply), lista de
> supresión (opt-out/bounces) y metadata de prospección del scraper sobre `empresa`. Ancla todo en
> la **entidad canónica `empresa`** (#23), NO en `crm_lead` (deprecada por #23/017). Integra los
> envíos con el funnel de seguimiento: un cold email entregado cuenta como contacto y mueve la
> empresa a `contactada` (derivación de #23, paridad TS↔SQL).
>
> Esta feature es **solo el contrato de datos** (DDL + glue de derivación de estado + vista de
> lectura). La lógica que llena estas tablas (scraping, generación con Claude, orquestación de
> secuencias, envío, tracking, panel de aprobación) vive en la `captacion-app` y se especifica en su
> propio repo — **fuera de alcance de #54**.
>
> **Decisiones de puerta (Martín, 2026-06-30), spec firme — no reabrir:**
> 1. **Dos apps, un Postgres.** El scraper y la automatización de captación van en una **app
>    separada** dentro de Dokploy (`captacion-app`, Python — reusa `scraper/` + `sysmkt/`), para no
>    mezclarse con auditapp. El **punto de integración es la DB compartida**, no HTTP entre apps.
> 2. **auditapp es dueño del DDL.** Todas las tablas nuevas son migraciones de auditapp en schema
>    `public` (una sola fuente de verdad de schema). La `captacion-app` conecta al mismo Postgres y
>    hace DML (insert/select/update) pero **nunca DDL ni migraciones**.
> 3. **Anclaje en `empresa`.** Toda FK de prospecto/cliente apunta a `empresa(id)` (#23). `crm_lead`
>    / `crm_lead_event` quedan intactas como red de rollback (#23/017): #54 **no las toca**.
> 4. **El panel de aprobación por lote vive en la `captacion-app`** (no en auditapp). #54 no agrega
>    UI ni endpoints de captación a auditapp.
> 5. **Dominio de envío** = `auditoriaserviciosysistemas.com.ar` (contexto). El **envío/tracking**
>    es feature de la `captacion-app`; #54 solo modela `message`/`email_event`/`suppression_list`.
>
> Depende de: `02_modelo_datos` (#2, done) — runner `runMigrations` (`src/lib/server/db/migrate.ts`),
> patrón `migrations/NNN_*.sql`, cliente `sql` postgres.js; `23_crm_empresa_unificada` (#23, done) —
> entidad `empresa`, `empresa_evento`, `deriveEmpresaEstado`/`estadoSelectSql` y su test de paridad
> SQL↔TS (`src/lib/server/crm/empresa-estado.ts`, `src/lib/server/db/empresa.ts`,
> `tests/empresa-estado.test.ts`); `03_auth_roles` (#3) — `app_user` (autor/aprobador). NO incluye:
> envío real, generación con Claude, scraping, secuencias en ejecución, ni UI (todo en `captacion-app`).

## Contrato de datos (referenciado por las features de la `captacion-app`)

Tablas nuevas en `public` (todas con FK a `empresa`/`app_user` según corresponda):

| Tabla | Rol |
|---|---|
| `captacion_prospecto_meta` | Metadata de prospección del scraper sobre una `empresa` (score ICP, segmento A/B/C, buy signals, fuente, crawl). 1:1 con `empresa`. |
| `content_asset` | Biblioteca de contenido **versionada y multi-tipo** (cold_email, linkedin, ig, newsletter, vsl, informe, propuesta, snippet). |
| `campaign` | Iniciativa de captación (objetivo, segmento, fuente, estado). |
| `sequence_step` | Paso N de una campaña (delay, condición de avance, asset a usar). |
| `message` | Instancia de mensaje a una `empresa` (asunto/cuerpo, estado de envío, confianza/revisión, ids del proveedor). |
| `email_event` | Evento de tracking sobre un `message` (delivered/open/click/bounce/complaint/reply/unsubscribe/failed). |
| `suppression_list` | Opt-outs y hard bounces por email (cumplimiento legal AR / Ley 25.326). |

Vista de lectura: `captacion_prospecto` (join `empresa` + `captacion_prospecto_meta`, para que la
`captacion-app` consulte prospectos a contactar sin reimplementar el join).

Cambio sobre objeto existente: `empresa_evento.tipo` suma el valor `'email'`; la derivación de
estado (#23) cuenta `'email'` como evento de contacto.

## R1 — Migración SQL idempotente crea las tablas de captación

El sistema DEBE incluir la migración `0NN_captacion_modelo_datos.sql` (`0NN` = siguiente número
disponible al implementar, tras `028_notificaciones_push_pwa.sql`) que cree
`captacion_prospecto_meta`, `content_asset`, `campaign`, `sequence_step`, `message`, `email_event`
y `suppression_list` con `CREATE TABLE IF NOT EXISTS`, índices `IF NOT EXISTS` y constraints
declarados en design §Schema. La migración DEBE ser re-ejecutable sin error (envuelta por el runner
en `sql.begin`, atómica).

**Verificación:** `tests/captacion-schema.test.ts` — aplicar la migración dos veces no falla; las
siete tablas existen con sus columnas, CHECKs y FKs declarados.

## R2 — `captacion_prospecto_meta`: metadata de prospección 1:1 con `empresa`

El sistema DEBE crear `captacion_prospecto_meta` con PK `empresa_id` (FK → `empresa(id)` ON DELETE
CASCADE), `icp_score` (int, CHECK 0–100, nullable), `segmento` (text, CHECK `A|B|C`, nullable),
`buy_signals` (jsonb, default `'[]'`), `fuente_scraper` (text), `url_origen` (text), `fecha_crawl`
(timestamptz), `updated_at` (timestamptz default `now()`). La relación 1:1 garantiza que la
metadata de captación NO infle la tabla `empresa` ni rompa a sus lectores legacy (vista `client`).

**Verificación:** `tests/captacion-schema.test.ts` — insertar metadata para una `empresa` existente
funciona; un segundo insert con el mismo `empresa_id` viola la PK; borrar la `empresa` cascada la
metadata; `icp_score = 101` o `segmento = 'D'` son rechazados por CHECK.

## R3 — `content_asset`: biblioteca de contenido versionada y multi-tipo

El sistema DEBE crear `content_asset` con: `id` (uuid PK), `slug` (text, identificador estable
entre versiones), `version` (int, CHECK `>= 1`), `tipo` (text, CHECK en `cold_email|linkedin|ig|
newsletter|vsl|informe|propuesta|snippet`), `estado` (text, CHECK `borrador|aprobado|archivado`,
default `borrador`), `titulo` (text), `segmento` (text, CHECK `A|B|C`, nullable), `asunto` (text,
nullable — solo emails), `cuerpo` (text NOT NULL), `cuerpo_html` (text, nullable), `tags` (text[],
default `'{}'`), `meta` (jsonb, default `'{}'` — confianza, señal usada, modelo, prompt_version),
`created_by` (uuid FK → `app_user(id)`, nullable — autor humano; NULL = generado por servicio),
`created_at`/`updated_at` (timestamptz). DEBE imponer `UNIQUE (slug, version)`.

**Verificación:** `tests/captacion-schema.test.ts` — dos filas con igual `(slug, version)` violan el
unique; `version = 0`, `tipo` o `estado` fuera del CHECK son rechazados; `cuerpo` NULL es rechazado.

## R4 — `campaign`: iniciativa de captación

El sistema DEBE crear `campaign` con `id` (uuid PK), `nombre` (text NOT NULL), `objetivo` (text),
`segmento` (text, CHECK `A|B|C`, nullable), `fuente` (text, CHECK `scraper|crm|manual|otro`,
nullable), `estado` (text, CHECK `borrador|activa|pausada|finalizada`, default `borrador`),
`created_at`/`updated_at` (timestamptz).

**Verificación:** `tests/captacion-schema.test.ts` — crear una campaña con estado por defecto
`borrador`; `estado` o `fuente` fuera del CHECK son rechazados.

## R5 — `sequence_step`: pasos de una secuencia híbrida

El sistema DEBE crear `sequence_step` con `id` (uuid PK), `campaign_id` (uuid FK → `campaign(id)`
ON DELETE CASCADE), `paso` (int, CHECK `>= 1`), `delay_dias` (int, CHECK `>= 0`, default `0`),
`condicion` (text, CHECK `siempre|si_no_abrio|si_no_respondio`, default `siempre`),
`content_slug` (text — referencia el `content_asset.slug` a usar en ese paso), `created_at`. DEBE
imponer `UNIQUE (campaign_id, paso)`.

**Verificación:** `tests/captacion-schema.test.ts` — dos pasos con igual `(campaign_id, paso)`
violan el unique; borrar la campaña cascada sus pasos; `paso = 0`, `delay_dias < 0` o `condicion`
inválida son rechazados.

## R6 — `message`: instancia de mensaje a una empresa, con estado de envío

El sistema DEBE crear `message` con `id` (uuid PK), `empresa_id` (uuid FK → `empresa(id)` ON DELETE
CASCADE), `campaign_id` (uuid FK → `campaign(id)` ON DELETE SET NULL, nullable), `sequence_step_id`
(uuid FK → `sequence_step(id)` ON DELETE SET NULL, nullable), `content_asset_id` (uuid FK →
`content_asset(id)` ON DELETE SET NULL, nullable — qué versión se usó), `to_email` (text NOT NULL),
`asunto` (text), `cuerpo` (text), `estado` (text, CHECK `borrador|aprobado|encolado|enviado|
fallido|rebotado|descartado`, default `borrador`), `confianza` (numeric(4,3), CHECK 0–1, nullable),
`necesita_revision` (boolean, default `false`), `motivo_revision` (text), `aprobado_by` (uuid FK →
`app_user(id)`, nullable), `aprobado_at` (timestamptz, nullable), `provider_message_id` (text,
nullable — id del proveedor de envío, para casar webhooks de tracking), `enviado_at` (timestamptz,
nullable), `created_at`/`updated_at`. Índices en `empresa_id`, `campaign_id`, `estado` y
`provider_message_id`.

**Verificación:** `tests/captacion-schema.test.ts` — `estado`/`confianza` fuera de rango rechazados;
borrar la `empresa` cascada sus `message`; borrar una `campaign` deja `message.campaign_id` en NULL
(no borra el mensaje); índice por `provider_message_id` presente.

## R7 — `email_event`: tracking de un mensaje

El sistema DEBE crear `email_event` con `id` (uuid PK), `message_id` (uuid FK → `message(id)` ON
DELETE CASCADE), `tipo` (text, CHECK `delivered|open|click|bounce|complaint|reply|unsubscribe|
failed`), `detalle` (jsonb, default `'{}'` — url del click, motivo de bounce, etc.), `occurred_at`
(timestamptz NOT NULL), `created_at` (timestamptz default `now()`). Índices en `message_id` y `tipo`.
La tabla es **append-only** (sin `archived_at`): es la traza de tracking.

**Verificación:** `tests/captacion-schema.test.ts` — `tipo` fuera del CHECK rechazado; borrar el
`message` cascada sus eventos; varios eventos por mensaje permitidos.

## R8 — `suppression_list`: opt-out y bounces duros (cumplimiento legal)

El sistema DEBE crear `suppression_list` con `id` (uuid PK), `email` (text NOT NULL), `motivo`
(text, CHECK `unsubscribe|hard_bounce|complaint|manual`), `empresa_id` (uuid FK → `empresa(id)` ON
DELETE SET NULL, nullable), `nota` (text), `created_at` (timestamptz default `now()`). DEBE imponer
unicidad **case-insensitive** por email (`CREATE UNIQUE INDEX ... ON suppression_list (lower(email))`).

**Verificación:** `tests/captacion-schema.test.ts` — insertar dos veces el mismo email (distinto
casing) viola el índice único; `motivo` fuera del CHECK rechazado.

## R9 — `empresa_evento.tipo` admite `'email'`

El sistema DEBE extender el CHECK de `empresa_evento.tipo` para incluir `'email'` (además de
`llamada|reunion|nota|cambio_estado|sistema`), de modo que la `captacion-app` registre cada cold
email entregado como evento en la **misma timeline** que ve auditapp, vía
`ALTER TABLE ... DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT ... CHECK (...)` idempotente.

**Verificación:** `tests/captacion-schema.test.ts` — insertar un `empresa_evento` con `tipo='email'`
funciona tras la migración; el CHECK anterior (sin `'email'`) ya no aplica; re-correr la migración
no falla.

## R10 — Un cold email entregado cuenta como contacto (paridad TS↔SQL)

El sistema DEBE actualizar la derivación de estado de `empresa` (#23) para que un `empresa_evento`
de tipo `'email'` cuente como **evento de contacto**: `deriveEmpresaEstado` (TS,
`src/lib/server/crm/empresa-estado.ts`) y el `CASE`/CTE de `estadoSelectSql` (SQL,
`src/lib/server/db/empresa.ts`) DEBEN tratar `tipo IN ('llamada','reunion','nota','email')` como
`hasContactEvent`, manteniendo la **paridad exacta SQL↔TS** (política de reconciliación #23). El
comentario de `EstadoInputs.hasContactEvent` DEBE actualizarse en el mismo cambio.

**Verificación:** `tests/empresa-estado.test.ts` (extender) — una `empresa` `prospecto` sin otros
eventos pasa de `sin_contactar` a `contactada` cuando tiene un `empresa_evento` `tipo='email'`; el
test de paridad SQL↔TS sigue verde con el nuevo tipo incluido.

## R11 — Vista de lectura `captacion_prospecto` para la `captacion-app`

El sistema DEBE crear la vista `captacion_prospecto` que una `empresa` (relación, datos de contacto,
estado derivado o reusable) con `captacion_prospecto_meta` (score, segmento, buy_signals), filtrando
o exponiendo al menos las empresas con `relacion = 'prospecto'`, para que la `captacion-app`
seleccione a quién contactar sin reimplementar el join ni leer `crm_lead`. La vista DEBE excluir (o
marcar) los emails presentes en `suppression_list`.

**Verificación:** `tests/captacion-schema.test.ts` — la vista devuelve un prospecto con su score y
segmento desde `captacion_prospecto_meta`; un prospecto cuyo email está en `suppression_list` no
aparece (o aparece marcado `suprimido = true`, según design §Vista).

## R12 — No romper lo existente (crm_lead, vista client, derivación)

La migración y los cambios de #54 NO DEBEN tocar `crm_lead`/`crm_lead_event` ni la vista `client`
(red de rollback #23/017), NO DEBEN alterar columnas existentes de `empresa`, y DEBEN dejar verde la
suite actual. Las nuevas FKs a `empresa(id)` apuntan a la **tabla base** (no a la vista `client`).

**Verificación:** `pnpm run check` + `pnpm test` verdes tras #54; `crm_lead` conserva su CHECK y
comentario de deprecación; los tests de #23 (`empresa`, derivación, paridad) siguen pasando.

## R13 — Capa de acceso mínima en auditapp (solo lo que auditapp consume)

El sistema DEBE proveer en `src/lib/server/db/` los helpers de lectura que **auditapp** necesite
para mostrar actividad de captación en la ficha de empresa (p.ej. `listMessagesByEmpresa(empresaId)`
y/o que los `empresa_evento` `tipo='email'` ya aparezcan en la timeline existente). La escritura de
`content_asset`/`campaign`/`message`/`email_event` la hace la `captacion-app`; auditapp NO expone
endpoints de captación (decisión de puerta 4).

**Verificación:** `tests/captacion-db.test.ts` — `listMessagesByEmpresa` devuelve los mensajes de
una empresa ordenados por fecha; la timeline de empresa (#23) incluye los eventos `tipo='email'`.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #54) | Requirements |
|---|---|
| Migración idempotente crea las 7 tablas de captación con FKs a `empresa` | R1–R8, R12 |
| Metadata de prospección 1:1 con `empresa`, sin inflar la tabla base | R2 |
| Biblioteca de contenido versionada multi-tipo + campañas + secuencias | R3, R4, R5 |
| `message` + `email_event` + `suppression_list` modelan envío/tracking/opt-out | R6, R7, R8 |
| Cold email entregado mueve la empresa a `contactada` (paridad TS↔SQL) | R9, R10 |
| Vista `captacion_prospecto` para selección sin tocar `crm_lead` | R11 |
| No rompe `crm_lead`/`client`/derivación; suite verde | R12 |
| Helpers de lectura para mostrar captación en la ficha de empresa | R13 |

## Fuera de alcance (no implementar en #54)

- **Toda la `captacion-app`**: scraping, generación con Claude, orquestación de secuencias, envío
  real, tracking de webhooks, panel de aprobación por lote, dominios/warmup/deliverability. Va en su
  propio repo y specs.
- Endpoints HTTP de captación en auditapp (decisión 4: integración por DB).
- Migrar el path del scraper `/api/crm/leads/batch` (escribe `crm_lead`) hacia `empresa`:
  **decisión de puerta abierta**, se resuelve en la feature de prospección de la `captacion-app`.
- Borrado físico de `crm_lead`/`crm_lead_event` (tarea manual futura #23/017, fuera de alcance).
- A/B testing, scoring de respuestas, analítica de conversión (features posteriores).

## Open questions (puerta humana) — PENDIENTES

1. **Proveedor de envío cold (>1500/mes).** SaaS dedicado (Resend/Postmark/Instantly, mejor
   deliverability y webhooks nativos) vs SMTP self-hosted (honra el "no SaaS" de #49 pero a este
   volumen arriesga reputación y obliga a construir el tracking). **No afecta #54** (el modelo de
   `message`/`email_event` sirve a ambos vía `provider_message_id`); se decide en la `captacion-app`.
2. **Estrategia de dominio.** Subdominios dedicados de envío + warmup sobre
   `auditoriaserviciosysistemas.com.ar` vs root directo. No afecta #54.
3. **Migrar el scraper a `empresa` ahora vs mantener `crm_lead`** como entrada. Afecta la feature de
   prospección de la `captacion-app`, no el schema de #54.
