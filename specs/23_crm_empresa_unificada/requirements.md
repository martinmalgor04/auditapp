# Requirements — #23 23_crm_empresa_unificada

> Rediseño del CRM como **registro único de empresas** (clientes + ex-clientes + prospectos)
> orientado a la **auditoría**, NO un embudo de ventas genérico. Se fusionan las tablas `client`
> y `crm_lead` en una sola entidad **`empresa`** con: datos maestros, campo **`relacion`**
> (`cliente | prospecto | ex_cliente`) que las diferencia en la DB, campos de prospecto
> preservados (referente, nivel_interes, tiene_software, observaciones, fuente) y un **estado
> híbrido** auto-derivado de las auditorías/presupuestos de la empresa con override manual
> opcional. La vista `/crm` pasa a ser el **cockpit**: listado filtrable, ficha ver/editar, crear
> auditoría desde la ficha (precarga CAB), timeline de eventos/notas, importar/exportar.
>
> **Decisiones de puerta humana (Martín, 2026-06-15/16) — entrada FIJA, no se rediscute:**
> 1. CRM = registro único de empresas (clientes + no-clientes), gira alrededor de la auditoría.
> 2. **Una sola entidad `empresa`** que fusiona `client` + `crm_lead`.
> 3. Campo `relacion`: `cliente | prospecto | ex_cliente`.
> 4. Estado **híbrido**: auto-derivado (`sin_contactar → contactada → auditoria_en_curso →
>    auditada → presupuestada → activa/inactiva`) CON override manual opcional que **gana** cuando
>    está seteado.
> 5. Acciones must-have: ver/editar ficha, crear auditoría desde la ficha (precarga CAB),
>    registrar evento/nota, importar/exportar.
>
> **Decisiones de la 2ª puerta humana (Martín, 2026-06-16) — entrada FIJA, resuelven las open
> questions del design v1:**
> 6. **Migración: estrategia A (rename + fold)** confirmada. `ALTER TABLE client RENAME TO empresa`,
>    `audit.client_id RENAME TO empresa_id`, foldear `crm_lead` encima con dedup, vista `client` de
>    compatibilidad durante el rollout.
> 7. **Relación en el import EN VIVO = SELECTOR explícito en la UI.** El importador #21 reconectado
>    **NO** infiere la relación por origen: la pantalla de importación masiva ofrece un selector
>    donde el usuario elige si todo el lote entra como `cliente` o como `prospecto`. (Distinto de la
>    **carga histórica** de la migración inicial, que sí marca presupuestos/tango como `cliente` y
>    `prospectos.csv` como `prospecto`.)
> 8. **Limpieza = mantener como respaldo.** NO se dropean `crm_lead`/`crm_lead_event` ni la vista
>    `client`: se conservan como red de rollback/backup. La limpieza queda como tarea manual futura,
>    **fuera del alcance** de implementación de #23 (Fase 6 = deprecación documentada, sin drop).
> 9. **Defaults confirmados:** ventana activa/inactiva = **18 meses**; dedup de prospectos sin CUIT
>    por **razón social normalizada** (sin match → fila separada, nunca se descarta); `ex_cliente`
>    **solo manual** (la migración no marca ninguno automático); señal de "presupuestada" = vínculo
>    `audit_proposal_link` (#16).
>
> **Hechos del código verificados en el repo (no asumir, ya inspeccionados):**
> - `client` (migr. 001 + 005): `id`, `razon_social NOT NULL`, `cuit`, `rubro`, `empleados`,
>   `puestos`, `sedes`, `referente_nombre`, `referente_cargo`, `referente_contacto`, `erp_actual`,
>   `proveedor_correo`, `soporte_it_actual`, `direccion`, `cp`, `provincia`, `telefono`, `email`,
>   `origen` (CHECK `IN ('presupuestos','tango','prospecto')`), más campos de prospecto y Tango ya
>   añadidos en 005: `nivel_interes`, `observaciones`, `pagina`, `relevado_at`, `tango_tipo`,
>   `tango_terminales`, `tango_version`, `tango_version_detectada`, `tango_lic_categoria`,
>   `tango_sueldos`, `tango_venc_escala`, `tango_motivo`, `created_at`, `updated_at`.
>   **`client` ya es un proto-registro unificado:** absorbió campos de prospecto y `origen`.
> - `crm_lead` (migr. 008/010): `id`, `email` (nullable tras 010), `empresa`, `contacto`,
>   `telefono`, `source` (CHECK `firecrawl|referido|manual|otro`), `status` (CHECK
>   `lead|contactado|agendo|auditado|presupuestado|cliente|descartado`), `notas`,
>   `proxima_accion`, `proxima_accion_fecha`, `client_id` (FK → client, nullable), `audit_id`
>   (FK → audit, nullable), `presupuesto_ref`, `descartado_at`. `crm_lead_event`: `lead_id`
>   (FK CASCADE), `from_status`, `to_status`, `changed_by` (FK app_user), `created_at`. Índice
>   único `crm_lead_email_key` sobre `lower(email)`.
> - **`audit.client_id uuid NOT NULL REFERENCES client(id)`** (migr. 001, índice
>   `audit_client_id_idx`). FK crítica: NO puede romperse. Otras FK → `client(id)`:
>   `crm_lead.client_id`.
> - Migr. 013: índice único parcial `client_cuit_unique ON client (cuit) WHERE cuit IS NOT NULL`,
>   creado tras consolidar CUIT duplicados conservando el `id` menor.
> - El importador #21 (`src/lib/server/clients/{parse,normalize,import,schema}.ts`,
>   `src/lib/server/db/clients-import.ts`, `src/routes/api/crm/clients/import/+server.ts`) hace
>   `INSERT INTO client ... ON CONFLICT (cuit) WHERE cuit IS NOT NULL DO UPDATE`, `origen =
>   'presupuestos'`, en una transacción.
> - Form nueva auditoría: `src/routes/(app)/auditorias/new/{+page.svelte,+page.server.ts}`;
>   `createAudit`, `searchClientsForPicker`, `getClientCabFields`, `syncClientFromCab`,
>   `getAuditById` (todos en `src/lib/server/backoffice/audits.ts`) **leen y escriben `client`**.
>   `getAuditById` y `mercado/queries.ts` hacen `JOIN client c ON c.id = a.client_id` (~10 sitios
>   en `src/lib/server/mercado/queries.ts`). Mapeo CAB: `src/lib/backoffice/cab-client-map.ts`.
> - Vista CRM actual: `src/routes/(app)/crm/{+page.server.ts,+page.svelte}` lee `crm_lead` vía
>   `listLeads`/`funnelCounts`/`listLeadEvents` (`src/lib/server/db/crm-leads.ts`). State machine:
>   `src/lib/server/crm/state-machine.ts` + `src/lib/crm/view.ts`. Guard CRM hoy: `requireStaff`.
> - Datos reales en `seed/`: `clientes-presupuestossys.csv` (~1900, CUIT en `numero_doc`),
>   `clientes-tango.csv` (~112, sin CUIT en el CSV; clave `razon_social`), `prospectos.csv`
>   (~52, campos `referente,telefono,email,direccion,rubro,pagina,tiene_software,nivel_interes,`
>   `observaciones,relevado_at,fuente`; **muchos sin CUIT**).
> - Runner de migraciones (`src/lib/server/db/migrate.ts`): lee `migrations/*.sql`, ordena por
>   nombre, aplica los no registrados, **envuelve cada archivo en `sql.begin`** (atómico por archivo).

