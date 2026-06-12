import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { sanitizeAnthropicJsonSchema } from '../src/lib/server/informe/anthropic-json-schema';
import { buildOutputFormat } from '../src/lib/server/informe/claude';
import { reportDraftEnvelopeSchema } from '../src/lib/server/informe/schemas';

function collectRefs(node: unknown, path = '', out: { path: string; ref: string }[] = []): typeof out {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, path, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.$ref === 'string') {
    out.push({ path, ref: obj.$ref });
  }
  for (const [key, val] of Object.entries(obj)) {
    if (key === '$ref') continue;
    collectRefs(val, path ? `${path}/${key}` : key, out);
  }
  return out;
}

function collectIntegerMinimums(node: unknown, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectIntegerMinimums(item, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  if (obj.type === 'integer' && 'minimum' in obj) {
    out.push(obj);
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') collectIntegerMinimums(val, out);
  }
  return out;
}

describe('sanitizeAnthropicJsonSchema', () => {
  it('elimina minimum/maximum de enteros que Anthropic rechaza', () => {
    const raw = zodToJsonSchema(reportDraftEnvelopeSchema, { target: 'jsonSchema7' });
    expect(collectIntegerMinimums(raw).length).toBeGreaterThan(0);

    const sanitized = sanitizeAnthropicJsonSchema(raw);
    expect(collectIntegerMinimums(sanitized)).toHaveLength(0);
  });

  it('buildOutputFormat expone schema sin minimum en integer', () => {
    const format = buildOutputFormat();
    expect(collectIntegerMinimums(format.schema)).toHaveLength(0);
    expect(format.type).toBe('json_schema');
  });

  it('buildOutputFormat no usa $ref bajo properties (Anthropic lo rechaza)', () => {
    const format = buildOutputFormat();
    const refs = collectRefs(format.schema);
    expect(refs).toHaveLength(0);
  });
});
