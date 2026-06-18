# Requirements — 29_endurecimiento_preguntas

> Reescritura de la sección A4 "Configuración segura" de la plantilla it-v2:
> los 2 ítems actuales (jerga sin help_text) se reemplazan por 5 preguntas
> observables en lenguaje llano, cada una con help_text que indica qué mirar
> en el servidor. El mapeo a CIS 4 · NIST Protect y el scoring 0/50/100 se
> mantienen. Las respuestas A4 ya guardadas en auditorías existentes no se
> rompen. EARS estricto.

## Contexto verificado (código real)

### A4 actual en seed/templates/it-v2.json

La sección A4 tiene exactamente 2 ítems:

- **sort_order 0** — `"Endurecimiento de servidores"` · `field_type: "select"` ·
  choices: `["Aplicado", "Parcial", "No aplicado"]` · score_map: `{Aplicado: 100,
  Parcial: 50, No aplicado: 0}` · sin `help_text`.
- **sort_order 1** — `"¿Se deshabilitan servicios innecesarios?"` · `field_type:
  "bool"` · sin `help_text`.

Ninguno tiene `help_text` (columna existe en `template_item` pero está vacía aquí).

### Motor de scoring relevante (score-item.ts)

- `bool`: `true → 100`, `false → 0`.
- `tri`: usa `options.score_map` si existe, si no el default `{si:100, parcial:50, no:0}`.
- `select`: requiere `options.score_map`; devuelve `null` si la key no está en el mapa.

### Solapamiento verificado con otras secciones

| Sección | Cubre |
|---|---|
| A6 · CIS 6 | Política de contraseñas, MFA — gestión de cuentas de usuario |
| A7 · CIS 7 | Parches de seguridad, días de demora — gestión de vulnerabilidades |
| A9 · CIS 10 | Antivirus/EDR en endpoints — protección contra malware |
| A11 · CIS 12 | Segmentación de red, firewall perimetral activo |
| A12 · CIS 13 | Reglas de firewall documentadas, filtrado de salida a internet |

A4 (CIS 4) es configuración segura del servidor en sí mismo: SO con soporte,
credenciales de fábrica eliminadas, acceso remoto protegido, servicios innecesarios
apagados y firewall del host activo. No duplica A6 (cuentas de usuario), A7 (parches),
A9 (malware en endpoints) ni A11/A12 (firewall perimetral/red).

### Modelo de datos de respuestas existentes

`audit_response` vincula `item_id` → `template_item.id`. Cuando un ítem se
reemplaza (nuevo `id`), la respuesta antigua queda huérfana lógicamente: no rompe
la FK (el `template_item` antiguo sigue en DB si se preserva) pero ya no aparece
en el form ni en el scoring porque no pertenece a ningún ítem activo de la sección.

La migración debe definir una política explícita: los ítems A4 viejos se eliminan
del template pero las `audit_response` ligadas a sus `id` se conservan (no se
borran en cascada) — quedan como datos históricos inertes. El scoring de
auditorías ya cerradas recalcula sobre los ítems activos, por lo que las
respuestas huérfanas no afectan el índice.

### Patrón de migración idempotente (ref. migration 014)

El patrón del repo usa bloques `DO $$ … $$` con:
- Resolución de `section_id` por join `template → section WHERE code = 'A4'`.
- `DELETE` de ítems existentes por `section_id` con guarda de idempotencia.
- `INSERT … ON CONFLICT (id) DO NOTHING` con UUIDs fijos.

---

## Requirements (EARS)

### Contenido de la sección A4

**R1** — La sección A4 de la plantilla it-v2 DEBE contener exactamente 5 ítems
observables con los siguientes labels, field_type y scoring:

| sort_order | Label | field_type | Score |
|---|---|---|---|
| 0 | ¿El sistema operativo del servidor tiene soporte vigente del fabricante? | tri | si=100, parcial=50, no=0 |
| 1 | ¿Las credenciales de fábrica (usuarios y contraseñas predeterminados) fueron cambiadas o deshabilitadas? | tri | si=100, parcial=50, no=0 |
| 2 | ¿El acceso remoto al servidor (RDP, SSH) está protegido? | select | Sí, por VPN o IP restringida=100 / Sí, solo cambió el puerto=50 / No, expuesto directamente a internet=0 |
| 3 | ¿El servidor tiene apagados los servicios y programas que no necesita? | tri | si=100, parcial=50, no=0 |
| 4 | ¿El firewall del propio servidor (Windows Firewall, iptables, ufw) está activo y configurado? | tri | si=100, parcial=50, no=0 |

**R2** — Cada uno de los 5 ítems DEBE tener un `help_text` no vacío que describa
qué observar o verificar concretamente en el servidor para poder responder la
pregunta. (Textos definidos en design.md §2.)

