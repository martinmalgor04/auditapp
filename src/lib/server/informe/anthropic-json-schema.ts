/**
 * Anthropic structured outputs — reglas conocidas (Zod valida todo post-parse):
 * - Requiere additionalProperties: false en cada objeto (lo forzamos).
 * - No acepta minimum/maximum en integers.
 * - No acepta minItems > 1 ni maxItems en arrays.
 * - No acepta $ref (buildOutputFormat usa $refStrategy: 'none').
 * - minLength/maxLength en strings disparan "grammar too large" → los eliminamos.
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
    if (typeof out.minItems === 'number' && out.minItems > 1) {
      delete out.minItems;
    }
    delete out.maxItems;
  }

  if (out.type === 'object') {
    // Anthropic exige additionalProperties: false en todos los objetos.
    out.additionalProperties = false;
    // minLength/maxLength en strings disparan "grammar too large".
    delete out.minLength;
    delete out.maxLength;
  }

  if (out.type === 'string') {
    delete out.minLength;
    delete out.maxLength;
  }

  if (out.properties && typeof out.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(out.properties as Record<string, unknown>)) {
      props[key] = sanitizeAnthropicJsonSchema(val);
    }
    out.properties = props;
  }

  if (out.items) {
    out.items = sanitizeAnthropicJsonSchema(out.items);
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
