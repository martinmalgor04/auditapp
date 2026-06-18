# Requirements — 32_auditoria_mixta_dos_tecnicos

> Una auditoría que cubre **IT y ERP a la vez** debe poder asignarse a **dos
> técnicos** (uno por área) compartiendo un **único briefing/CAB**, en vez de
> duplicar el control del briefing. Hoy `audit.types` es `text[]` (permite el
> combo IT+ERP, con índices `indice_it`/`indice_erp` separados al cierre) pero
> `audit.assigned_tech_id` es un solo FK: el modelo deja crear la auditoría
> mixta pero solo admite UN técnico, y el CAB (cabecera común) se controla dos
> veces siendo idéntico. Esta feature agrega **asignación por área** (tabla
> `audit_assignment`), **filtrado de secciones por especialidad** en el form, y
> el **bloqueo del CAB** tras la confirmación del primer técnico. NO toca el
> motor de scoring ni el render del informe.

## Contexto verificado

- **Modelo (`migrations/001_schema.sql`).**
  - `audit.types text[] NOT NULL` — combo de tipos (p. ej. `{it, erp-tango}`).
  - `audit.template_ids uuid[] NOT NULL` — templates resueltos de los tipos.
  - `audit.assigned_tech_id uuid REFERENCES app_user(id)` — **un solo** FK.
  - `audit_closure (indice_it, indice_erp)` — índices separados, ya existentes.
  - `audit_response (audit_id, item_id)` UNIQUE — respuestas por ítem, sin
    columna de tipo/área (el área se deriva del `template_id` de la sección).
- **Tipos y mapeo a template
  (`src/lib/audit-types.ts`, `src/lib/server/backoffice/audits.ts`).**
  `AUDIT_TYPES = ['it', 'erp-tango', 'erp-estandar']`. El mapeo
  `TYPE_TO_TEMPLATE_CODE` es **1:1** (`it→it`, `erp-tango→erp-tango`,
  `erp-estandar→erp-estandar`); `resolveTemplateIdsForTypes(types)` resuelve los
  `template.id` activos por `code`. Por tanto **cada `audit_type` ↔ exactamente
  un `template.id` ↔ un conjunto de `section` (vía `section.template_id`)**: el
  área de una sección se deriva del `template_id` de su `section`, y ese
  `template` corresponde 1:1 a un `audit_type`.
- **CAB = sección de cabecera compartida.** Cada template tiene una `section`
  con `code = 'CAB'` (cabecera: razón social, dirección, contacto, rubro, etc.).
  En una auditoría mixta hay **una sección CAB por template**, con el mismo
  significado de negocio — hoy se carga/verifica duplicada. El CAB se distingue
  del resto por `section.code = 'CAB'`.
- **Especialidad del técnico
  (`migrations/003_user_audit_types.sql`, `src/lib/server/auth/audit-access.ts`).**
  `app_user.audit_types text[]` (subset de los tipos). Guards:
  - `userAuditTypesScope(user)` → `null` (sin restricción: admin o técnico sin
    especialidad) o la lista de tipos del técnico.
  - `userCanUseAuditTypes(types, user)` → `true` si el técnico puede usar
    **todos** esos tipos (usado al asignar / validar especialidad).
  - `auditMatchesUserScope(auditTypes, user)` → `true` si **algún** tipo de la
    auditoría cae en el scope (overlap). **Hoy es lo único que filtra el form**,
    y por eso un técnico IT con una auditoría mixta ve también las secciones ERP.
- **Alta de auditoría
  (`src/routes/(app)/auditorias/new/+page.server.ts` y `.svelte`).** El form pide
  `types[]` (checkboxes) y **un solo** `assignedTechId` (`<select>`). El schema
  `createAuditSchema` (`src/lib/server/backoffice/schemas.ts`) valida
  `assignedTechId: z.string().uuid()`. `createAudit()`
  (`src/lib/server/backoffice/audits.ts`) inserta `assigned_tech_id` en `audit`.
  `listTechnicians()` lista técnicos para el `<select>`.
