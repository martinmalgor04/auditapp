import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { sanitizeAnthropicJsonSchema } from '../src/lib/server/informe/anthropic-json-schema';
import { reportDraftEnvelopeSchema } from '../src/lib/server/informe/schemas';

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
});
