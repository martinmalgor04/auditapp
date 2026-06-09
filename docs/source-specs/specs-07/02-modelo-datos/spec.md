# Spec 07a — Modelo de datos (Postgres)

| Campo | Valor |
|---|---|
| **ID** | SPEC-07a |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | El esquema Postgres y el modelo data-driven de plantillas |

---

## 1. Propósito

Definir el esquema de base de datos. El diseño tiene dos mitades que se tocan en un solo punto:

- **Definición** (plantillas) — *data-driven*: las plantillas IT/ERP viven como datos (`template → section → item`), no como código. Editar una pregunta = editar una fila.
- **Instancia** (auditorías) — cada auditoría apunta a una versión de plantilla y guarda una `response` por ítem.

El punto de contacto es `audit_response.item_id → template_item.id`.

---

## 2. Diagrama de relaciones

```
DEFINICIÓN (plantillas, versionado)        INSTANCIA (auditorías)
┌─────────────┐                            ┌──────────┐      ┌──────────────┐
│  template   │1                          1│  client  │1    *│    audit     │
│ (it/erp/…)  │──┐                         └──────────┘──────│  (instancia) │
└─────────────┘  │ *                                         └──────┬───────┘
       1│        │                                            1│    │1
        │*       │                                             │    │
┌──────────────┐ │                              ┌──────────────┘    └──────────────┐
│   section    │ │                             *│                                  1│
│ (A1, B7, CAB)│ │                       ┌──────────────────┐            ┌──────────────────┐
└──────┬───────┘ │                       │ audit_response   │            │  audit_closure   │
      1│         │                       │ (1 × ítem)       │            │ (índices, riesgos)│
       │*        │                       └────────┬─────────┘            └──────────────────┘
┌──────────────┐ │                                │ item_id
│ template_item│◀┘  ◀───────────────────────────────┘
│ (pregunta)   │                         ┌──────────────────┐   ┌──────────────────┐
└──────────────┘                         │ audit_section_   │   │   attachment     │
                                         │ score            │   │ (foto/export→R2) │
AUTH                                     └──────────────────┘   └──────────────────┘
┌──────────┐   ┌──────────┐
│ app_user │1 *│ session  │     (token de cliente vive como columna en `audit.public_token`)
└──────────┘   └──────────┘
```

---

## 3. Tablas

Convenciones: PK `id` = `uuid` (default `gen_random_uuid()`), timestamps `timestamptz` (`created_at`/`updated_at`), borrado lógico con `archived_at` donde aplica. Tipos abajo en pseudo-SQL (la migración real la define [SPEC-07h](../10-deploy-dokploy/spec.md)).

### 3.1 Definición de plantillas (data-driven)

**`template`** — una plantilla versionada (IT, ERP Tango, ERP Estándar).
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| code | text | `it` · `erp-tango` · `erp-estandar` |
| name | text | "Auditoría Técnica IT" |
| version | text | "v2.1" |
| status | text | `draft` · `active` · `archived` |
| created_at | timestamptz | |

> Una auditoría referencia una fila de `template` (versión congelada). Publicar una nueva versión = nueva fila `template` + sus secciones/ítems; las auditorías viejas siguen apuntando a la versión con la que se cargaron.

**`section`** — sección/dimensión de una plantilla (A1…A14, B1…, o la cabecera `CAB`).
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| template_id | uuid FK → template | |
| code | text | `CAB` (cabecera) · `A1` · `B7` … |
| title | text | "Inventario de activos / hardware" |
| objective | text | el subtítulo/objetivo de la sección |
| standard_ref | text | "CIS 1 · NIST: Identify" |
| weight | text | `bajo` · `medio` · `alto` · `muy_alto` (peso en el índice) |
| has_score | boolean | la cabecera `CAB` no puntúa |
| sort_order | int | orden de despliegue |

**`template_item`** — un ítem a relevar (una "pregunta") dentro de una sección.
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| section_id | uuid FK → section | |
| label | text | "¿Existe inventario de equipos documentado?" |
| help_text | text | aclaración opcional (las notas en *cursiva* de las plantillas) |
| method | text[] | columna **Cómo**: subconjunto de `O,E,C,X` |
| field_type | text | ver §3.2 |
| options | jsonb | para `select`/`multiselect`: `["WPA2","WPA3","abierto"]`; para `table`: definición de columnas |
| is_prefillable | boolean | el **⚡** de las plantillas |
| prefill_source | text | `briefing` · `dns` · `whois` · `registro_sys` · `null` |
| filled_by | text | quién lo carga: `admin` (cabecera) · `cliente` (briefing) · `tecnico` (campo) |
| allow_na | boolean | si admite **N/A** sin penalizar |
| required | boolean | |
| sort_order | int | |