- **Form técnico (#7/#28).** `loadAuditForm(auditId, user)`
  (`src/lib/server/form/load-form.ts`) carga `audit` + `sections` + responses;
  `assertFormAccess()` exige rol staff y `auditMatchesUserScope(audit.types,
  user)` (overlap), y estado en `FORM_EDITABLE_STATUSES`. `listFormSections` /
  `listFormItems` (`src/lib/server/db/audit-form.ts`) traen **todas** las
  secciones de `template_ids` (`JOIN section s ON s.template_id =
  ANY(a.template_ids)`), sin filtrar por especialidad.
- **Guard de informes
  (`src/lib/server/api/guards.ts`).** `requireReportReadAccess(locals, audit,
  report)` autoriza al técnico solo si `audit.assignedTechId === user.id`. Con
  asignación por área debe pasar a "técnico asignado a **algún** tipo de la
  auditoría".
- **Migraciones.** SQL versionado en `migrations/NNN_*.sql`, aplicado por
  `src/lib/server/db/migrate.ts`, que **registra la versión en
  `schema_migration` por sí mismo** tras correr el archivo (las migraciones NO
  se auto-registran). Patrón idempotente: bloque `DO $$ … END $$` con
  `IF NOT EXISTS` (ver `migrations/018_hora_inicio_fin.sql`).
- **Cierre/informe.** `audit_closure` con `indice_it`/`indice_erp`,
  `computeLiveScores` y el render mixto (#19/#30) NO se tocan.

## Decisiones tomadas (puerta humana 2026-06-18 — NO re-litigar)

1. **Asignación POR ÁREA.** Un técnico por cada `audit_type` de la auditoría,
   modelado en una **nueva tabla `audit_assignment (audit_id, audit_type,
   tech_id)`** con unicidad por `(audit_id, audit_type)`. Cada técnico ve y
   responde **solo** las secciones de su área (las del template de su tipo).
2. **UN solo informe unificado.** Índices IT/ERP separados adentro, **sin tocar
   el render ni el scoring**.
3. **CAB compartido único.** El CAB se carga/verifica **una sola vez** (no por
   tipo): queda **editable para el PRIMER técnico que abre la auditoría** y, al
   **confirmarlo**, se **bloquea (solo-lectura)** para el otro técnico. Resuelve
   el doble control del briefing.

## Decisión de diseño abierta para esta puerta (ver design.md §6 y Open Questions)

- **Cómo modelar "CAB confirmado".** Propuesta del autor del spec: **columna
  nueva `audit.cab_confirmed_by uuid` + `audit.cab_confirmed_at timestamptz`**
  en `audit` (estado explícito, una sola fuente de verdad por auditoría), en
  lugar de un flag derivado. Justificación en design.md §6. **Requiere visto
  bueno humano** antes de implementar.

## Historias

- **H1 — Como admin que da de alta una auditoría mixta IT+ERP**, quiero asignar
  un técnico especialista por cada área, para que cada uno releve solo lo suyo.
- **H2 — Como técnico IT asignado a una auditoría mixta**, quiero ver el CAB
  compartido y únicamente las secciones IT (no las preguntas de Tango), para no
  perderme entre secciones que no me corresponden.
- **H3 — Como segundo técnico que entra a la auditoría**, quiero encontrar el
  CAB ya cargado y en solo-lectura, para no volver a controlar el briefing que
  el primer técnico ya confirmó.
- **H4 — Como responsable de seguridad**, quiero que solo los técnicos asignados
  a algún área de la auditoría (y los admin) accedan a ella.

## Requirements (EARS estricto)

### A. Migración: tabla `audit_assignment` + backfill

**R1.** El sistema DEBE proveer una migración SQL idempotente que cree la tabla
`audit_assignment (audit_id uuid, audit_type text, tech_id uuid)` con FK
`audit_id → audit(id) ON DELETE CASCADE`, FK `tech_id → app_user(id)`,
restricción `audit_type` dentro de `('it','erp-tango','erp-estandar')`, y
restricción de unicidad por `(audit_id, audit_type)`.

**R2.** CUANDO la migración corre sobre una base con auditorías existentes, el
sistema DEBE hacer **backfill**: por cada auditoría con `assigned_tech_id NO
nulo`, insertar una fila `audit_assignment` por cada `audit_type` en
`audit.types`, con `tech_id = audit.assigned_tech_id`, sin sobrescribir filas ya
existentes (`ON CONFLICT (audit_id, audit_type) DO NOTHING`).

**R3.** CUANDO la migración se ejecuta más de una vez, el sistema NO DEBE fallar
ni duplicar filas (creación de tabla con `IF NOT EXISTS`, backfill con `ON
CONFLICT … DO NOTHING`).

**R4.** El sistema DEBE conservar `audit.assigned_tech_id` tras la migración (no
se elimina), sirviendo como técnico líder/responsable y para compatibilidad; la
fuente de verdad de la asignación por área pasa a ser `audit_assignment`.

### B. Estado "CAB confirmado" (sujeto a aprobación de puerta)

**R5.** El sistema DEBE persistir un estado explícito de "CAB confirmado" por
auditoría (propuesta: columnas `audit.cab_confirmed_by uuid REFERENCES
app_user(id)` y `audit.cab_confirmed_at timestamptz`, ambas nulas mientras el
CAB no esté confirmado), agregadas por la misma migración de forma idempotente.

### C. Alta de auditoría: un técnico por tipo

**R6.** CUANDO un admin da de alta una auditoría, el formulario DEBE pedir **un
técnico por cada `audit_type` seleccionado** (un `<select>` por tipo), en lugar
de un único técnico para toda la auditoría.

**R7.** CUANDO el alta recibe la asignación por tipo, el sistema DEBE validar
que **cada** técnico elegido tenga especialidad para el tipo que se le asigna,
usando `userCanUseAuditTypes([tipo], técnico)`; SI algún técnico no tiene la
especialidad del tipo asignado ENTONCES el sistema DEBE rechazar el alta con un
error de validación y NO crear la auditoría ni asignaciones.

**R8.** CUANDO el alta se valida correctamente, el sistema DEBE crear la
auditoría e insertar **una fila `audit_assignment` por cada `audit_type`** con su
`tech_id` correspondiente, en la misma transacción que la creación de la
auditoría.

**R9.** CUANDO se crea una auditoría mixta IT+ERP, el sistema DEBE permitir que
los dos `audit_type` se asignen a **técnicos distintos** (uno por área); y CUANDO
se crea una auditoría de un solo tipo, el sistema DEBE seguir aceptando un único
técnico para ese tipo.

**R10.** El sistema DEBE poblar `audit.assigned_tech_id` al crear la auditoría
con el técnico de un tipo determinístico (técnico líder), de modo que el campo
nunca quede nulo en auditorías nuevas y se mantenga la compatibilidad descrita
en R4.

### D. Form técnico: filtrado de secciones por especialidad

**R11.** CUANDO un **técnico** abre el form de una auditoría, el sistema DEBE
mostrar el **CAB compartido** y **únicamente** las secciones de los `audit_type`
que ese técnico tiene **asignados en `audit_assignment`** para esa auditoría (las
secciones del `template` correspondiente a cada tipo asignado).

**R12.** CUANDO un **técnico** abre el form de una auditoría mixta, el sistema NO
DEBE mostrarle las secciones (ni los ítems) de un `audit_type` que NO tiene
asignado (el técnico IT no ve secciones ERP y viceversa), exceptuando el CAB
compartido que sí se muestra a ambos.

**R13.** CUANDO un **admin** abre el form de cualquier auditoría, el sistema DEBE
mostrar **todas** las secciones de todos los tipos (sin filtrar por área).

**R14.** SI un técnico abre el form de una auditoría en la que NO tiene ningún
`audit_type` asignado (y no es admin) ENTONCES el sistema DEBE denegar el acceso
al form (403), reemplazando el chequeo actual de overlap por especialidad
(`auditMatchesUserScope`) por uno de asignación efectiva.

### E. CAB compartido único y bloqueo

**R15.** El sistema DEBE tratar el CAB como **único y compartido**: las secciones
`CAB` de los distintos templates de la auditoría se presentan/persisten **una
sola vez** para toda la auditoría (no se controla por tipo ni por técnico).

**R16.** MIENTRAS el CAB de la auditoría no esté confirmado, el sistema DEBE
permitir editar el CAB al técnico que abra la auditoría (el primero que entra),
y DEBE permitirle **confirmar** el CAB.

**R17.** CUANDO un técnico confirma el CAB, el sistema DEBE registrar el estado
"CAB confirmado" (R5: `cab_confirmed_by` = ese técnico, `cab_confirmed_at` =
ahora) de forma atómica.

**R18.** MIENTRAS el CAB esté confirmado, el sistema DEBE presentar el CAB en
**solo-lectura** para cualquier otro técnico, y NO DEBE aceptar ediciones del CAB
de un técnico distinto del que lo confirmó (las respuestas a ítems del CAB se
rechazan o se ignoran server-side para no-confirmadores).

**R19.** CUANDO el segundo técnico abre la auditoría con el CAB ya confirmado, el
sistema DEBE mostrarle el CAB **ya cargado** (los valores confirmados) sin
ofrecerle controlarlo de nuevo.

**R20.** El bloqueo del CAB NO DEBE impedir que cada técnico edite las secciones
**de su propia área** (el bloqueo aplica solo a la sección CAB compartida).

### F. Control de acceso a la auditoría

**R21.** SI un usuario sin sesión intenta acceder a la auditoría o su form
ENTONCES el sistema DEBE responder no autorizado (401/redirección de auth), sin
exponer datos de la auditoría.

**R22.** El sistema DEBE permitir acceso a la auditoría a: cualquier **admin**, y
a los **técnicos asignados a algún `audit_type`** de esa auditoría (vía
`audit_assignment`); SI un técnico no está asignado a ningún tipo de la auditoría
ENTONCES el sistema NO DEBE darle acceso (403 / no listada).

**R23.** El guard de lectura de informes (`requireReportReadAccess`) DEBE
autorizar al técnico asignado a **algún** tipo de la auditoría (no solo al
`assigned_tech_id`), manteniendo la condición de informe `aprobado`.

### G. Compatibilidad, cierre e informe sin cambios

**R24.** El cierre y el informe DEBEN seguir siendo únicos y unificados, con
índices `indice_it`/`indice_erp` separados; el sistema NO DEBE modificar el motor
de scoring (`src/lib/server/scoring/`, `src/lib/scoring/`) ni el render del
informe (`src/lib/informe/render*`).

**R25.** Las auditorías de un solo tipo (IT pura o ERP pura) DEBEN seguir
funcionando igual que antes (alta con un técnico, form con sus secciones, cierre
e informe), sin regresión.

**R26.** Las auditorías existentes (anteriores a la migración) NO DEBEN romperse:
tras el backfill quedan con `audit_assignment` coherente con su
`assigned_tech_id`, y su CAB queda **no confirmado** (`cab_confirmed_*` nulos),
es decir editable por el primer técnico que entre, sin cambiar respuestas ya
cargadas.

## Criterios de verificación (resumen R ↔ test)

| R | Verificación concreta |
|---|---|
| R1 | migración crea `audit_assignment` con FKs, CHECK de `audit_type`, UNIQUE `(audit_id, audit_type)` |
| R2 | test: auditoría previa con `assigned_tech_id` y `types={it,erp-tango}` → 2 filas `audit_assignment` con ese tech |
| R3 | test: correr la migración dos veces no falla ni duplica filas |
| R4 | revisión: la migración NO hace `DROP`/`ALTER` que elimine `assigned_tech_id`; sigue presente |
| R5 | migración agrega `cab_confirmed_by`/`cab_confirmed_at` (idempotente); ambas nulas por defecto |
| R6 | el form de alta renderiza un `<select>` de técnico por cada tipo seleccionado |
| R7 | test: asignar técnico IT a un tipo ERP → alta rechazada (`userCanUseAuditTypes` falla), sin auditoría creada |
| R8 | test: alta mixta válida inserta N filas `audit_assignment` (una por tipo) en la misma tx |
| R9 | test: mixta IT+ERP con dos techs distintos → 2 asignaciones a techs distintos; single-type → 1 |
| R10 | test: tras alta, `audit.assigned_tech_id` no es nulo (técnico líder determinístico) |
| R11 | test: técnico IT en auditoría mixta → `sections` = CAB + secciones IT solamente |
| R12 | test: ese mismo técnico NO recibe secciones/ítems ERP en el form |
| R13 | test: admin en auditoría mixta → recibe todas las secciones de todos los tipos |
| R14 | test: técnico sin asignación en la auditoría → `loadAuditForm` lanza no-permitido (403) |
| R15 | test: el CAB aparece una sola vez en `sections` aunque haya 2 templates |
| R16 | test: con CAB no confirmado, el primer técnico puede editar y confirmar el CAB |
| R17 | test: confirmar setea `cab_confirmed_by`/`cab_confirmed_at` atómicamente |
| R18 | test: con CAB confirmado por A, edición del CAB por B (≠A, ≠admin) es rechazada/ignorada |
| R19 | test: B ve los valores CAB confirmados, en solo-lectura, sin acción de confirmar |
| R20 | test: con CAB confirmado, B sigue pudiendo editar sus secciones de área |
| R21 | test: sin sesión → 401/redirección en la auditoría y su form |
| R22 | test: técnico no asignado a la auditoría → 403/no listada; admin y asignados → OK |
| R23 | test: `requireReportReadAccess` autoriza a técnico asignado a algún tipo (informe aprobado) |
| R24 | revisión: el diff NO toca `scoring/` ni `render*`; índices IT/ERP intactos |
| R25 | test: auditoría single-type IT y ERP — alta, form y acceso sin regresión |
| R26 | test: auditoría preexistente tras migración — backfill OK, CAB no confirmado, respuestas intactas |
