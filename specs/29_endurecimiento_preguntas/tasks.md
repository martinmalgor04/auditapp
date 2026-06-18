# Tasks — 29_endurecimiento_preguntas

> Pasos de implementación en orden. Cada task referencia los R que cubre.
> El implementer marca `[x]` al completar cada uno.

---

## [x] T1 — Crear migración SQL 019_a4_endurecimiento.sql

**Cubre:** R8, R9, R10, R11 (revisado en design §4), R13, R14

Crear `/Users/martinmalgor/Developer/servicios-y-sistemas/sysaudit/auditapp/migrations/018_a4_endurecimiento.sql`.

El bloque `DO $$` debe:

1. Resolver `v_section_id` via join `template (code='it', version='v2') → section
   (code='A4')`. Si no existe, `RAISE NOTICE` y `RETURN` (R9).

2. Obtener los `id` de los 2 ítems A4 viejos por `section_id + label`:
   - `'Endurecimiento de servidores'`
   - `'¿Se deshabilitan servicios innecesarios?'`

3. Borrar las `audit_response` vinculadas a esos `item_id` (FK requiere este paso
   previo al borrar template_item) — R11 revisado en design §4:
   ```sql
   DELETE FROM audit_response WHERE item_id IN (SELECT id FROM template_item
     WHERE section_id = v_section_id AND label IN (...));
   ```

4. Borrar los 2 `template_item` viejos (R10):
   ```sql
   DELETE FROM template_item WHERE section_id = v_section_id AND label IN (...);
   ```

5. Insertar los 5 ítems nuevos con UUIDs fijos y `ON CONFLICT (id) DO NOTHING`
   (idempotencia R8). Usar los UUIDs de design §5. Cada INSERT incluye:
   - `section_id`, `label`, `help_text` (textos de design §2)
   - `method = ARRAY['O']`, `field_type`, `options` (jsonb con `score_map` y
     `choices` donde aplique)
   - `filled_by = 'tecnico'`, `allow_na = false`, `required = false`,
     `scores = true`, `item_weight = 1`, `sort_order` (0..4)

El DELETE de `audit_response` es idempotente (no hay filas que borrar la 2da vez).
El DELETE de `template_item` también (no existe). Los INSERT tienen `ON CONFLICT DO
NOTHING`. Toda la migración es idempotente (R8).

---

## [x] T2 — Actualizar seed/templates/it-v2.json

**Cubre:** R1, R2, R3, R4, R5, R6, R12

Reemplazar el bloque `items` de la sección con `"code": "A4"` en
`seed/templates/it-v2.json` por los 5 ítems definidos en design §2.

Cada ítem en el JSON debe tener:
- `sort_order`: 0 a 4
- `label`: exactamente igual al de la migración (para coherencia seed↔migración)
- `help_text`: texto completo de design §2
- `field_type`: `"tri"` para ítems 0,1,3,4; `"select"` para ítem 2
- `method`: `["O"]`
- `filled_by`: `"tecnico"`
- `scores`: `true` (omitir la clave si el seed runner usa `true` como default)
- `options`:
  - Para `tri`: `{ "score_map": { "si": 100, "parcial": 50, "no": 0 } }`
  - Para `select` (ítem 2): `{ "choices": [...], "score_map": {...} }` según design §2

La sección A4 en el JSON conserva:
- `"code": "A4"`, `"title": "Configuración segura"`, `"standard_ref": "CIS 4 ·
  NIST: Protect"`, `"weight": "alto"`, `"has_score": true` (R3).

---

## [x] T3 — Crear tests en tests/templates/a4-endurecimiento.test.ts

**Cubre:** R1, R2, R3, R5, R6, R7, R8, R10, R11, R12, R13, R14

Crear `/Users/martinmalgor/Developer/servicios-y-sistemas/sysaudit/auditapp/tests/templates/a4-endurecimiento.test.ts`.

Seguir el estilo del repo (vitest, sin `@testing-library`, imports directos).

### Bloque 1 — Estructura del seed (R1, R2, R3, R12)

```ts
import itV2 from '../../seed/templates/it-v2.json';

describe('it-v2 A4 seed structure', () => {
  const a4 = itV2.sections.find(s => s.code === 'A4')!;

  it('tiene exactamente 5 ítems', () => { expect(a4.items).toHaveLength(5); });

  it('cada ítem tiene help_text no vacío', () => {
    for (const item of a4.items) {
      expect(item.help_text).toBeTruthy();
    }
  });

  it('sección mapeada a CIS 4 · NIST: Protect', () => {
    expect(a4.standard_ref).toBe('CIS 4 · NIST: Protect');
    expect(a4.has_score).toBe(true);
  });

  it('ítems con field_type correcto', () => {
    expect(a4.items[0].field_type).toBe('tri');
    expect(a4.items[1].field_type).toBe('tri');
    expect(a4.items[2].field_type).toBe('select');
    expect(a4.items[3].field_type).toBe('tri');
    expect(a4.items[4].field_type).toBe('tri');
  });

  it('ítem select (acceso remoto) tiene 3 choices y score_map completo', () => {
    const item = a4.items[2];
    expect(item.options.choices).toHaveLength(3);
    expect(item.options.score_map['Sí, por VPN o IP restringida']).toBe(100);
    expect(item.options.score_map['Sí, solo cambió el puerto']).toBe(50);
    expect(item.options.score_map['No, expuesto directamente a internet']).toBe(0);
  });
});
```

