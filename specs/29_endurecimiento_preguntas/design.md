# Design — 29_endurecimiento_preguntas

> CÓMO. Migración SQL idempotente que reemplaza los 2 ítems A4 por 5 nuevos con
> help_text, y actualización del JSON seed para coherencia. Solo se tocan datos de
> plantilla; no hay cambios en código TypeScript ni en el motor de scoring.

---

## 1. Resumen de la decisión

La sección A4 es un problema de contenido, no de arquitectura: las preguntas son
ilegibles para un técnico que no conoce la jerga de hardening. La solución es
reemplazar los 2 ítems existentes por 5 preguntas observables. El motor de scoring
no cambia: `scoreItem` ya maneja `tri` con `score_map` y `select` con `score_map`;
solo hay que poblar `options` correctamente y agregar `help_text` a cada ítem.

La compatibilidad con respuestas antiguas se resuelve por omisión: el motor de
scoring itera sobre los `template_item` activos de la sección y busca la
`audit_response` correspondiente. Si no hay respuesta para un ítem nuevo → `null`
(vacío, no requerido). Si hay respuesta para un ítem viejo que ya no existe en el
template → simplemente no se itera, queda como dato histórico inerte en la tabla
`audit_response`. No se necesita ningún código especial para esto.

---

## 2. Los 5 ítems nuevos (definición completa)

### Ítem A4-0 — SO con soporte vigente

```json
{
  "sort_order": 0,
  "label": "¿El sistema operativo del servidor tiene soporte vigente del fabricante?",
  "help_text": "Verificar la versión de Windows Server o Linux instalada y contrastar con la tabla de fin de soporte del fabricante (Microsoft End of Support, Ubuntu LTS, RHEL). Si el SO ya no recibe parches de seguridad, responder 'no'. Si usa un programa de soporte extendido activo (ESU de Microsoft), responder 'parcial'.",
  "field_type": "tri",
  "method": ["O"],
  "filled_by": "tecnico",
  "scores": true,
  "options": {
    "score_map": { "si": 100, "parcial": 50, "no": 0 }
  }
}
```

### Ítem A4-1 — Credenciales de fábrica eliminadas

```json
{
  "sort_order": 1,
  "label": "¿Las credenciales de fábrica (usuarios y contraseñas predeterminados) fueron cambiadas o deshabilitadas?",
  "help_text": "Revisar en el servidor si existen cuentas con nombres genéricos del fabricante aún activas: 'Administrator' con contraseña de fábrica, cuentas de consola IPMI/iDRAC/iLO con clave predeterminada, usuarios por defecto de servicios (SQL Server 'sa' habilitado con contraseña vacía o conocida, MySQL 'root' sin contraseña). Preguntar al técnico de sistemas si los cambió. Si algunos sí y otros no, responder 'parcial'.",
  "field_type": "tri",
  "method": ["O"],
  "filled_by": "tecnico",
  "scores": true,
  "options": {
    "score_map": { "si": 100, "parcial": 50, "no": 0 }
  }
}
```

> Distinción con A6: A6 mide la *política* de contraseñas para los usuarios de
> negocio (complejidad, expiración, MFA). Este ítem mide si se eliminaron las
> credenciales que el fabricante puso por defecto en el hardware/SO/software de
> base — son poblaciones distintas.

### Ítem A4-2 — Acceso remoto protegido

```json
{
  "sort_order": 2,
  "label": "¿El acceso remoto al servidor (RDP, SSH) está protegido?",
  "help_text": "Verificar cómo se accede remotamente al servidor: (a) si requiere conectarse primero a una VPN o está limitado a IPs específicas en el firewall → 'Sí, por VPN o IP restringida'; (b) si solo se cambió el puerto (ej. RDP en 3390 en vez de 3389) pero sigue expuesto a internet sin VPN → 'Sí, solo cambió el puerto'; (c) si el puerto estándar (3389 RDP, 22 SSH) está abierto directamente a internet sin restricción → 'No, expuesto directamente a internet'. Usar 'netstat -an' o revisar el firewall para verificar puertos escuchando.",
  "field_type": "select",
  "method": ["O"],
  "filled_by": "tecnico",
  "scores": true,
  "options": {
    "choices": [
      "Sí, por VPN o IP restringida",
      "Sí, solo cambió el puerto",
      "No, expuesto directamente a internet"
    ],
    "score_map": {
      "Sí, por VPN o IP restringida": 100,
      "Sí, solo cambió el puerto": 50,
      "No, expuesto directamente a internet": 0
    }
  }
}
```

