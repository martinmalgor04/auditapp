# Requirements — 59_escaneo_modelo_datos

> Capa de persistencia y contratos de tipos para el escaneo automatizado de
> red. Sin endpoints HTTP (#60), sin agente (#61), sin UI (#62), sin scoring
> (#63), sin diff (#64).
>
> Documento fuente: spec provisto por el usuario en chat (2026-08-27),
> adaptado al schema real del repo (`audit`, `empresa`, `app_user`) y a las
> convenciones (`docs/conventions.md`). Los `RQ-59-XX` originales se mapean a
> `R<n>` en cada sección.
>
> **Decisiones de puerta humana (2026-08-27):**
>
> 1. **Consentimiento condicionado por estado** (no rígido): un escaneo puede
>    crearse en `pendiente` sin consentimiento; la base garantiza que ningún
>    escaneo que haya corrido (o esté corriendo) exista sin consentimiento.
> 2. **Multi-VLAN con vista consolidada** por auditoría (afecta #62/#63, se
>    registra como decisión; el read-model se construye en #62).
> 3. **Sin purga** de escaneos ni de `raw`. Revisar con volumen real.
> 4. **No es una app aparte**: el agente (#61) es el componente externo; los
>    datos viven en AuditApp junto a la auditoría.

## Contexto verificado (repo real)

- `audit(id, empresa_id, assigned_tech_id, ...)` — `empresa_id` existe desde
  la migración 015 (rename de `client_id`).
- `empresa(id)` — entidad unificada de clientes/prospectos (#23).
- `app_user(id, role)` — usuarios staff (admin/tecnico).
- Convención SQL: tablas en singular, `created_at`/`updated_at`, enums como
  `text + CHECK`, `updated_at = now()` manual en cada UPDATE (no existe
  función trigger de timestamps).
- **No existe** tabla de relevamiento manual normalizada: el relevamiento es
  `audit_response` + `template_item` (data-driven).
- Modelo de acceso vigente (#33/#57): admin siempre; técnico solo si
  `techIsAssigned(auditId, userId)`. La empresa es un atributo de la
  auditoría, no un tenant.

## Requisitos

### Entidad escaneo

**R1** — CUANDO el sistema registre un escaneo, el sistema DEBE asociarlo a
exactamente una auditoría existente perteneciente a la empresa indicada.

**R2** — CUANDO el sistema registre un escaneo, el sistema DEBE persistir el
rango de red objetivo, el técnico responsable, la versión del agente y la
marca temporal de creación.

**R3** — El sistema DEBE mantener para cada escaneo un estado dentro del
conjunto `pendiente`, `en_curso`, `sincronizando`, `completado`, `fallido`,
`cancelado`.

**R4** — MIENTRAS un escaneo esté en estado `completado`, `fallido` o
`cancelado`, el sistema DEBE rechazar toda escritura de dispositivos,
software y servicios asociados.

**R5** — CUANDO una auditoría sea eliminada, el sistema DEBE eliminar en
cascada todos sus escaneos con sus dispositivos, software y servicios.

**R6** — El sistema DEBE permitir múltiples escaneos por auditoría (redes
segmentadas en VLANs relevadas desde distintos puntos).

**R7** — CUANDO un escaneo permanezca en estado `en_curso` o `sincronizando`
por más de 24 horas, el sistema DEBE exponerlo como candidato a marcado
`fallido` mediante una función de job.

**R8** — CUANDO se solicite la transición de un escaneo a `en_curso`, el
sistema DEBE rechazarla si el escaneo no tiene consentimiento registrado
(otorgado, por quién y cuándo).

**R9** — El sistema DEBE garantizar a nivel base de datos que todo escaneo
en estado `en_curso`, `sincronizando`, `completado` o `fallido` tiene
`consentimiento_otorgado`, `consentimiento_por` y `consentimiento_at`
completos.

**R10** — SI se solicita una transición de estado no contemplada en la
máquina de estados ENTONCES el sistema DEBE rechazarla sin mutar el escaneo.

### Dispositivos

**R11** — CUANDO el sistema persista un dispositivo, el sistema DEBE
asociarlo a exactamente un escaneo.

**R12** — El sistema DEBE calcular para cada dispositivo una clave de
identidad determinística: la MAC normalizada si está presente; en su
defecto, la IP.

**R13** — CUANDO se persista un dispositivo cuya clave de identidad ya
exista dentro del mismo escaneo, el sistema DEBE actualizar el registro
existente en lugar de crear uno nuevo.

**R14** — El sistema DEBE persistir el payload original recibido del agente
en una columna `jsonb`, sin transformación.

**R15** — El sistema DEBE normalizar toda MAC a 12 caracteres hex en
minúsculas antes de persistirla; SI la MAC no normaliza a ese formato
ENTONCES el sistema DEBE rechazarla.

**R16** — El sistema DEBE clasificar cada dispositivo en un tipo dentro del
conjunto `servidor`, `workstation`, `notebook`, `switch`, `router`,
`firewall`, `impresora`, `camara`, `nas`, `ups`, `telefonia`, `movil`,
`virtual`, `desconocido`.

**R17** — DONDE el agente no provea un campo, el sistema DEBE persistir
`NULL` y no un valor por defecto sintético.

**R18** — CUANDO un chunk entrante traiga un campo en `NULL` para un
dispositivo ya persistido con valor, el sistema DEBE conservar el valor
previo.

### Software y servicios

**R19** — CUANDO el sistema persista un registro de software, el sistema
DEBE asociarlo a exactamente un dispositivo.

**R20** — El sistema DEBE tratar la terna `(dispositivo, nombre, version)`
como única para software, ignorando re-inserciones idénticas.

**R21** — CUANDO el sistema persista un servicio de red, el sistema DEBE
asociarlo a exactamente un dispositivo y registrar puerto, protocolo y
estado del puerto.

**R22** — El sistema DEBE tratar la terna `(dispositivo, puerto, protocolo)`
como única para servicios, actualizando estado y versión ante
re-inserciones.

### Revisión humana

**R23** — El sistema DEBE registrar para cada dispositivo un estado de
revisión dentro del conjunto `sin_revisar`, `confirmado`, `descartado`,
`fusionado`, con default `sin_revisar`.

**R24** — CUANDO un dispositivo pase a un estado de revisión distinto de
`sin_revisar`, el sistema DEBE registrar quién lo revisó y cuándo.

**R25** — El sistema DEBE exponer el estado de revisión en toda lectura de
dispositivos, de modo que los consumidores (scoring #63, informe) puedan
excluir los `sin_revisar`.

### Defensa en profundidad por empresa

**R26** — El sistema DEBE aplicar el filtro de empresa (vía join con
`audit`) en toda operación del repositorio de escaneos, recibiendo
`empresaId` como parámetro obligatorio.

**R27** — SI se invoca una operación del repositorio con un `empresaId` que
no corresponde a la auditoría dueña del escaneo ENTONCES el sistema DEBE
rechazarla sin escribir nada.

> Nota de modelo: R26/R27 son **defensa en profundidad a nivel query**, no
> el mecanismo de autorización. La autorización real sigue el patrón
> #33/#57 (admin siempre; técnico solo `techIsAssigned`) y se aplica en la
> capa de rutas (#60 para el agente, #62 para la UI). La única función sin
> `empresaId` es el job de sistema de R7, que no se expone a rutas.

### Métricas

**R28** — CUANDO se persista un chunk de dispositivos, el sistema DEBE
actualizar `dispositivos_detectados` con el conteo real del escaneo.

## Diferido a features posteriores

| Tema | Feature | Motivo |
|---|---|---|
| Vinculación dispositivo ↔ relevamiento manual (RQ-59-20 original) | #62 | No existe tabla destino (`relevamiento_items`); el relevamiento es `audit_response`/`template_item`. La FK se define al diseñar la vinculación. |
| Exclusión de `sin_revisar` en scoring e informe | #63 | #59 solo garantiza el dato (R23/R25). |
| Vista consolidada multi-VLAN (dedup por MAC con provenance) | #62 | Decisión de puerta 2026-08-27; el read-model es de la UI de revisión. |
| Endpoints HTTP + token de escaneo | #60 | Fuera de alcance. |
| Agente `sys-scan-agent` y Open-AudIT | #61 | Fuera de alcance. |
| Credenciales de cliente | nunca | Viven cifradas y efímeras en la notebook (#61). |
