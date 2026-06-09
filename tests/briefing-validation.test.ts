import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseBriefingValue } from '../src/lib/server/briefing/schemas';

describe('briefing validation (permissive)', () => {
  it('accepts partial CUIT text', () => {
    const value = parseBriefingValue('text', {}, '30642277', false);
    expect(value).toBe('30642277');
  });

  it('accepts numbers >= 0', () => {
    expect(parseBriefingValue('number', {}, 0, false)).toBe(0);
    expect(parseBriefingValue('number', {}, 42, false)).toBe(42);
  });

  it('rejects negative numbers', () => {
    expect(() => parseBriefingValue('number', {}, -1, false)).toThrow(ZodError);
  });

  it('rejects wrong types', () => {
    expect(() => parseBriefingValue('bool', {}, 'yes', false)).toThrow(ZodError);
  });

  it('returns null when na is true', () => {
    expect(parseBriefingValue('text', {}, 'ignored', true)).toBeNull();
  });
});
