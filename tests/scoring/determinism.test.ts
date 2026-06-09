import { describe, expect, it } from 'vitest';
import { scoreAudit } from '../../src/lib/server/scoring/score-audit';
import type { AuditResponseRow, SectionRow, TemplateItemRow } from '../../src/lib/server/scoring/types';

const FIXED_DATE = new Date('2026-01-15T12:00:00Z');

function fixture() {
  const templateId = 'tpl-it';
  const sections: SectionRow[] = [
    { id: 's1', templateId, code: 'A1', title: 'Sec', weight: 'medio', hasScore: true }
  ];
  const items: TemplateItemRow[] = [
    {
      id: 'i1',
      sectionId: 's1',
      fieldType: 'select',
      options: { score_map: { ok: 100, bad: 0 } },
      scores: true,
      required: false,
      itemWeight: 2
    },
    {
      id: 'i2',
      sectionId: 's1',
      fieldType: 'tri',
      options: {},
      scores: true,
      required: false,
      itemWeight: 1
    }
  ];
  const responses: AuditResponseRow[] = [
    { itemId: 'i1', value: 'ok', na: false },
    { itemId: 'i2', value: 'parcial', na: false }
  ];
  return {
    templates: [{ id: templateId, code: 'it' }],
    sections,
    items,
    responses
  };
}

describe('scoring determinism', () => {
  it('same fixture run twice yields identical outputs', () => {
    const f = fixture();
    const a = scoreAudit(f.templates, f.sections, f.items, f.responses, FIXED_DATE);
    const b = scoreAudit(f.templates, f.sections, f.items, f.responses, FIXED_DATE);

    expect(a).toEqual(b);
    expect(a.indiceIt).toBe(b.indiceIt);
    expect(a.sectionScores[0]?.score).toBe(b.sectionScores[0]?.score);
    expect(a.sectionScores[0]?.breakdown).toEqual(b.sectionScores[0]?.breakdown);
  });
});
