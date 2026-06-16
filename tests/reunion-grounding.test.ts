import { describe, it, expect } from 'vitest';
import {
  normalizeQuote,
  isGrounded,
  dropUngrounded,
  type GuardableProposal
} from '../src/lib/server/reunion/pipeline/grounding';

const TRANSCRIPT =
  'Usamos Tango  hace 5 años.\n  Los BACKUPS se hacen   automáticos cada noche. Nunca probamos la restauración.';

function prop(over: Partial<GuardableProposal>): GuardableProposal {
  return { item_id: 'i1', proposed_value: 'x', quote: 'q', confidence: 0.9, ...over };
}

describe('grounding — normalizeQuote (R8)', () => {
  it('colapsa espacios, hace trim y minúsculas', () => {
    expect(normalizeQuote('  Hola   MUNDO\n\t ')).toBe('hola mundo');
  });
});

describe('grounding — isGrounded (R8)', () => {
  it('una cita que difiere sólo en espacios/caso sobrevive (es substring normalizado)', () => {
    expect(isGrounded('Los backups se hacen automáticos cada noche', TRANSCRIPT)).toBe(true);
    expect(isGrounded('USAMOS TANGO HACE 5 AÑOS', TRANSCRIPT)).toBe(true);
  });

  it('una cita inexistente en el transcript no está grounded', () => {
    expect(isGrounded('contratamos un firewall nuevo', TRANSCRIPT)).toBe(false);
  });

  it('cita vacía o sólo espacios no está grounded', () => {
    expect(isGrounded('   ', TRANSCRIPT)).toBe(false);
  });
});

describe('grounding — dropUngrounded (R8)', () => {
  it('descarta la propuesta con cita inexistente y conserva la grounded', () => {
    const grounded = prop({ item_id: 'ok', quote: 'usamos tango   hace 5 años' });
    const hallucinated = prop({ item_id: 'bad', quote: 'capacitación en ciberseguridad anual' });
    const { kept, dropped } = dropUngrounded([grounded, hallucinated], TRANSCRIPT);
    expect(kept.map((p) => p.item_id)).toEqual(['ok']);
    expect(dropped.map((p) => p.item_id)).toEqual(['bad']);
  });
});
