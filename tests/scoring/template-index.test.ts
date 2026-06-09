import { describe, expect, it } from 'vitest';
import { SECTION_WEIGHT_FACTORS } from '../../src/lib/server/scoring/constants';
import { scoreAudit } from '../../src/lib/server/scoring/score-audit';
import { scoreTemplate } from '../../src/lib/server/scoring/score-template';
import type { AuditResponseRow, SectionRow, TemplateItemRow } from '../../src/lib/server/scoring/types';

const templateId = 'tpl-1';
const secA: SectionRow = { id: 's-a', templateId, code: 'A1', title: 'A1', weight: 'bajo', hasScore: true };
const secB: SectionRow = { id: 's-b', templateId, code: 'A2', title: 'A2', weight: 'medio', hasScore: true };
const secCab: SectionRow = { id: 's-cab', templateId, code: 'CAB', title: 'Cab', weight: 'alto', hasScore: true };
const secNa: SectionRow = { id: 's-na', templateId, code: 'NA1', title: 'NA', weight: 'muy_alto', hasScore: true };

const itemA: TemplateItemRow = {
  id: 'i-a',
  sectionId: 's-a',
  fieldType: 'bool',
  options: {},
  scores: true,
  required: false,
  itemWeight: 1
};
const itemB: TemplateItemRow = {
  id: 'i-b',
  sectionId: 's-b',
  fieldType: 'bool',
  options: {},
  scores: true,
  required: false,
  itemWeight: 1
};
const itemCab: TemplateItemRow = {
  id: 'i-cab',
  sectionId: 's-cab',
  fieldType: 'text',
  options: {},
  scores: false,
  required: false,
  itemWeight: 1
};
const itemNa: TemplateItemRow = {
  id: 'i-na',
  sectionId: 's-na',
  fieldType: 'bool',
  options: {},
  scores: true,
  required: false,
  itemWeight: 1
};

describe('template index', () => {
  it('applies weight factors bajo1 medio2 alto3 muy_alto5', () => {
    expect(SECTION_WEIGHT_FACTORS).toEqual({ bajo: 1, medio: 2, alto: 3, muy_alto: 5 });
  });

  it('excludes CAB and all-na sections from denominator', () => {
    const responses = new Map<string, AuditResponseRow>([
      ['i-a', { itemId: 'i-a', value: true, na: false }],
      ['i-b', { itemId: 'i-b', value: false, na: false }],
      ['i-na', { itemId: 'i-na', value: null, na: true }]
    ]);

    const result = scoreTemplate(
      templateId,
      [secA, secB, secCab, secNa],
      [itemA, itemB, itemCab, itemNa],
      responses
    );

    const expected = Math.round(
      (100 * SECTION_WEIGHT_FACTORS.bajo + 0 * SECTION_WEIGHT_FACTORS.medio) /
        (SECTION_WEIGHT_FACTORS.bajo + SECTION_WEIGHT_FACTORS.medio)
    );
    expect(result.score).toBe(expected);
    expect(result.sectionScores.map((s) => s.code)).not.toContain('CAB');
    expect(result.sectionScores.map((s) => s.code)).not.toContain('NA1');
  });

  it('combo audit stores separate it and erp indices without global', () => {
    const itTpl = 'tpl-it';
    const erpTpl = 'tpl-erp';
    const sections: SectionRow[] = [
      { id: 's-it', templateId: itTpl, code: 'A1', title: 'IT', weight: 'bajo', hasScore: true },
      { id: 's-erp', templateId: erpTpl, code: 'E1', title: 'ERP', weight: 'alto', hasScore: true }
    ];
    const items: TemplateItemRow[] = [
      { id: 'i-it', sectionId: 's-it', fieldType: 'bool', options: {}, scores: true, required: false, itemWeight: 1 },
      { id: 'i-erp', sectionId: 's-erp', fieldType: 'bool', options: {}, scores: true, required: false, itemWeight: 1 }
    ];
    const responses: AuditResponseRow[] = [
      { itemId: 'i-it', value: true, na: false },
      { itemId: 'i-erp', value: false, na: false }
    ];

    const result = scoreAudit(
      [
        { id: itTpl, code: 'it' },
        { id: erpTpl, code: 'erp-tango' }
      ],
      sections,
      items,
      responses
    );

    expect(result.indiceIt).toBe(100);
    expect(result.indiceErp).toBe(0);
    expect(result).not.toHaveProperty('indiceGlobal');
  });
});
