import { describe, expect, it } from 'vitest';
import {
  loomUrlSchema,
  patchReportSchema,
  reportClientDraftSchema,
  reportClientDraftSchemaFor,
  reportInternalDraftSchema
} from '../src/lib/server/informe/schemas';
import {
  buildValidClientDraft,
  buildValidInternalDraft
} from './fixtures/informe-claude-mock';

const codes = ['A1', 'A2'];

describe('reportClientDraftSchema (R10, R16)', () => {
  it('acepta un payload completo válido', () => {
    expect(reportClientDraftSchema.safeParse(buildValidClientDraft(codes)).success).toBe(true);
  });

  it('rechaza sin resumen.diagnostico', () => {
    const draft = buildValidClientDraft(codes) as Record<string, never> & ReturnType<
      typeof buildValidClientDraft
    >;
    // @ts-expect-error mutación intencional
    delete draft.resumen.diagnostico;
    expect(reportClientDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rechaza diagnostico de más de 90 caracteres', () => {
    const draft = buildValidClientDraft(codes);
    draft.resumen.diagnostico = 'x'.repeat(91);
    expect(reportClientDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rechaza 6 riesgos', () => {
    const draft = buildValidClientDraft(codes);
    const item = draft.riesgos.items[0];
    draft.riesgos.items = [item, item, item, item, item, item];
    expect(reportClientDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rechaza 2 observaciones transversales', () => {
    const draft = buildValidClientDraft(codes);
    draft.hallazgos.lectura_transversal = draft.hallazgos.lectura_transversal.slice(0, 2);
    expect(reportClientDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rechaza etapa de plan sin semana', () => {
    const draft = buildValidClientDraft(codes);
    // @ts-expect-error mutación intencional
    delete draft.plan.etapas[0].semana;
    expect(reportClientDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rechaza circuito día a día con 2 funcionalidades', () => {
    const draft = buildValidClientDraft(codes);
    draft.dia_a_dia.circuitos[0].funcionalidades =
      draft.dia_a_dia.circuitos[0].funcionalidades.slice(0, 2);
    expect(reportClientDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('strict(): rechaza claves upsell / recomendaciones (R16)', () => {
    const conUpsell = { ...buildValidClientDraft(codes), upsell: ['vender más'] };
    expect(reportClientDraftSchema.safeParse(conUpsell).success).toBe(false);
    const conRecos = { ...buildValidClientDraft(codes), recomendaciones: [] };
    expect(reportClientDraftSchema.safeParse(conRecos).success).toBe(false);
  });

  it('circuitos_con_controles null es válido (placeholder a editar)', () => {
    const draft = buildValidClientDraft(codes);
    draft.resumen.circuitos_con_controles = null;
    expect(reportClientDraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe('reportInternalDraftSchema (R11)', () => {
  it('acepta payload válido', () => {
    expect(reportInternalDraftSchema.safeParse(buildValidInternalDraft()).success).toBe(true);
  });

  it('rechaza recomendación sin rango_estimado', () => {
    const draft = buildValidInternalDraft();
    // @ts-expect-error mutación intencional
    delete draft.recomendaciones_presupuesto[0].rango_estimado;
    expect(reportInternalDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('rechaza urgencia fuera de enum', () => {
    const draft = buildValidInternalDraft();
    // @ts-expect-error valor inválido intencional
    draft.recomendaciones_presupuesto[0].urgencia = 'urgentísima';
    expect(reportInternalDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('sin tope máximo de recomendaciones (decisión puerta 2)', () => {
    const base = buildValidInternalDraft().recomendaciones_presupuesto[0];
    const draft = { recomendaciones_presupuesto: Array.from({ length: 12 }, () => ({ ...base })) };
    expect(reportInternalDraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe('loomUrlSchema (R25)', () => {
  it('acepta URL https de loom.com', () => {
    expect(loomUrlSchema.safeParse('https://www.loom.com/share/abc123').success).toBe(true);
  });

  it('rechaza URL no-Loom y http', () => {
    expect(loomUrlSchema.safeParse('https://youtube.com/watch?v=1').success).toBe(false);
    expect(loomUrlSchema.safeParse('http://www.loom.com/share/abc').success).toBe(false);
  });
});

describe('reportClientDraftSchemaFor (#19 R7)', () => {
  it('erp e it comparten el schema base', () => {
    const draft = buildValidClientDraft(codes);
    expect(reportClientDraftSchemaFor('erp').safeParse(draft).success).toBe(true);
    expect(reportClientDraftSchemaFor('it').safeParse(draft).success).toBe(true);
    expect(reportClientDraftSchemaFor('erp')).toBe(reportClientDraftSchema);
    expect(reportClientDraftSchemaFor('it')).toBe(reportClientDraftSchema);
  });

  it('mixta acepta 5 circuitos dia_a_dia y erp rechaza', () => {
    const draft = buildValidClientDraft(codes);
    const base = draft.dia_a_dia.circuitos[0];
    draft.dia_a_dia.circuitos = [base, base, base, base, base];
    draft.hallazgos.lectura_transversal = [
      ...draft.hallazgos.lectura_transversal,
      { titulo: 'Extra 1', detalle: 'Detalle.' },
      { titulo: 'Extra 2', detalle: 'Detalle.' }
    ];
    expect(reportClientDraftSchemaFor('mixta').safeParse(draft).success).toBe(true);
    expect(reportClientDraftSchemaFor('erp').safeParse(draft).success).toBe(false);
  });

  it('strict(): claves extra rechazadas en las tres variantes', () => {
    const extra = { ...buildValidClientDraft(codes), upsell: ['x'] };
    expect(reportClientDraftSchemaFor('erp').safeParse(extra).success).toBe(false);
    expect(reportClientDraftSchemaFor('it').safeParse(extra).success).toBe(false);
    expect(reportClientDraftSchemaFor('mixta').safeParse(extra).success).toBe(false);
  });
});

describe('patchReportSchema', () => {
  it('exige client_draft o loom_url', () => {
    expect(patchReportSchema.safeParse({ origin: 'inline' }).success).toBe(false);
  });

  it('default origin = form', () => {
    const parsed = patchReportSchema.parse({ loom_url: null });
    expect(parsed.origin).toBe('form');
  });
});
