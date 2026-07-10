import { describe, expect, it } from 'vitest';
import { injectSurveyBeforeBodyClose } from '../src/lib/server/informe/manual-serve';
import { surveyResponseSchema } from '../src/lib/server/informe/survey';

describe('informe manual survey inject (#58)', () => {
  it('inyecta form compatible con surveyResponseSchema (1–5 + boolean)', () => {
    const out = injectSurveyBeforeBodyClose('<html><body>x</body></html>', 'tok', {
      id: 'share-1'
    });

    expect(out).toMatch(/name="valoracion_global"/);
    expect(out).toMatch(/value="5"/);
    expect(out).toMatch(/name="claridad_informe"/);
    expect(out).toMatch(/name="conforme_hallazgos"/);
    expect(out).toMatch(/value="true"/);
    expect(out).toMatch(/value="false"/);
    expect(out).not.toMatch(/muy_satisfecho/);
    expect(out).not.toMatch(/muy_clara/);
    expect(out).not.toMatch(/totalmente_conforme/);

    const parsed = surveyResponseSchema.safeParse({
      valoracion_global: '5',
      claridad_informe: '4',
      conforme_hallazgos: 'true',
      comentario: 'ok'
    });
    expect(parsed.success).toBe(true);
  });
});
