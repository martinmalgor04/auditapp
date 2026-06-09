import { SEMAPHORE_AMBER_MIN, SEMAPHORE_GREEN_MIN } from './constants';
import type { Semaphore } from './types';

export function indexToSemaphore(n: number): Semaphore {
  if (n >= SEMAPHORE_GREEN_MIN) return 'green';
  if (n >= SEMAPHORE_AMBER_MIN) return 'amber';
  return 'red';
}
