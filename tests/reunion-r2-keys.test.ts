import { describe, it, expect } from 'vitest';
import { buildReunionR2Key } from '../src/lib/server/storage/r2-keys';

describe('buildReunionR2Key', () => {
  const R2_KEY_PATTERN = /^audits\/[0-9a-f-]+\/_reunion\/[0-9a-f-]+\.(webm|m4a|mp3)$/;

  it('genera key con formato correcto para webm', () => {
    const auditId = crypto.randomUUID();
    const key = buildReunionR2Key(auditId, 'webm');
    expect(key).toMatch(R2_KEY_PATTERN);
    expect(key).toContain(`audits/${auditId}/_reunion/`);
    expect(key).toMatch(/\.webm$/);
  });

  it('genera key con formato correcto para m4a', () => {
    const auditId = crypto.randomUUID();
    const key = buildReunionR2Key(auditId, 'm4a');
    expect(key).toMatch(R2_KEY_PATTERN);
    expect(key).toMatch(/\.m4a$/);
  });

  it('genera key con formato correcto para mp3', () => {
    const auditId = crypto.randomUUID();
    const key = buildReunionR2Key(auditId, 'mp3');
    expect(key).toMatch(R2_KEY_PATTERN);
    expect(key).toMatch(/\.mp3$/);
  });

  it('usa el uuid proporcionado', () => {
    const auditId = crypto.randomUUID();
    const uuid = '11111111-2222-3333-4444-555555555555';
    const key = buildReunionR2Key(auditId, 'webm', uuid);
    expect(key).toBe(`audits/${auditId}/_reunion/${uuid}.webm`);
    expect(key).toMatch(R2_KEY_PATTERN);
  });

  it('cada llamada sin uuid genera claves distintas', () => {
    const auditId = crypto.randomUUID();
    const key1 = buildReunionR2Key(auditId, 'webm');
    const key2 = buildReunionR2Key(auditId, 'webm');
    expect(key1).not.toBe(key2);
  });
});