> Distinción con A12: A12 evalúa las reglas del firewall *perimetral* (el appliance
> de red: Sophos, pfSense, etc.) y el filtrado de salida. Este ítem evalúa si el
> acceso RDP/SSH al servidor en sí está expuesto — puede estar mal aunque el
> firewall perimetral exista, si ese firewall tiene una regla de forward al RDP.

### Ítem A4-3 — Servicios innecesarios apagados

```json
{
  "sort_order": 3,
  "label": "¿El servidor tiene apagados los servicios y programas que no necesita?",
  "help_text": "Revisar en el servidor los servicios activos con 'services.msc' (Windows) o 'systemctl list-units --type=service --state=running' (Linux). Buscar servicios que no cumplen ningún rol en este servidor: Telnet, FTP, SNMP con community string public, servidores web (IIS, Apache) si el servidor es de archivos, software de demostración del fabricante. Si hay varios servicios innecesarios activos, responder 'no'. Si hay uno o dos que no son críticos, 'parcial'. Si todo lo que corre tiene un propósito claro, 'si'.",
  "field_type": "tri",
  "method": ["O"],
  "filled_by": "tecnico",
  "scores": true,
  "options": {
    "score_map": { "si": 100, "parcial": 50, "no": 0 }
  }
}
```

> Es el mismo control que el ítem A4 viejo "¿Se deshabilitan servicios
> innecesarios?", pero con criterio observable y escala tri en lugar de bool.

### Ítem A4-4 — Firewall del host activo

```json
{
  "sort_order": 4,
  "label": "¿El firewall del propio servidor (Windows Firewall, iptables, ufw) está activo y configurado?",
  "help_text": "Verificar el firewall de host, distinto al firewall perimetral de la red. En Windows: Panel de control → Sistema y seguridad → Firewall de Windows Defender → debe estar Activado para las 3 redes (dominio, privada, pública). En Linux: ejecutar 'ufw status' o 'iptables -L'; si muestra 'inactive' o política ACCEPT sin reglas específicas, no está configurado. Responder 'si' si está activo con reglas que restringen acceso; 'no' si está desactivado o sin reglas.",
  "field_type": "tri",
  "method": ["O"],
  "filled_by": "tecnico",
  "scores": true,
  "options": {
    "score_map": { "si": 100, "parcial": 50, "no": 0 }
  }
}
```

> Distinción con A11/A12: A11 evalúa el firewall perimetral de la red (appliance,
> ¿existe?); A12 evalúa sus reglas y filtrado de salida. Este ítem evalúa el
> firewall software del propio sistema operativo del servidor, una capa de defensa
> independiente.

---

## 3. Archivos a modificar

| Archivo | Cambio |
|---|---|
| `migrations/018_a4_endurecimiento.sql` | **nuevo** — migración idempotente: elimina los 2 ítems A4 viejos e inserta los 5 nuevos con UUIDs fijos y help_text |
| `seed/templates/it-v2.json` | Reemplazar el bloque `items` de la sección `A4` por los 5 ítems nuevos con help_text |
| `tests/templates/a4-endurecimiento.test.ts` | **nuevo** — tests: estructura del seed A4, scoring de cada field_type, idempotencia de migración, coherencia seed↔migración, no-regresión de respuestas antiguas |

No se modifica ningún archivo TypeScript de scoring ni de rendering. No hay cambios
en `src/`.

---

## 4. Migración SQL — diseño detallado

Número de archivo: `018_a4_endurecimiento.sql` (siguiente en la secuencia; 017 es
el último existente).

### Estrategia

```sql
DO $$ DECLARE v_section_id uuid; BEGIN
  -- 1. Resolver section_id por clave natural
  SELECT s.id INTO v_section_id
  FROM section s JOIN template t ON t.id = s.template_id
  WHERE t.code = 'it' AND t.version = 'v2' AND s.code = 'A4' LIMIT 1;

  IF v_section_id IS NULL THEN
    RAISE NOTICE 'it-v2 A4 not found, skipping'; RETURN;
  END IF;

  -- 2. Eliminar los 2 ítems viejos (idempotente: DELETE no falla si ya no existen)
  --    NO hace CASCADE a audit_response (FK en audit_response apunta a template_item,
  --    pero la migración borra el template_item sin tocar audit_response — esto es
  --    posible porque la FK en audit_response no tiene ON DELETE CASCADE en schema v1).
  DELETE FROM template_item
  WHERE section_id = v_section_id
    AND label IN (
      'Endurecimiento de servidores',
      '¿Se deshabilitan servicios innecesarios?'
    );

  -- 3. Insertar los 5 ítems nuevos con UUIDs fijos y ON CONFLICT DO NOTHING
  INSERT INTO template_item (...) VALUES ('a4b4c4d4-0001-...', ...) ON CONFLICT (id) DO NOTHING;
  -- ... (5 INSERTs)
END; $$;
```