### 3.2 Tipos de campo (`field_type`) — derivados de la columna "Registrar"

| field_type | Cubre en las plantillas | Valor guardado en `response.value` (jsonb) |
|---|---|---|
| `text` | "texto", "nombre", "descripción", "detalle" | `"..."` |
| `number` | "número", "horas", "%" | `42` |
| `bool` | "sí/no" | `true`/`false` |
| `tri` | "sí/no/parcial" | `"si"`/`"no"`/`"parcial"` |
| `select` | "selección" (una opción) | `"WPA3"` |
| `multiselect` | "multi" (auditores presentes) | `["Facu","Simón"]` |
| `date` | "fecha" | `"2026-06-30"` |
| `datetime` | "fecha-hora" (inicio/fin) | ISO 8601 |
| `list` | "lista" (top riesgos, EOL detectados) | `["item a","item b"]` |
| `table` | "tabla equipos", shadow IT, VLANs | `[{col:val,…}, …]` según `options.columns` |
| `file_ref` | "captura/foto", "export" (`[C]`/`[X]`) | referencia(s) a `attachment` por ítem |
| `money` | "$/mes" (shadow IT) | `1500` |

> Las **sub-tablas** de las plantillas (tabla de equipos, shadow IT, VLANs) son `field_type = 'table'` con la grilla de columnas en `options.columns` (cada columna: `key`, `label`, `type`). Las filas se guardan como array de objetos en `response.value`.

### 3.3 Instancia: auditorías

**`client`** — empresa auditada (reutilizable entre auditorías).
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| razon_social | text | |
| cuit | text | |
| rubro | text | |
| created_at | timestamptz | |

**`audit`** — una auditoría concreta.
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| client_id | uuid FK → client | |
| name | text | etiqueta legible ("Playadito — IT — jun 2026") |
| types | text[] | `{it}` · `{erp-tango}` · `{it,erp-tango}` (combo) |
| template_ids | uuid[] | versiones de plantilla congeladas para esta auditoría |
| segment | text | `A` · `B` · `C` |
| status | text | ver §4 |
| assigned_tech_id | uuid FK → app_user | técnico responsable |
| created_by | uuid FK → app_user | admin que la creó |
| scheduled_at | timestamptz | fecha de la visita |
| public_token | text unique | token del briefing (random, ~32 bytes base64url) |
| token_expires_at | timestamptz | vencimiento del link de briefing |
| closed_at | timestamptz | |
| created_at | timestamptz | |

**`audit_response`** — una respuesta por ítem por auditoría.
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid FK → audit | |
| item_id | uuid FK → template_item | |
| value | jsonb | según `field_type` (§3.2) |
| na | boolean | marcado N/A |
| observations | text | nota libre del ítem |
| source | text | `admin` · `cliente` · `tecnico` (quién cargó el dato) |
| updated_by | uuid FK → app_user | null si lo cargó el cliente |
| updated_at | timestamptz | clave para autosave |
| UNIQUE (audit_id, item_id) | | upsert por ítem |

**`audit_section_score`** — score y observación por sección.
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid FK → audit | |
| section_id | uuid FK → section | |
| score | int | 0–100, null si N/A toda la sección |
| observations | text | |
| UNIQUE (audit_id, section_id) | | |

**`audit_closure`** — el cierre (1:1 con audit).
| Col | Tipo | Notas |
|---|---|---|
| audit_id | uuid PK FK → audit | |
| indice_it | int | 0–100, null si no aplica |
| indice_erp | int | 0–100, null si no aplica |
| indice_global | int | combinación ponderada IT+ERP |
| top_risks | jsonb | lista de riesgos (texto + severidad) |
| quick_wins | jsonb | lista de quick wins de costo cero |
| upsell_findings | jsonb | hallazgos internos (no se muestran al cliente) |
| next_step | text | próximo paso acordado |
| closed_by | uuid FK → app_user | |
| closed_at | timestamptz | |

**`attachment`** — foto/export en R2 (detalle en [SPEC-07g](../06-storage-r2/spec.md)).
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| audit_id | uuid FK → audit | |
| item_id | uuid FK → template_item | null = adjunto general del cierre |
| r2_key | text | clave del objeto en el bucket |
| filename | text | nombre original |
| content_type | text | |
| size_bytes | bigint | |
| kind | text | `photo` (`[C]`) · `export` (`[X]`) |
| uploaded_by | uuid FK → app_user | null si lo subió el cliente |
| created_at | timestamptz | |

