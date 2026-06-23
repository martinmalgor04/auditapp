# Requirements — #41 41_referencia_auditoria

> Referencia legible y anti-duplicado de auditorías.
>
> **Incidente (2026-06-23, INGENIERIA SIGLO XXI):** se crearon dos auditorías ERP duplicadas
> indistinguibles en el tablero (solo razón social); el relevamiento quedó disperso entre
> auditorías gemelas.
>
> **Objetivo:** código humano único e inmutable `<EMPRESA>-<TIPO>-<NNNN>` (ej. `ISX-ERP-0002`),
> un solo tipo por auditoría nueva, aviso anti-duplicado al crear, visible en tablero/detalle/
> informe/presupuesto/briefing. Las rutas y FKs siguen usando `audit.id` (uuid).
>
> **Hechos del código verificados (no asumir):**
> - Tabla `empresa` (ex-`client`, migr. 015): sin columna `codigo` hoy.
> - Tabla `audit`: `empresa_id`, `types text[]`, `status`, `archived_at`; sin `ref_code`.
> - Alta: `createAudit` en `src/lib/server/backoffice/audits.ts` — INSERT con `types[]` múltiple,
>   nombre `Auditoría {razon_social}`, sin guard de duplicados.
> - Form creación: `auditorias/new/+page.svelte` — checkboxes multi-tipo + `techByType`.
> - Tablero: `listDashboardAudits` (`dashboard.ts`) + `audit-table.svelte` / `audit-card-list.svelte`
>   — muestran `razonSocial`, no código.
> - Briefing: `briefing/[token]/+page.server.ts` — expone `client.razonSocial`, sin ref.
> - Presupuesto: `buildPsysPayload` (`psys/payload.ts`) — `source.audit_id`, sin ref_code.
> - Orden canónico de tipos (tipo líder legacy): `it < erp-tango < erp-estandar`
>   (`CANONICAL_TYPE_ORDER` en `audits.ts`, feature #32).
> - Tipos: `it`, `erp-tango`, `erp-estandar` (`src/lib/audit-types.ts`).

Convenciones EARS (`docs/specs.md`): un solo **DEBE** por requirement, id estable, verificable por test.

---

## Código de empresa (`empresa.codigo`)

**R1** — Cada fila de `empresa` DEBE tener un código corto en `empresa.codigo` (`text NOT NULL UNIQUE`),
generado automáticamente a partir de la razón social (iniciales de palabras significativas, ignorando
formas societarias y conectores: SA, S.A., SRL, S.R.L., SAS, SOCIEDAD, RESPONSABILIDAD, LIMITADA,
ANONIMA, ANÓNIMA, DE, DEL, LA, LAS, EL, LOS, Y, E).

**R2** — SI dos empresas producen el mismo código base de iniciales, ENTONCES el sistema DEBE
asignar un sufijo numérico incremental (`ISX`, `ISX2`, `ISX3`, …) hasta lograr unicidad.

**R3** — El sistema NO DEBE modificar `empresa.codigo` después de su asignación inicial, aunque
luego se edite la razón social.

## Código de referencia de auditoría (`audit.ref_code`)

**R4** — Cada fila de `audit` DEBE tener un código de referencia en `audit.ref_code`
(`text NOT NULL UNIQUE`).

**R5** — El `ref_code` DEBE tener el formato `<EMPRESA>-<TIPO>-<NNNN>`, donde `<EMPRESA>` es
`empresa.codigo`, `<TIPO>` es el token de referencia del tipo de auditoría (`IT`, `ERP` o `ERPE`)
y `<NNNN>` es un entero correlativo en base 10 rellenado con ceros a la izquierda hasta un mínimo
de 4 dígitos.

**R6** — El mapeo de tipo interno a token de referencia DEBE ser: `it → IT`, `erp-tango → ERP`,
`erp-estandar → ERPE`.

**R7** — El correlativo `<NNNN>` DEBE incrementarse de forma independiente por cada par
`(empresa_id, audit_type)`, comenzando en `0001` para cada par.

**R8** — CUANDO se crea una auditoría, el sistema DEBE asignar su `ref_code` de forma atómica
sin colisiones bajo concurrencia (dos altas simultáneas de la misma empresa y mismo tipo nunca
obtienen el mismo correlativo).

**R9** — El sistema NO DEBE modificar el `ref_code` de una auditoría después de su creación.

## Migración y datos existentes

**R10** — La migración DEBE backfillear `empresa.codigo` para todas las empresas existentes
aplicando la misma lógica de generación y desambiguación que en runtime (R1, R2).

**R11** — La migración DEBE backfillear `audit.ref_code` para todas las auditorías existentes,
asignando correlativos por `(empresa_id, audit_type)` en orden ascendente de `created_at`
(desempate por `id`).

**R12** — CUANDO una auditoría legacy tiene más de un tipo en `audit.types`, la migración DEBE
usar el tipo líder en orden canónico `it < erp-tango < erp-estandar` para determinar el token
`<TIPO>` de su `ref_code`.

**R13** — La migración DEBE sembrar la tabla contador con el máximo correlativo ya asignado por
cada `(empresa_id, audit_type)` para que la próxima alta continúe la secuencia sin huecos ni
colisiones.

## Un solo tipo por auditoría (altas nuevas)

**R14** — CUANDO un usuario crea una auditoría, el sistema DEBE exigir exactamente un tipo
(`types` con longitud 1); el formulario de creación NO DEBE permitir seleccionar más de un tipo.

**R15** — Las auditorías legacy con más de un tipo en `audit.types` DEBEN seguir siendo legibles
y editables en relevamiento sin error ni migración forzada.

## Visualización del `ref_code`

**R16** — El tablero de auditorías (vista desktop y mobile) DEBE mostrar el `ref_code` y la
etiqueta legible del tipo en cada fila/card, además de la razón social.

**R17** — La cabecera del detalle de auditoría DEBE mostrar el `ref_code` de forma prominente.

**R18** — La pantalla de cierre y el render del informe (PDF e impresión) DEBEN incluir el
`ref_code` de la auditoría.

**R19** — El payload enviado a presupuestossys DEBE incluir el `ref_code` de la auditoría de
origen junto al `audit_id`.

**R20** — La página pública de briefing externo DEBE mostrar el `ref_code` de la auditoría.

## Aviso anti-duplicado al crear

**R21** — CUANDO un usuario envía el formulario de nueva auditoría para una empresa que ya tiene
al menos una auditoría no archivada (`archived_at IS NULL`) y no cerrada (`status <> 'cerrada'`)
del mismo tipo interno, el sistema DEBE detener la creación y devolver un aviso de posible
duplicado en lugar de crear la auditoría.

**R22** — El aviso de posible duplicado DEBE listar cada auditoría en conflicto con su
`ref_code`, estado y nombre del técnico encargado.

**R23** — CUANDO el usuario confirma explícitamente la creación pese al aviso (campo
`confirmDuplicate=true` en el envío), el sistema DEBE crear la auditoría con el siguiente
correlativo disponible.

**R24** — MIENTRAS no exista una auditoría activa del mismo tipo para esa empresa, el sistema
DEBE crear la auditoría sin pedir confirmación adicional.

## Identificadores técnicos (sin cambio)

**R25** — El sistema NO DEBE cambiar el identificador de rutas ni de FKs: navegación, APIs y
relaciones DEBEN seguir usando `audit.id` (uuid); el `ref_code` es solo de presentación y
comunicación.
