import { describe, expect, it } from 'vitest';
import { indexToSemaphore } from '../../src/lib/server/scoring/semaphore';

describe('semaphore', () => {
  it('maps index ranges to green amber red', () => {
    expect(indexToSemaphore(85)).toBe('green');
    expect(indexToSemaphore(70)).toBe('green');
    expect(indexToSemaphore(55)).toBe('amber');
    expect(indexToSemaphore(40)).toBe('amber');
    expect(indexToSemaphore(25)).toBe('red');
    expect(indexToSemaphore(0)).toBe('red');
  });
});
