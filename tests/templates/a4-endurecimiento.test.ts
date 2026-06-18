import { describe, expect, it } from 'vitest';
import { scoreItem } from '../../src/lib/server/scoring/score-item';
import itV2 from '../../seed/templates/it-v2.json';

// ── Bloque 1: Estructura del seed (R1, R2, R3) ────────────────────────────────

describe('it-v2 A4 seed structure', () => {
  const a4 = itV2.sections.find((s) => s.code === 'A4')!;

  it('la sección A4 existe en el seed', () => {
    expect(a4).toBeDefined();
  });

  it('tiene exactamente 5 ítems (R1)', () => {
    expect(a4.items).toHaveLength(5);
  });

  it('cada ítem tiene help_text no vacío (R2)', () => {
    for (const item of a4.items) {
      expect(
        (item as { help_text?: string }).help_text,
        `ítem sort_order ${item.sort_order} debe tener help_text`
      ).toBeTruthy();
    }
  });

  it('sección mapeada a CIS 4 · NIST: Protect con has_score=true (R3)', () => {
    expect(a4.standard_ref).toBe('CIS 4 · NIST: Protect');
    expect(a4.has_score).toBe(true);
  });

  it('ítems con field_type correcto (R1)', () => {
    expect(a4.items[0].field_type).toBe('tri');
    expect(a4.items[1].field_type).toBe('tri');
    expect(a4.items[2].field_type).toBe('select');
    expect(a4.items[3].field_type).toBe('tri');
    expect(a4.items[4].field_type).toBe('tri');
  });

  it('ítem select (acceso remoto) tiene 3 choices y score_map completo (R6)', () => {
    const item = a4.items[2] as {
      options: {
        choices?: string[];
        score_map?: Record<string, number>;
      };
    };
    expect(item.options.choices).toHaveLength(3);
    expect(item.options.score_map!['Sí, por VPN o IP restringida']).toBe(100);
    expect(item.options.score_map!['Sí, solo cambió el puerto']).toBe(50);
    expect(item.options.score_map!['No, expuesto directamente a internet']).toBe(0);
  });

  it('ítems tri tienen score_map {si:100, parcial:50, no:0} (R5)', () => {
    const triItems = [0, 1, 3, 4];
    for (const idx of triItems) {
      const item = a4.items[idx] as { options: { score_map?: Record<string, number> } };
      expect(item.options.score_map!['si']).toBe(100);
      expect(item.options.score_map!['parcial']).toBe(50);
      expect(item.options.score_map!['no']).toBe(0);
    }
  });
});

// ── Bloque 2: Scoring de ítems A4 con scoreItem (R5, R6, R7) ─────────────────

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
    ['si', 100],
    ['parcial', 50],
    ['no', 0]
  ] as [string, number][])('tri value=%s → %i (R5)', (v, expected) => {
    expect(
      scoreItem({
        fieldType: 'tri',
        options: triOpts,
        value: v,
        na: false,
        scores: true,
        required: false,
        itemWeight: 1
      }).points
    ).toBe(expected);
  });

  it.each([
    ['Sí, por VPN o IP restringida', 100],
    ['Sí, solo cambió el puerto', 50],
    ['No, expuesto directamente a internet', 0]
  ] as [string, number][])('select acceso remoto value=%s → %i (R6)', (v, expected) => {
    expect(
      scoreItem({
        fieldType: 'select',
        options: selectOpts,
        value: v,
        na: false,
        scores: true,
        required: false,
        itemWeight: 1
      }).points
    ).toBe(expected);
  });

  it('ítem tri vacío → null (no requerido) (R7)', () => {
    expect(
      scoreItem({
        fieldType: 'tri',
        options: triOpts,
        value: null,
        na: false,
        scores: true,
        required: false,
        itemWeight: 1
      }).points
    ).toBeNull();
  });

  it('ítem select vacío → null (R7)', () => {
    expect(
      scoreItem({
        fieldType: 'select',
        options: selectOpts,
        value: null,
        na: false,
        scores: true,
        required: false,
        itemWeight: 1
      }).points
    ).toBeNull();
  });
});

// ── Bloque 3: Coherencia seed ↔ migración (R12) ───────────────────────────────

describe('coherencia seed ↔ migración', () => {
  const EXPECTED: Array<{ sort_order: number; fieldType: string; labelPrefix: string }> = [
    { sort_order: 0, fieldType: 'tri', labelPrefix: '¿El sistema operativo' },
    { sort_order: 1, fieldType: 'tri', labelPrefix: '¿Las credenciales' },
    { sort_order: 2, fieldType: 'select', labelPrefix: '¿El acceso remoto' },
    { sort_order: 3, fieldType: 'tri', labelPrefix: '¿El servidor tiene apagados' },
    { sort_order: 4, fieldType: 'tri', labelPrefix: '¿El firewall del propio' }
  ];

  it('los 5 ítems del seed coinciden con la definición de la migración (R12)', () => {
    const a4 = itV2.sections.find((s) => s.code === 'A4')!;
    for (const exp of EXPECTED) {
      const item = a4.items[exp.sort_order];
      expect(item.field_type, `sort_order ${exp.sort_order} field_type`).toBe(exp.fieldType);
      expect(
        item.label.startsWith(exp.labelPrefix),
        `sort_order ${exp.sort_order} label debe empezar con "${exp.labelPrefix}"`
      ).toBe(true);
    }
  });

  it('sort_orders son 0..4 consecutivos (R1)', () => {
    const a4 = itV2.sections.find((s) => s.code === 'A4')!;
    const orders = a4.items.map((i) => i.sort_order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3, 4]);
  });
});

// ── Bloque 4: No solapamiento con A6/A7/A9/A11/A12 (R4) ─────────────────────

describe('no solapamiento con otras secciones', () => {
  const a4Labels = itV2.sections.find((s) => s.code === 'A4')!.items.map((i) => i.label);

  it('A4 no menciona política de contraseñas ni MFA (A6)', () => {
    expect(a4Labels.some((l) => l.includes('MFA') || l.includes('política de contraseñas'))).toBe(
      false
    );
  });

  it('A4 no menciona parches ni actualizaciones (A7)', () => {
    expect(
      a4Labels.some((l) => l.includes('parche') || l.includes('actualización'))
    ).toBe(false);
  });

  it('A4 no menciona antivirus ni EDR (A9)', () => {
    expect(a4Labels.some((l) => l.includes('antivirus') || l.includes('EDR'))).toBe(false);
  });

  it('A4 no menciona firewall perimetral (A11/A12)', () => {
    expect(a4Labels.some((l) => l.includes('perimetral'))).toBe(false);
  });
});

// ── Bloque 5: Motor de scoring no falla con valores inesperados (R14) ─────────

describe('motor scoring no falla con edge cases', () => {
  const triOpts = { score_map: { si: 100, parcial: 50, no: 0 } };

  it('tri con valor desconocido → null (no lanza) (R14)', () => {
    const result = scoreItem({
      fieldType: 'tri',
      options: triOpts,
      value: 'valor_viejo_huerfano',
      na: false,
      scores: true,
      required: false,
      itemWeight: 1
    });
    expect(result.points).toBeNull();
  });

  it('select con valor no en score_map → null (R14)', () => {
    const result = scoreItem({
      fieldType: 'select',
      options: { score_map: { A: 100 } },
      value: 'respuesta_vieja',
      na: false,
      scores: true,
      required: false,
      itemWeight: 1
    });
    expect(result.points).toBeNull();
  });
});