**R3** — La sección A4 DEBE seguir mapeada a `standard_ref = "CIS 4 · NIST: Protect"`
y mantener `weight = "alto"`, `has_score = true`.

**R4** — Los 5 ítems nuevos NO DEBEN duplicar controles ya cubiertos en otras
secciones: A6 (política de contraseñas de usuarios, MFA), A7 (parches de
seguridad), A9 (antivirus/EDR en endpoints), A11 (segmentación de red), A12
(reglas de firewall perimetral/salida a internet).

### Scoring

**R5** — CUANDO el técnico responde un ítem `tri` de A4, el sistema DEBE calcular
el puntaje usando `options.score_map = { "si": 100, "parcial": 50, "no": 0 }`.

**R6** — CUANDO el técnico responde el ítem de acceso remoto (sort_order 2,
field_type `select`), el sistema DEBE calcular el puntaje usando el `score_map`
explícito: `{"Sí, por VPN o IP restringida": 100, "Sí, solo cambió el puerto": 50,
"No, expuesto directamente a internet": 0}`.

**R7** — CUANDO todos los ítems de A4 están sin responder, el puntaje de la
sección DEBE ser `null` (no contribuye al índice, comportamiento estándar del motor
existente para ítems vacíos no requeridos).

### Migración SQL

**R8** — La migración SQL DEBE ser idempotente: ejecutada dos veces sobre la misma
base de datos, el resultado DEBE ser idéntico al de una sola ejecución, sin error
y sin duplicados.

**R9** — La migración DEBE identificar la sección A4 del template it-v2 por join
`template (code='it', version='v2') → section (code='A4')`, nunca por UUID
hardcodeado del template o sección.

**R10** — La migración DEBE eliminar los 2 ítems A4 existentes del template
(los registros `template_item` con `section_id` de A4 y los labels actuales)
e insertar los 5 ítems nuevos con UUIDs fijos, en la misma transacción atómica.

**R11** — Las filas de `audit_response` vinculadas a los `item_id` de los
2 ítems A4 eliminados DEBEN conservarse en la base de datos (no borrado en
cascada) como datos históricos inertes. La migración NO DEBE borrar `audit_response`.

### Seed

**R12** — El archivo `seed/templates/it-v2.json` DEBE reflejar exactamente los
mismos 5 ítems (labels, field_type, options con score_map, help_text, sort_order)
que la migración SQL, de modo que un re-seed desde cero produzca el mismo resultado
que aplicar las migraciones.

### Compatibilidad con auditorías existentes

**R13** — CUANDO la migración se aplica sobre una instancia con auditorías que
tienen respuestas A4 guardadas (vinculadas a los 2 ítems viejos), esas auditorías
DEBEN seguir cargando sin error en el form técnico y en el cierre. Las respuestas
huérfanas DEBEN ser ignoradas por el motor de scoring (no contribuyen al índice).

**R14** — El motor de scoring NO DEBE producir un error al encontrar `audit_response`
con `item_id` que ya no pertenece a ningún `template_item` activo de la sección
(comportamiento ya garantizado por el motor existente: solo itera sobre los ítems
del template, no sobre todas las respuestas).

---

## Trazabilidad R ↔ verificación

| R | Verificación |
|---|---|
| R1 | test: el seed/JSON tiene 5 ítems en A4 con los labels y field_type correctos |
| R2 | test: cada ítem de A4 tiene `help_text` no vacío |
| R3 | test: la sección A4 en el seed tiene `standard_ref = "CIS 4 · NIST: Protect"` y `has_score = true` |
| R4 | revisión manual en spec: labels sin solapamiento con A6/A7/A9/A11/A12 |
| R5 | test: `scoreItem({ fieldType:'tri', options:{score_map:{si:100,parcial:50,no:0}}, value:'parcial', … }).points === 50` |
| R6 | test: `scoreItem({ fieldType:'select', options:{score_map:{...}}, value:'Sí, solo cambió el puerto', … }).points === 50` |
| R7 | test: sección A4 con todas respuestas vacías → `scoreSection` devuelve `null` |
| R8 | test: ejecutar la migración SQL dos veces no lanza error y la tabla tiene 5 ítems en A4 |
| R9 | revisión del SQL: no contiene UUID hardcodeado de template/section |
| R10 | test de migración: tras aplicarla, A4 tiene exactamente 5 template_item |
| R11 | test: tras migración, las audit_response con item_id de los ítems viejos siguen existiendo en DB |
| R12 | test: coherencia seed↔migración — los UUIDs de los 5 ítems son los mismos en ambos |
| R13 | test: auditoría con respuestas A4 antiguas carga sin error; score de la sección es null (no hubo respuestas nuevas) |
| R14 | test: motor scoring no falla con item_id huérfano (respuesta sin template_item activo) |

---

## Open questions

Ninguna. Las decisiones de diseño (qué 5 preguntas, política de compatibilidad,
patrón de migración) están resueltas en este spec.
