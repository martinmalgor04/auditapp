import { describe, it, expect } from 'vitest';
import { buildAnalysisPrompt } from '../src/lib/server/reunion/pipeline/analyze';
import type { TemplateContext } from '../src/lib/server/reunion/pipeline/context';

const CONTEXT: TemplateContext = {
  items: [
    {
      item_id: '11111111-1111-1111-1111-111111111111',
      label: '¿Backups automáticos?',
      section_title: 'Continuidad',
      help_text: '¿Existen backups automáticos y se prueba la restauración?',
      field_type: 'tri',
      options: null,
      filled_by: 'cliente',
      current_value: null
    }
  ]
};

describe('prompt endurecido (R6, R7)', () => {
  const prompt = buildAnalysisPrompt('transcript de prueba', CONTEXT);

  it('prohíbe inferir de controles vecinos / postura general (R6)', () => {
    expect(prompt).toMatch(/PROHIBIDO inferir/i);
    expect(prompt.toLowerCase()).toContain('postura general');
    expect(prompt.toLowerCase()).toContain('controles vecinos');
  });

  it('exige omitir el ítem si el cliente no habló del control puntual (R6)', () => {
    expect(prompt.toLowerCase()).toContain('omitir');
    expect(prompt.toLowerCase()).toContain('control puntual');
  });

  it('exige cita verbatim que responde esa pregunta puntual (R7)', () => {
    expect(prompt.toLowerCase()).toContain('verbatim');
    expect(prompt.toLowerCase()).toMatch(/cita textual/);
  });

  it('incluye help_text y section_title por ítem (R11)', () => {
    expect(prompt).toContain('Continuidad');
    expect(prompt).toContain('¿Existen backups automáticos y se prueba la restauración?');
  });
});