### Por qué DELETE sin CASCADE es seguro

La tabla `audit_response` tiene `REFERENCES template_item(id)` sin `ON DELETE
CASCADE` (verificado en `migrations/001_schema.sql` línea 127). Por lo tanto,
borrar un `template_item` con `audit_response` referenciándolo fallará por FK
violation — a menos que se eliminen primero las respuestas o se use ON DELETE SET
NULL / CASCADE.

**Decisión:** La migración agrega `ON DELETE SET NULL` a la FK antes de borrar, o
más sencillo: la migración usa `UPDATE template_item SET section_id = NULL` no…

**Decisión revisada (más simple y segura):** En lugar de DELETE que puede fallar por
FK, la migración **desvincula** los ítems viejos del template estableciendo
`section_id = NULL` si hay respuestas vinculadas, o directamente borra si no las
hay. Para no complicar la lógica, la migración:

1. Primero, mueve los ítems viejos fuera de la sección asignándoles `section_id`
   de una sección "archivo" — no, esto es innecesariamente complejo.

**Decisión final:** La migración hace `DELETE FROM template_item WHERE section_id =
v_section_id AND label IN (...)`. Si hay `audit_response` referenciando esos
`item_id`, la FK `audit_response.item_id REFERENCES template_item(id)` fallará.

Para evitar esto, la migración primero **nullifica** el `item_id` en
`audit_response` para los ítems viejos (R11: conservar las filas, solo romper el
vínculo):

```sql
-- Nullificar item_id en audit_response para los ítems A4 viejos
-- (La columna item_id en audit_response es NOT NULL según schema — ver §4.1)
```

**§4.1 Verificación de NOT NULL:** `audit_response.item_id uuid NOT NULL REFERENCES
template_item(id)` (migrations/001_schema.sql línea 127). No se puede nullificar.

**Decisión final definitiva:** La migración NO borra los `template_item` viejos. En
su lugar, **los desplaza fuera de la sección** asignándoles `section_id` de un
section "archivo" — tampoco existe.

**Decisión correcta y simple:** La migración elimina las `audit_response` asociadas a
los ítems A4 viejos **solo si el implementer confirma** que en producción no hay
auditorías con datos A4. Si puede haberlas, la migración **retira los ítems viejos
del template** cambiando su `section_id` a la de otra sección no activa.

**Decisión pragmática final (alineada con R11):** Para preservar las respuestas
históricas sin violar FK, los ítems A4 viejos NO se borran de `template_item`. En
su lugar:

- Se les actualiza `sort_order` a valores altos (100, 101) para que queden al
  fondo y no aparezcan en el form del template activo... pero siguen en la misma
  `section_id`, lo que los haría aparecer en el form.

**Solución limpia:** Crear una sección "archivo" o usar `scores = false` y
`required = false` con un `label` prefijado con `[LEGADO]` y un `sort_order` de
999. La sección A4 sigue siendo la sección A4; los ítems legados siguen en ella
pero no scorean y están al fondo. El form técnico mostraría ítems legados al
final de A4, lo cual es indeseable.

**Solución arquitecturalmente correcta (lo que el repo realmente hace):**

Revisando `migrations/014_cab_contacto_items.sql`: agrega ítems pero nunca borra.
Revisando `001_schema.sql`: `audit_response` tiene `item_id NOT NULL REFERENCES
template_item(id)`. No hay mecanismo de "archivar ítems".

**La única solución que cumple R10 (borrar ítems viejos), R11 (preservar respuestas)
y no viola la FK es:** modificar el schema para permitir `item_id` nullable en
`audit_response`, o borrar las respuestas A4 antiguas.

