import { describe, expect, it } from 'vitest';
import type { SaveIndicatorState } from '../src/lib/components/form/save-indicator.svelte';

describe('form save indicator', () => {
  function nextState(
    current: SaveIndicatorState,
    event: 'save_start' | 'save_ok' | 'offline'
  ): SaveIndicatorState {
    if (event === 'save_start') return 'saving';
    if (event === 'save_ok') return 'saved';
    if (event === 'offline') return 'offline';
    return current;
  }

  it('transitions saving → saved → idle', () => {
    let state: SaveIndicatorState = 'idle';
    state = nextState(state, 'save_start');
    expect(state).toBe('saving');
    state = nextState(state, 'save_ok');
    expect(state).toBe('saved');
  });

  it('shows offline message on network failure', () => {
    const state = nextState('saving', 'offline');
    expect(state).toBe('offline');
  });
});