### 3.4 Auth

**`app_user`** — usuario interno.
| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| name | text | |
| password_hash | text | argon2id |
| role | text | `admin` · `tecnico` |
| active | boolean | |
| created_at | timestamptz | |

**`session`** — sesión por cookie (detalle en [SPEC-07b](../03-auth-roles/spec.md)).
| Col | Tipo | Notas |
|---|---|---|
| id | text PK | token de sesión (hash) |
| user_id | uuid FK → app_user | |
| expires_at | timestamptz | |
| created_at | timestamptz | |

> El acceso del **cliente** no tiene tabla propia: se resuelve con `audit.public_token` + `token_expires_at`.

---

## 4. Máquina de estados de `audit.status`

```
borrador ──▶ briefing_enviado ──▶ briefing_completo ──▶ en_relevamiento ──▶ en_cierre ──▶ cerrada
   │              │ (link al cliente)    │ (cliente OK)       │ (técnico carga)    │           │
   └──────────────┴── el admin puede saltear briefing si carga los básicos a mano ┘           │
                                                                          (reabrir desde cerrada → en_cierre, solo admin)
```

| Estado | Quién actúa | Qué pasa |
|---|---|---|
| `borrador` | admin | Auditoría creada, cabecera común cargada, técnico asignado |
| `briefing_enviado` | admin → cliente | Token generado, link enviado; esperando al cliente |
| `briefing_completo` | cliente | Cliente completó los datos básicos (`filled_by='cliente'`) |
| `en_relevamiento` | técnico | Carga en campo en curso (autosave) |
| `en_cierre` | técnico/admin | Relevamiento completo; se calculan scores e índices |
| `cerrada` | admin | Cierre confirmado; salida estructurada lista para la IA |

El briefing es **opcional**: si el cliente no responde, el admin/técnico carga esos campos a mano y se pasa directo a `en_relevamiento`.

---

## 5. Reglas de integridad

- `audit_response` upsert por `(audit_id, item_id)` → habilita autosave idempotente.
- Borrar un `template` activo no debe romper auditorías: las versiones se archivan (`status='archived'`), nunca se borran si hay auditorías que las referencian.
- `public_token` indexado y único; se invalida al pasar a `cerrada` o al vencer `token_expires_at`.
- Un ítem con `filled_by='cliente'` es editable por el cliente solo mientras `status ∈ {briefing_enviado, briefing_completo}`; después es de solo lectura para el token.
- `attachment.r2_key` único; al borrar una auditoría se encolan los objetos R2 para borrado (no se borran en caliente).

---

## 6. Dependencias

- **Define el contrato** que consumen [07c backoffice](../04-backoffice/spec.md), [07d briefing](../05-briefing-externo/spec.md), [07e form técnico](../07-form-tecnico-mobile/spec.md) y [07f cierre](../08-cierre-auditoria/spec.md).
- **Traducción 1:1** de las plantillas [SPEC-04](../../../specs/04-plantillas-auditoria/spec.md) (columnas Registrar/Cómo → `field_type`/`method`).
- **Migraciones y ORM:** [SPEC-07h](../10-deploy-dokploy/spec.md).

---

## 7. Criterios de aceptación

- [ ] Las 3 plantillas v2 se cargan completas como filas `template/section/template_item` sin perder ningún ítem ni la columna Cómo/Registrar.
- [ ] Una auditoría combo (IT+ERP) referencia dos plantillas y no duplica la cabecera.
- [ ] `audit_response` soporta todos los `field_type` incluidos `table` (sub-grillas) y `file_ref`.
- [ ] La máquina de estados impide editar el briefing tras el cierre.
- [ ] Seed inicial: 1 admin, 2 técnicos, las 3 plantillas activas.

---

## 8. Estado y pendientes

- [ ] Definir el mapa `weight → factor numérico` para el índice (ver [07f](../08-cierre-auditoria/spec.md)).
- [ ] Decidir si `client` guarda más campos de cabecera o si todo va como `audit_response` de la sección `CAB` (v1: cabecera = sección `CAB` data-driven; `client` mínimo para reuso/listado).
- [ ] Índices de performance: `audit(status)`, `audit(client_id)`, `audit_response(audit_id)`.