### Bloque 2 — Scoring de ítems A4 con scoreItem (R5, R6, R7)

```ts
import { scoreItem } from '../../src/lib/server/scoring/score-item';

describe('scoring ítems A4 nuevos', () => {
  const triOpts = { score_map: { si: 100, parcial: 50, no: 0 } };
  const selectOpts = {
    score_map: {
      'Sí, por VPN o IP restringida': 100,
      'Sí, solo cambió el puerto': 50,
      'No, expuesto directamente a internet': 0
    }
  };

  it.each([
    ['si', 100], ['parcial', 50], ['no', 0]
  ])('tri value=%s → %i', (v, expected) => {
    expect(scoreItem({ fieldType:'tri', options: triOpts, value: v, na: false,
      scores: true, required: false, itemWeight: 1 }).points).toBe(expected);
  });

  it.each([
    ['Sí, por VPN o IP restringida', 100],
    ['Sí, solo cambió el puerto', 50],
    ['No, expuesto directamente a internet', 0]
  ])('select acceso remoto value=%s → %i', (v, expected) => {
    expect(scoreItem({ fieldType:'select', options: selectOpts, value: v, na: false,
      scores: true, required: false, itemWeight: 1 }).points).toBe(expected);
  });

  it('ítem tri vacío → null (no requerido)', () => {
    expect(scoreItem({ fieldType:'tri', options: triOpts, value: null, na: false,
      scores: true, required: false, itemWeight: 1 }).points).toBeNull();
  });
});
```

### Bloque 3 — Coherencia seed ↔ migración SQL (R12)

Comparar los labels, field_type, sort_order y keys del score_map del seed JSON
contra los valores extraídos o hardcodeados de la migración SQL:

```ts
describe('coherencia seed ↔ migración', () => {
  const EXPECTED = [
    { sort_order: 0, fieldType: 'tri',   labelPrefix: '¿El sistema operativo' },
    { sort_order: 1, fieldType: 'tri',   labelPrefix: '¿Las credenciales' },
    { sort_order: 2, fieldType: 'select',labelPrefix: '¿El acceso remoto' },
    { sort_order: 3, fieldType: 'tri',   labelPrefix: '¿El servidor tiene apagados' },
    { sort_order: 4, fieldType: 'tri',   labelPrefix: '¿El firewall del propio' },
  ];

  it('los 5 ítems del seed coinciden con la definición', () => {
    const a4 = itV2.sections.find(s => s.code === 'A4')!;
    for (const exp of EXPECTED) {
      const item = a4.items[exp.sort_order];
      expect(item.field_type).toBe(exp.fieldType);
      expect(item.label.startsWith(exp.labelPrefix)).toBe(true);
    }
  });
});
```

### Bloque 4 — No solapamiento con A6/A7/A9/A11/A12 (R4)

```ts
describe('no solapamiento con otras secciones', () => {
  const a4Labels = itV2.sections.find(s => s.code === 'A4')!.items.map(i => i.label);

  it('A4 no menciona política de contraseñas ni MFA (A6)', () => {
    expect(a4Labels.some(l => l.includes('MFA') || l.includes('política de contraseñas'))).toBe(false);
  });

  it('A4 no menciona parches ni actualizaciones (A7)', () => {
    expect(a4Labels.some(l => l.includes('parche') || l.includes('actualización'))).toBe(false);
  });

  it('A4 no menciona antivirus ni EDR (A9)', () => {
    expect(a4Labels.some(l => l.includes('antivirus') || l.includes('EDR'))).toBe(false);
  });

  it('A4 no menciona firewall perimetral (A11/A12)', () => {
    expect(a4Labels.some(l => l.includes('perimetral'))).toBe(false);
  });
});
```

---

## [x] T4 — Verificar idempotencia de la migración (manual o test de integración)

**Cubre:** R8

Si el repo tiene infraestructura para tests de integración con DB (verificar en
`tests/` si existe algún patrón):

- Aplicar `018_a4_endurecimiento.sql` dos veces sobre una DB de test.
- Verificar que la segunda ejecución no lanza error.
- Verificar que A4 tiene exactamente 5 `template_item` tras cada ejecución.

Si no hay tests de integración con DB, documentar en `progress/impl_29_endurecimiento_preguntas.md`
que la idempotencia se verificó manualmente en la DB de desarrollo.

---

## [x] T5 — Ejecutar pnpm test y pnpm run check

**Cubre:** todos los R (no-regresión general)

- `pnpm test` debe pasar incluyendo los nuevos tests del T3.
- `pnpm run check` no debe arrojar errores de tipos (el JSON seed no tiene tipos
  estrictos en TypeScript, pero el seed runner sí los parsea con Zod — verificar
  que el JSON nuevo pasa la validación del seed runner).
- Los tests de scoring existentes (`tests/scoring/`) deben seguir verdes (R14).

---

## [x] T6 — Actualizar progress/current.md

Documentar en `progress/current.md`:
- Que se aplicó la migración 018 en la DB de desarrollo.
- Si había respuestas A4 en auditorías existentes (y cuántas se borraron).
- Confirmar tests verdes.
