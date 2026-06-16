import { describe, it, expect } from 'vitest';
import { dedupeByQuote, type GuardableProposal } from '../src/lib/server/reunion/pipeline/grounding';

function prop(over: Partial<GuardableProposal>): GuardableProposal {
  return { item_id: 'i1', proposed_value: 'x', quote: 'q', confidence: 0.5, ...over };
}

describe('dedup — dedupeByQuote (R9)', () => {
  it('tres propuestas con la misma cita normalizada → sobrevive la de mayor confidence', () => {
    const a = prop({ item_id: 'a', quote: 'misma   contraseña hace 8 años', confidence: 0.6 });
    const b = prop({ item_id: 'b', quote: 'Misma contraseña hace 8 años', confidence: 0.95 });
    const c = prop({ item_id: 'c', quote: 'misma contraseña hace 8 años', confidence: 0.7 });
    const { kept, dropped } = dedupeByQuote([a, b, c]);
    expect(kept).toHaveLength(1);
    expect(kept[0].item_id).toBe('b');
    expect(dropped.map((p) => p.item_id).sort()).toEqual(['a', 'c']);
  });

  it('citas distintas no se deduplican', () => {
    const a = prop({ item_id: 'a', quote: 'cita uno' });
    const b = prop({ item_id: 'b', quote: 'cita dos' });
    const { kept } = dedupeByQuote([a, b]);
    expect(kept).toHaveLength(2);
  });

  it('empate de confidence → sobrevive exactamente una, determinístico (menor item_id)', () => {
    const z = prop({ item_id: 'z', quote: 'cita repetida', confidence: 0.8 });
    const a = prop({ item_id: 'a', quote: 'cita repetida', confidence: 0.8 });
    const run1 = dedupeByQuote([z, a]);
    const run2 = dedupeByQuote([a, z]);
    expect(run1.kept).toHaveLength(1);
    expect(run2.kept).toHaveLength(1);
    expect(run1.kept[0].item_id).toBe('a');
    expect(run2.kept[0].item_id).toBe('a');
  });
});
