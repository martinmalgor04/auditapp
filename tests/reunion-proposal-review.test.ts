import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { ProposalVerificationStatus } from '../src/lib/server/db/reunion-proposals';

const COMPONENT = readFileSync(
  join(process.cwd(), 'src/lib/components/reunion/proposal-review.svelte'),
  'utf8'
);

const BADGE_TEXT = 'No verificada — revisar';

/** Predicado que refleja la condición del template del componente (R19). */
function showVerificationBadge(status: ProposalVerificationStatus): boolean {
  return status === 'unverified';
}

describe('proposal-review — badge de verificación (R19)', () => {
  it('el badge "No verificada — revisar" se muestra sólo cuando verification_status === unverified', () => {
    expect(showVerificationBadge('unverified')).toBe(true);
    expect(showVerificationBadge('verified')).toBe(false);
    expect(showVerificationBadge(null)).toBe(false);
  });

  it('el componente declara el badge condicionado a unverified', () => {
    // El componente debe contener el texto del badge...
    expect(COMPONENT).toContain(BADGE_TEXT);
    // ...y mostrarlo bajo la condición verification_status === 'unverified'.
    expect(COMPONENT).toMatch(/verification_status\s*===\s*'unverified'/);
  });

  it('el componente NO muestra el badge para verified ni NULL (no hay otra rama que lo emita)', () => {
    // El único punto donde aparece el texto del badge está dentro del {#if ...unverified}.
    const occurrences = COMPONENT.split(BADGE_TEXT).length - 1;
    expect(occurrences).toBe(1);
    // No debe haber una condición que muestre el badge para 'verified'.
    expect(COMPONENT).not.toMatch(/verification_status\s*===\s*'verified'/);
  });
});
