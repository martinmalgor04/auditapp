# Requirements — 62_escaneo_revision_ui

> UI de revisión humana de los dispositivos detectados por el escaneo
> automatizado de red: vista consolidada multi-VLAN por auditoría (dedup por
> identidad con provenance), acciones confirmar/descartar/fusionar con
> registro de quién/cuándo, y vinculación con el relevamiento manual sin
> sobrescribirlo. Incluye las pantallas de gestión de escaneos diferidas por
> #60 (crear escaneo, emitir/revocar token).
>
> Consume el modelo y el repositorio de #59 (`specs/59_escaneo_modelo_datos/`,
> mergeada) y las funciones de token de #60 (`specs/60_escaneo_ingesta_api/`,
> mergeada). Sin scoring (#63), sin diff (#64), sin edición del
> dato escaneado (el dato del agente es inmutable salvo revisión).
>
> **Decisiones de puerta humana (2026-08-30):**
>
> 1. **OQ1 — Fusión = solo vínculo (opción A).** El técnico tipea en el form
>    lo que quiera; la UI de detalle muestra los datos lado a lado. La copia
>    asistida queda como feature futura si el flujo real lo pide.
> 2. **OQ2 — Revisión post-cierre PERMITIDA (opción B).** Con auditoría
>    `cerrada` las acciones de revisión de dispositivos operan normal (R4);
>    solo se bloquean la creación de escaneos y la emisión/revocación de
>    tokens (R32). #63 recomputará el scoring ante revisiones posteriores
>    al cierre.
> 3. **OQ3 — Consolidado con TODOS los escaneos que tengan dispositivos
>    (opción A).** El estado del escaneo se muestra en la provenance; un
>    `fallido` puede tener la única copia de datos de un tramo de red.
>
> Notación EARS estricta (ver `docs/specs.md`). Cada `R<n>` es verificable por
> al menos un test concreto.

## Contexto verificado (repo real)

- `escaneo_dispositivo` (#59, migración 030): `identidad` determinística
  (MAC normalizada o IP, R12 de #59), `revision` ∈ `sin_revisar`,
  `confirmado`, `descartado`, `fusionado` con `revisado_por`/`revisado_at`
  (R23/R24 de #59), `raw jsonb` (R14 de #59), `nota_tecnico`.
- Repo de #59 (`src/lib/server/escaneos/repo.ts`): `listarDispositivos`
  (filtros por tipo/revisión, paginado) y `marcarRevision` operan **por fila
  de escaneo**; toda función recibe `empresaId` y lo aplica vía join con
  `audit` (R26/R27 de #59).
- Relevamiento manual de inventario: ítems `template_item` con
  `field_type='table'`; las filas viven en
  `audit_response(audit_id, item_id).value.rows[*]` con
  `row_id` (UUID estable generado en cliente), `cells` y `attachment_ids`
  (`field-table.svelte`, `merge-table.ts`). `audit_response` tiene
  `UNIQUE (audit_id, item_id)`. **No existe** tabla normalizada de
  relevamiento; las filas pueden borrarse desde el form (caso legítimo).
- Detalle de auditoría (`src/routes/(app)/auditorias/[id]/`): sub-páginas
  por dominio (`form`, `reunion`, `cierre`); acceso con
  `assertAdminOrAssigned` (admin siempre, técnico solo `techIsAssigned`,
  patrón #33/#57); mutaciones vía form actions + `failFromError`;
  `audit.clientId` expone el `empresa_id` para las funciones del repo.
- Patrón listas mobile-first (CRM): cards `lg:hidden` + tabla
  `hidden lg:block`, filtros por query string, paginación server-side;
  badges con tokens `--sys-*` (`$lib/crm/empresa-view.ts`,
  `StatusBadge`, `ChipPill`, `ChipFilters` de #42).
- #60 (in_progress): `emitirTokenEscaneo` / `revocarTokenEscaneo`
  (`src/lib/server/escaneos/api.ts`); el token en claro se expone una única
  vez (R5 de #60). Migración próxima libre tras #60: `032`.

## Mapa acceptance (#62) → requirements

| Acceptance #62 | Requirements |
|---|---|
| El técnico puede marcar cada dispositivo como confirmado/descartado/fusionado con registro de quién y cuándo | R20, R21, R26 |
| La vista consolidada deduplica por MAC entre escaneos de la misma auditoría mostrando provenance | R9, R10, R13 |
| Vincular un dispositivo con un ítem manual no sobrescribe campos del ítem manual | R21, R23 |

## Requisitos

### Navegación y acceso

**R1** — CUANDO un usuario staff abra el detalle de una auditoría, el sistema
DEBE ofrecer un enlace a la pantalla de escaneos de esa auditoría
(`/auditorias/[id]/escaneos`).

**R2** — CUANDO un usuario con sesión staff acceda a cualquier ruta de la UI
de escaneos de una auditoría, el sistema DEBE permitir la lectura solo si es
admin o técnico asignado a esa auditoría (`techIsAssigned`, patrón #33/#57).

**R3** — SI un técnico no asignado a la auditoría intenta acceder a la UI de
escaneos ENTONCES el sistema DEBE responder 403 sin exponer datos de
escaneos ni ejecutar mutaciones.

**R4** — MIENTRAS la auditoría esté en estado `cerrada`, el sistema DEBE
permitir las acciones de revisión de dispositivos (confirmar, descartar,
fusionar, desvincular, volver a `sin_revisar`) — decisión de puerta
2026-08-30 (OQ2 opción B): la revisión post-cierre queda habilitada y #63
recomputará el scoring ante revisiones posteriores al cierre.

### Gestión de escaneos (diferido de #60)

**R5** — CUANDO un staff autorizado cree un escaneo desde la UI indicando
rango objetivo y etiqueta opcional, el sistema DEBE registrarlo en estado
`pendiente` con el usuario de la sesión como técnico responsable (vía
`crearEscaneo` de #59).

**R6** — CUANDO un staff autorizado emita un token de escaneo desde la UI,
el sistema DEBE mostrar el token en claro una única vez en la respuesta de
la acción, junto a su fecha de expiración (R5 de #60).

**R7** — CUANDO un staff autorizado revoque el token activo de un escaneo
desde la UI, el sistema DEBE impedir su uso de inmediato conservando el
historial de emisión (R4 de #60).

**R8** — El sistema DEBE listar los escaneos de la auditoría con estado,
etiqueta, rango objetivo, cantidad de dispositivos detectados y marcas
temporales de inicio/fin.

**R32** — MIENTRAS la auditoría esté en estado `cerrada`, el sistema DEBE
rechazar la creación de escaneos y la emisión o revocación de tokens (409).
*(id fuera de secuencia: agregado en puerta humana 2026-08-30, OQ2.)*

### Vista consolidada multi-VLAN (read-model)

**R9** — El sistema DEBE construir la lista de dispositivos de la UI como un
consolidado por auditoría que agrupa en un solo dispositivo todas las
ocurrencias con la misma `identidad` (R12 de #59) provenientes de los
escaneos de esa auditoría.

**R10** — El sistema DEBE mostrar en cada dispositivo consolidado su
provenance: la lista de escaneos de origen con etiqueta o rango, estado del
escaneo y última detección (`visto_at`) de cada ocurrencia.

**R11** — Para cada campo normalizado de un dispositivo consolidado, el
sistema DEBE mostrar el valor no nulo de la ocurrencia más reciente, con
orden de precedencia `visto_at` descendente (nulos al final) y luego
`updated_at` descendente.

**R12** — CUANDO todas las ocurrencias recientes de un campo tengan `tipo`
`desconocido` pero una ocurrencia anterior tenga un tipo conocido, el
sistema DEBE mostrar el tipo conocido más reciente (misma semántica que R18
de #59: `desconocido` significa "no lo sé").

**R13** — La revisión efectiva de un dispositivo consolidado DEBE ser la
revisión distinta de `sin_revisar` con `revisado_at` más reciente entre sus
ocurrencias, expuesta junto a su revisor y fecha; si ninguna ocurrencia fue
revisada, la revisión efectiva DEBE ser `sin_revisar`.

**R14** — CUANDO un escaneo registre una ocurrencia nueva de una identidad
ya revisada, el sistema DEBE conservar en el consolidado la revisión
efectiva previa (la ocurrencia nueva nace `sin_revisar` a nivel fila y no
revierte la decisión humana).

**R15** — DONDE la identidad de un dispositivo consolidado derive de IP por
ausencia de MAC, el sistema DEBE señalarlo visualmente como identidad débil
(riesgo de reasignación DHCP).

**R16** — CUANDO el técnico filtre el consolidado, el sistema DEBE soportar
filtros por tipo, por revisión efectiva y por escaneo de origen, con
paginación server-side.

**R17** — El sistema DEBE mostrar contadores de dispositivos consolidados
por estado de revisión efectiva, calculados sobre el consolidado completo
de la auditoría (independientes de la página visible).

### Detalle de dispositivo

**R18** — CUANDO se abra el detalle de un dispositivo consolidado, el
sistema DEBE mostrar sus campos normalizados consolidados, la provenance
completa y el software y servicios de red de la ocurrencia más reciente,
identificando de qué escaneo provienen.

**R19** — El detalle de dispositivo DEBE exponer el payload `raw` de cada
ocurrencia en una sección colapsable por ocurrencia, sin transformación
(R14 de #59).

### Acciones de revisión

**R20** — CUANDO un staff autorizado confirme o descarte un dispositivo
consolidado, el sistema DEBE aplicar la revisión a todas las ocurrencias
del grupo de identidad dentro de la auditoría, registrando quién y cuándo
en cada una (R24 de #59) junto a la nota opcional del técnico.

**R21** — CUANDO un staff autorizado fusione un dispositivo consolidado con
el relevamiento manual, el sistema DEBE exigir el ítem-tabla y la fila
destino de ese relevamiento, registrar el vínculo
(`relevamiento_item_id`, `relevamiento_row_id`) y marcar `fusionado` en
todas las ocurrencias del grupo, con nota opcional.

**R22** — SI la fila destino de una fusión no existe en el relevamiento
manual de la misma auditoría (ítem inexistente, ítem que no es
`field_type='table'` de la plantilla de la auditoría, o `row_id` ausente en
`value.rows`) ENTONCES el sistema DEBE rechazar la fusión sin mutar nada.

**R23** — El sistema NO DEBE escribir en `audit_response` ni modificar las
filas del relevamiento manual en ninguna acción de la UI de revisión
(RQ-59-20 original: el dato manual nunca se sobrescribe desde el escaneo).

**R24** — CUANDO un staff autorizado desvincule un dispositivo fusionado,
el sistema DEBE limpiar el vínculo y devolver a `sin_revisar` las
ocurrencias del grupo que tenían ese vínculo, limpiando revisor y fecha.

**R25** — SI la fila manual vinculada fue eliminada del relevamiento (el
`row_id` ya no existe en `value.rows`) ENTONCES el sistema DEBE mostrar el
vínculo como roto en el detalle del dispositivo, ofreciendo re-vincular o
desvincular, sin modificar ningún dato.

**R26** — CUANDO un staff autorizado revierta un dispositivo a
`sin_revisar`, el sistema DEBE limpiar revisor y fecha de revisión en las
ocurrencias del grupo (semántica de `marcarRevision` de #59).

### Defensa en profundidad y errores

**R27** — Toda función nueva del repositorio de escaneos DEBE recibir
`empresaId` como parámetro obligatorio y aplicarlo en la misma query vía
join con `audit` (R26 de #59).

**R28** — SI se invoca una operación del repositorio con un `empresaId` que
no corresponde a la auditoría dueña de los datos ENTONCES el sistema DEBE
rechazarla sin escribir nada (R27 de #59).

**R29** — CUANDO una acción de la UI de escaneos falle, el sistema DEBE
responder `fail()` con un mensaje legible sin stack traces, SQL ni datos de
otras auditorías (patrón `failFromError`).

### Presentación mobile-first

**R30** — La lista de dispositivos consolidados DEBE presentarse como cards
en viewports menores a `lg` y como tabla en viewports `lg` o mayores
(patrón CRM del repo).

**R31** — Las acciones de revisión DEBEN presentarse con targets táctiles
de al menos `--sys-touch-min` y estados de revisión con badges de tokens
`--sys-*` (branding SyS, componentes de #42).

## Fuera de alcance (explícito)

| Tema | Feature | Motivo |
|---|---|---|
| Exclusión de `sin_revisar` del cómputo de scoring | #63 | #62 solo muestra estados y garantiza el dato (R25 de #59). |
| Diff entre escaneos | #64 | La provenance del consolidado es insumo, no diff. |
| Edición de campos del dispositivo escaneado | nunca | El dato del agente es inmutable salvo revisión; el técnico confirma/descarta/fusiona y anota, no edita. |
| Copia de datos escaneados hacia la fila manual | futura (ver OQ1 en design) | El acceptance prohíbe sobrescribir el dato manual; la copia asistida es una mejora aparte. |
| Badge de "vinculado" dentro del form de relevamiento | futura | El form no se toca en esta feature (R23). |
| Endpoints JSON públicos para revisión | — | La única consumidora es la UI (form actions); #63/#64 leen el repo server-side. |

## Material de referencia

- `specs/59_escaneo_modelo_datos/` — modelo, repo, R23/R24/R25, decisión de
  puerta multi-VLAN y FK diferida (fuente de verdad).
- `specs/60_escaneo_ingesta_api/` — endpoints y funciones de token; difiere
  a esta feature las pantallas de creación de escaneo y emisión de token.
- `specs/45_inventario_it_informe/` y `specs/26_feedback_inventario/` —
  realidad del inventario manual (`field_type='table'`, `value.rows`,
  `row_id` estable, borrado de filas legítimo).
