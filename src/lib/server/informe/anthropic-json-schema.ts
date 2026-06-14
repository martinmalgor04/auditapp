/**
 * Anthropic structured outputs:
 * - No acepta minimum/maximum en type integer (sanitizamos).
 * - No acepta minItems > 1 ni maxItems en arrays (sanitizamos; Zod valida post-parse).
 * - No acepta $ref definidos bajo properties (buildOutputFormat usa $refStrategy: 'none').
 * La validación fuerte sigue en reportDraftEnvelopeSchema.parse() post-respuesta.
 */

function isIntegerType(type: unknown): boolean {
  return type === 'integer' || (Array.isArray(type) && type.includes('integer'));
}

export function sanitizeAnthropicJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map(sanitizeAnthropicJsonSchema);
  }

  const obj = schema as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };

  if (isIntegerType(out.type)) {
    delete out.minimum;
    delete out.maximum;
    delete out.exclusiveMinimum;
    delete out.exclusiveMaximum;
  }

  if (out.type === 'array') {
    // Anthropic solo acepta minItems 0 o 1; la validación real la hace Zod post-parse.
    if (typeof out.minItems === 'number' && out.minItems > 1) {
      delete out.minItems;
    }
    delete out.maxItems;
  }

  if (out.properties && typeof out.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(out.properties as Record<string, unknown>)) {
      props[key] = sanitizeAnthropicJsonSchema(val);
    }
    out.properties = props;
  }

  if (out.patternProperties && typeof out.patternProperties === 'object') {
    const pp: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(out.patternProperties as Record<string, unknown>)) {
      pp[key] = sanitizeAnthropicJsonSchema(val);
    }
    out.patternProperties = pp;
  }

  if (out.items) {
    out.items = sanitizeAnthropicJsonSchema(out.items);
  }

  if (out.additionalProperties && typeof out.additionalProperties === 'object') {
    out.additionalProperties = sanitizeAnthropicJsonSchema(out.additionalProperties);
  }

  for (const key of ['$defs', 'definitions'] as const) {
    if (out[key] && typeof out[key] === 'object') {
      const defs: Record<string, unknown> = {};
      for (const [defKey, val] of Object.entries(out[key] as Record<string, unknown>)) {
        defs[defKey] = sanitizeAnthropicJsonSchema(val);
      }
      out[key] = defs;
    }
  }

  for (const comb of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(out[comb])) {
      out[comb] = (out[comb] as unknown[]).map(sanitizeAnthropicJsonSchema);
    }
  }

  if (out.not) {
    out.not = sanitizeAnthropicJsonSchema(out.not);
  }

  return out;
}
