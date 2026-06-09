import { describe, expect, it } from 'vitest';
import { CANONICAL_SCHEMA_VERSION } from '../src/lib/server/canonical/version';
import { canonicalAuditSchema } from '../src/lib/server/canonical/schema';
import golden from './fixtures/canonical-audit-golden.json';

describe('canonical schema', () => {
  it('CANONICAL_SCHEMA_VERSION is 1.0', () => {
    expect(CANONICAL_SCHEMA_VERSION).toBe('1.0');
  });

  it('schema version field is semver string', () => {
    expect(CANONICAL_SCHEMA_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it('schema accepts golden fixture', () => {
    const parsed = canonicalAuditSchema.parse(golden);
    expect(parsed.schema_version).toBe('1.0');
  });

  it('schema rejects invalid payload', () => {
    expect(() =>
      canonicalAuditSchema.parse({
        ...golden,
        schema_version: '2.0',
        indices: { it: 150 }
      })
    ).toThrow();
  });
});