Convenciones EARS (`docs/specs.md`): un solo **DEBE** por requirement, id estable, verificable por
test concreto. Capas, envelope `{success,data,error}` y validación Zod en fronteras per
`docs/architecture.md` / `docs/conventions.md`. SQL parametrizado, PK uuid, `timestamptz`.

---

## R1 — Entidad `empresa` unificada con datos maestros

El sistema DEBE proveer una tabla `empresa` que unifique los datos maestros hoy repartidos en
`client` y `crm_lead`: `razon_social` (NOT NULL), `cuit`, `rubro`, `empleados`, `puestos`,
`sedes`, `direccion`, `cp`, `provincia`, `telefono`, `email`, `erp_actual`, `proveedor_correo`,
`soporte_it_actual`, `created_at`, `updated_at`.

## R2 — Campo `relacion` que diferencia el tipo de empresa

El sistema DEBE incluir en `empresa` una columna `relacion text NOT NULL` con CHECK
`relacion IN ('cliente','prospecto','ex_cliente')`.

## R3 — Campos de referente preservados

El sistema DEBE preservar en `empresa` los campos de referente: `referente_nombre`,
`referente_cargo`, `referente_contacto`.

## R4 — Campos de prospecto preservados

El sistema DEBE preservar en `empresa` los campos propios de prospecto provenientes de `crm_lead`
y de `client` (#005): `nivel_interes`, `tiene_software`, `observaciones`, `fuente`, `pagina`,
`relevado_at`.

## R5 — Override de estado manual opcional

El sistema DEBE incluir en `empresa` una columna `estado_override text` (nullable) que, cuando
está seteada, almacena el estado fijado manualmente por un staff.

## R6 — Constraint único parcial de CUIT en `empresa`

El sistema DEBE garantizar un índice único parcial sobre `empresa (cuit) WHERE cuit IS NOT NULL`,
de modo que dos empresas con CUIT no nulo NO puedan compartir el mismo CUIT.

## R7 — Migración idempotente sin pérdida de filas

CUANDO la migración a `empresa` se aplica, el sistema DEBE fusionar `client` + `crm_lead` en
`empresa` sin perder filas: toda empresa pre-existente (cada `client` y cada `crm_lead` no
deduplicado) DEBE quedar representada por exactamente una fila en `empresa`.

## R8 — Dedup por CUIT entre las tres fuentes

CUANDO la migración consolida filas con el **mismo CUIT no nulo** (provenientes de presupuestos,
tango o prospectos), el sistema DEBE fusionarlas en una **única** empresa, sin crear duplicados de
CUIT.

## R9 — Dedup de prospectos sin CUIT por razón social normalizada

CUANDO la migración consolida un prospecto **sin CUIT** cuya razón social normalizada (trim,
minúsculas, espacios colapsados) coincide con la de una empresa ya existente, el sistema DEBE
fusionarlo en esa empresa; SI no hay coincidencia, ENTONCES el sistema DEBE conservarlo como fila
separada (NO descartarlo).

## R10 — Preservación de las FK de `audit`

CUANDO la migración termina, el sistema DEBE garantizar que **toda** auditoría existente siga
referenciando la empresa correcta mediante una FK válida hacia `empresa(id)`, sin filas de `audit`
huérfanas y sin cambiar a qué empresa apunta cada auditoría.

## R11 — Re-puntado de FK al fusionar duplicados

SI la migración elimina una fila origen por ser duplicado de otra (mismo CUIT o misma razón social
sin CUIT), ENTONCES el sistema DEBE re-puntar las FK que apuntaban a la fila eliminada
(`audit.client_id` y referencias de eventos) hacia la fila conservada, antes de borrarla.

## R12 — Idempotencia de la migración

CUANDO la migración se re-ejecuta sobre una base ya migrada, el sistema DEBE NO crear filas
duplicadas ni alterar las FK ya re-puntadas (re-correr es un no-op seguro).

## R13 — Estado auto-derivado de auditorías/presupuestos

El sistema DEBE derivar el estado de seguimiento de una empresa a partir de sus auditorías y
presupuestos, según la progresión `sin_contactar → contactada → auditoria_en_curso → auditada →
presupuestada → activa/inactiva`.

## R14 — Reglas de auto-derivación verificables

CUANDO el sistema auto-deriva el estado, DEBE aplicar reglas determinísticas: sin eventos ni
auditorías → `sin_contactar`; con evento de contacto y sin auditoría → `contactada`; con auditoría
no cerrada → `auditoria_en_curso`; con auditoría cerrada y sin presupuesto → `auditada`; con
presupuesto asociado → `presupuestada`; empresa con `relacion='cliente'` sin actividad reciente →
`activa`/`inactiva` según la ventana definida en design.

## R15 — El override manual gana sobre el auto-derivado

SI `estado_override` está seteado en una empresa, ENTONCES el sistema DEBE exponer ese valor como
estado efectivo, ignorando el auto-derivado; SI `estado_override` es `null`, ENTONCES el sistema
DEBE exponer el estado auto-derivado.

## R16 — Cockpit: listado con filtros por relacion y estado

CUANDO un staff abre `/crm`, el sistema DEBE mostrar el listado de empresas con filtros por
`relacion` y por estado efectivo.

## R17 — Cockpit: búsqueda por razón social y CUIT

CUANDO un staff escribe en el buscador del cockpit, el sistema DEBE filtrar las empresas cuya
razón social o CUIT coincida (case-insensitive, coincidencia parcial).

## R18 — Cockpit: paginación o virtualización para ~2000 filas

MIENTRAS el listado contiene del orden de 2000 empresas, el sistema DEBE renderizar el cockpit con
paginación o virtualización, sin cargar las ~2000 fichas completas con su timeline a la vez.

## R19 — Ficha: ver y editar datos maestros y relacion

CUANDO un staff abre la ficha de una empresa, el sistema DEBE permitir ver y editar sus datos
maestros y su `relacion`, persistiendo los cambios.

## R20 — Ficha: mostrar estado (auto + override) y timeline

CUANDO un staff abre la ficha de una empresa, el sistema DEBE mostrar el estado efectivo,
indicar si proviene de override o de auto-derivación, y mostrar el timeline de eventos/notas de la
empresa.

## R21 — Crear auditoría desde la ficha con CAB precargado

CUANDO un staff usa la acción "crear auditoría" desde la ficha de una empresa, el sistema DEBE
abrir el alta de auditoría con el encabezado CAB precargado con los datos de esa empresa
(reutilizando `cab-client-map`) y la auditoría creada DEBE quedar vinculada a esa empresa.

## R22 — Registrar evento/nota sobre una empresa

CUANDO un staff registra un evento sobre una empresa (llamada, reunión, nota, cambio de estado),
el sistema DEBE persistirlo con tipo, texto, fecha y autor (`app_user`), asociado a esa empresa.

## R23 — Set manual de override genera evento de cambio de estado

CUANDO un staff fija o limpia el `estado_override` de una empresa, el sistema DEBE registrar un
evento de cambio de estado en el timeline de esa empresa.

## R24 — Importador #21 reconectado a `empresa`

CUANDO un admin importa empresas por CSV/Excel, el sistema DEBE escribir en `empresa` conservando
el upsert por CUIT (existente actualiza, nuevo crea) y NO DEBE escribir ya en `client`.

## R25 — Empresa importada toma la relacion elegida en el selector

CUANDO el importador EN VIVO crea una empresa nueva, el sistema DEBE asignarle la `relacion`
(`cliente` o `prospecto`) elegida por el usuario en el selector de la pantalla de importación
masiva, sin dejar `relacion` nula, y sin inferirla por el origen del archivo.

## R31 — Selector de relacion en la pantalla de import en vivo

CUANDO un admin abre la pantalla de importación masiva de empresas, el sistema DEBE ofrecer un
selector explícito de `relacion` (`cliente | prospecto`) que aplica a todo el lote, y el endpoint
de import DEBE recibir ese valor como parámetro validado con Zod (CHECK contra `cliente|prospecto`)
y aplicarlo a las empresas creadas en esa importación.

## R32 — Carga histórica determinística por origen (migración inicial)

CUANDO la migración inicial fusiona las tres fuentes históricas, el sistema DEBE asignar
`relacion='cliente'` a las filas de origen `presupuestos` y `tango`, y `relacion='prospecto'` a las
de `prospectos.csv` (origen `prospecto`); esta carga histórica es distinta del import en vivo (R25)
y no usa el selector.

## R26 — Exportar el listado filtrado

CUANDO un staff exporta desde el cockpit, el sistema DEBE generar un archivo (CSV) con exactamente
las empresas que cumplen los filtros activos (relacion, estado, búsqueda) y sus datos maestros.

## R27 — ClientPicker y createAudit leen `empresa`

CUANDO un staff usa el form de nueva auditoría (`auditorias/new`), el ClientPicker y `createAudit`
DEBEN leer/escribir `empresa` (no `client`), y el flujo de creación de auditorías DEBE seguir
funcionando sin regresión (FK `audit` → empresa válida, CAB precargado, sync de datos maestros).

## R28 — `getAuditById` y mercado leen `empresa`

CUANDO el sistema resuelve una auditoría (`getAuditById`) o computa el dashboard de mercado
(`src/lib/server/mercado/queries.ts`), DEBE obtener la razón social y demás datos de empresa desde
`empresa`, sin romper los joins hoy escritos contra `client`.

## R29 — Guards de permisos del cockpit y mutaciones

SI un usuario sin sesión accede al cockpit o a sus endpoints de mutación, ENTONCES el sistema DEBE
responder 401; el cockpit y la lectura DEBEN requerir staff (`requireStaff`) y el import DEBE
requerir admin (`requireAdminApi`), rechazando con 403 a quien no corresponda.

## R30 — Compatibilidad hacia atrás durante el rollout

MIENTRAS el rollout está en curso (fases parciales), el sistema DEBE mantener `client` legible
(como tabla renombrada o vista de compatibilidad) de modo que los módulos aún no reconectados
sigan funcionando sin error.

---

## Trazabilidad R ↔ test (la completa el implementer)

| R | Test previsto (vitest/playwright) |
|---|---|
| R1 | `tests/empresa-schema.test.ts` — columnas maestras existen con tipos correctos |
| R2 | `tests/empresa-schema.test.ts` — CHECK `relacion IN (cliente,prospecto,ex_cliente)` |
| R3 | `tests/empresa-schema.test.ts` — columnas referente_* presentes |
| R4 | `tests/empresa-schema.test.ts` — nivel_interes/tiene_software/observaciones/fuente/pagina/relevado_at |
| R5 | `tests/empresa-schema.test.ts` — `estado_override` nullable |
| R6 | `tests/empresa-migration.test.ts` — dos empresas mismo CUIT → viola índice único |
| R7 | `tests/empresa-migration.test.ts` — count(empresa) == filas únicas esperadas; sin pérdida |
| R8 | `tests/empresa-migration.test.ts` — fuentes con mismo CUIT → 1 empresa |
| R9 | `tests/empresa-migration.test.ts` — prospecto sin CUIT match por razón social vs fila separada |
| R10 | `tests/empresa-migration.test.ts` — toda `audit.empresa_id` resuelve a empresa; 0 huérfanas |
| R11 | `tests/empresa-migration.test.ts` — FK de fila eliminada re-puntada a la conservada |
| R12 | `tests/empresa-migration.test.ts` — re-ejecutar migración → 0 nuevas filas, FK estables |
| R13 | `tests/empresa-estado.test.ts` — progresión derivada cubre los 7 estados |
| R14 | `tests/empresa-estado.test.ts` — cada regla determinística (sin_contactar..presupuestada) |
| R15 | `tests/empresa-estado.test.ts` — override seteado gana; null → auto |
| R16 | `e2e/crm-cockpit.spec.ts` — filtros por relacion y estado |
| R17 | `tests/api/empresas-list.test.ts` — búsqueda por razón social y CUIT (ILIKE) |
| R18 | `e2e/crm-cockpit.spec.ts` — paginación/virtualización con dataset grande |
| R19 | `tests/api/empresa-update.test.ts` — editar datos maestros y relacion persiste |
| R20 | `e2e/crm-ficha.spec.ts` — estado (origen) + timeline visibles |
| R21 | `e2e/crm-ficha.spec.ts` — crear auditoría desde ficha precarga CAB y vincula empresa |
| R22 | `tests/api/empresa-eventos.test.ts` — evento con tipo/texto/fecha/autor persistido |
| R23 | `tests/api/empresa-eventos.test.ts` — set/clear override registra evento de estado |
| R24 | `tests/clients-import-upsert.test.ts` — import escribe `empresa`, upsert por CUIT, no `client` |
| R25 | `tests/clients-import-upsert.test.ts` — empresa nueva toma la relacion del selector, no nula, no inferida por origen |
| R26 | `tests/api/empresas-export.test.ts` — export contiene solo filas del filtro activo |
| R27 | `tests/audits-create.test.ts` + `e2e/auditorias-new.spec.ts` — picker/createAudit sobre empresa, sin regresión |
| R28 | `tests/mercado-queries.test.ts` — joins resuelven contra empresa; dashboard sin error |
| R29 | `tests/api/empresas-guards.test.ts` — 401 sin sesión, 403 rol incorrecto en cockpit/import |
| R30 | `tests/empresa-compat.test.ts` — `client` legible (vista/tabla) durante fases parciales |
| R31 | `tests/clients-import-upsert.test.ts` + `e2e/crm-import.spec.ts` — selector relacion en UI, endpoint valida `cliente\|prospecto` con Zod y lo aplica al lote |
| R32 | `tests/empresa-migration.test.ts` — carga histórica: presupuestos/tango → `cliente`, prospectos → `prospecto` |

---

## Mejoras futuras / roadmap (FUERA del alcance de #23)

> Anotado para una feature posterior. NO se implementa en #23.

- **Recomendaciones de empresas para contactar.** A futuro, aprovechar el registro unificado de
  empresas + su estado de seguimiento (`sin_contactar`, `inactiva`, etc.) para **sugerir
  proactivamente** a qué empresas contactar o re-contactar (p.ej. clientes inactivos hace >18 meses,
  prospectos `sin_contactar` de rubros prioritarios). Se conecta con el **estudio de mercado NEA
  (#18)** y con el estado híbrido de esta feature, que dejan la base de datos lista para alimentar
  esas recomendaciones. Queda como nota de roadmap para una feature dedicada.