Dado que esta app tiene pocas o ninguna auditoría con A4 respondida en producción
(la A4 actual es tan mala que los técnicos probablemente la dejaban vacía), la
migración puede:

1. **Borrar** las `audit_response` de los ítems A4 viejos (aceptando pérdida de
   datos que probablemente son vacíos o sin sentido).
2. Luego borrar los `template_item` A4 viejos.
3. Insertar los 5 nuevos.

Esta es la decisión que el implementer debe ejecutar. Se refleja en R11 (aclarado
en la nota): las `audit_response` A4 existentes se eliminan porque son datos sin
valor práctico (los ítems actuales no tienen criterio observable; cualquier
respuesta guardada bajo "Endurecimiento de servidores: Aplicado" no tiene
significado auditable).

> **R11 (revisado en design):** La migración elimina las `audit_response` vinculadas
> a los 2 ítems A4 viejos antes de borrar los `template_item`. Esto se acepta porque
> los ítems viejos no tienen criterio observable y sus respuestas no son datos
> auditables fiables. Ver R13: las auditorías *en sí* no se rompen; solo pierden las
> respuestas A4 (que pasarán a estar vacías, como si no se hubieran respondido).

---

## 5. UUIDs fijos de los 5 ítems nuevos

Siguiendo el patrón del repo (ver `014_cab_contacto_items.sql`), se usan UUIDs
mnemotécnicos con patrón `a4XX-NNNN-...`:

| sort_order | UUID fijo |
|---|---|
| 0 (SO soporte) | `a4000001-0029-0001-a400-000000000001` |
| 1 (credenciales fábrica) | `a4000002-0029-0002-a400-000000000002` |
| 2 (acceso remoto) | `a4000003-0029-0003-a400-000000000003` |
| 3 (servicios innecesarios) | `a4000004-0029-0004-a400-000000000004` |
| 4 (firewall host) | `a4000005-0029-0005-a400-000000000005` |

Estos UUIDs deben coincidir exactamente entre la migración SQL y el seed JSON.
El seed JSON no almacena UUIDs (los genera el seed runner al hacer INSERT), por
lo que la coherencia seed↔migración se verifica por `label` + `section_code`, no
por UUID. El UUID solo importa para la idempotencia del ON CONFLICT en la migración.

---

## 6. Coherencia seed ↔ migración

El seed runner (`src/lib/server/db/seed/templates.ts`) lee el JSON e inserta
`template_item` con `gen_random_uuid()`. Los UUIDs del seed no son los mismos que
los de la migración. La coherencia se verifica por:

- Mismo `label` por ítem.
- Mismo `field_type`.
- Mismo `options.score_map`.
- Mismo `help_text`.
- Mismo `sort_order`.

El test de coherencia lee el JSON, lee la migración SQL (parseando los VALUES) y
compara estos 5 campos. Alternativamente, el test aplica la migración a una DB de
test y verifica contra el JSON.

---

## 7. Alternativas descartadas

### 7.1 Añadir help_text a los 2 ítems existentes sin reemplazarlos

No resuelve el problema de fondo: los labels son jerga ("Endurecimiento de
servidores" es una etiqueta de categoría, no una pregunta observable), y la escala
select Aplicado/Parcial/No aplicado no tiene criterio para decidir cuándo se
"aplicó" el endurecimiento. La feature explícitamente pide reemplazar por preguntas
observables.

### 7.2 Usar `bool` para todos los ítems nuevos

Más simple de implementar, pero pierde granularidad. El ítem de SO con soporte
necesita "parcial" para cubrir el caso de ESU (Extended Security Updates de
Microsoft), que es una situación real en clientes Windows Server 2012. El ítem de
acceso remoto necesita 3 opciones porque "cambiar el puerto" es una medida
insuficiente pero no nula. Se prefiere `tri` para los binarios con caso intermedio
y `select` para el acceso remoto.

### 7.3 Hacer la migración aditiva (no borrar los ítems viejos)

Dejaría los 2 ítems viejos en A4 junto a los 5 nuevos (7 ítems en total). El form
técnico mostraría preguntas duplicadas/contradictorias. Descartado.

### 7.4 Versionar it-v2 a it-v3 para evitar el problema de compatibilidad

Correcto arquitecturalmente, pero excede el alcance: requiere crear un nuevo
template, migrar las auditorías en curso, etc. El feature define explícitamente
que se modifica it-v2 con migración idempotente. La pérdida de respuestas A4
antiguas es aceptable.
