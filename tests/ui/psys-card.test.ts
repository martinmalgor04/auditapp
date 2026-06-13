import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canShowCreateProposal,
  canShowSyncProposal,
  translatePsysStatus
} from '../../src/lib/psys/view';

describe('psys-card UI helpers', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/components/auditoria/psys-card.svelte'),
    'utf8'
  );

  it('traduce estados conocidos (R13)', () => {
    expect(translatePsysStatus('enviado')).toBe('Enviado');
    expect(translatePsysStatus('borrador')).toBe('Borrador');
  });

  it('admin con informe aprobado y sin vínculo puede crear (R13)', () => {
    expect(
      canShowCreateProposal({ isAdmin: true, hasApprovedReport: true, hasActiveLink: false })
    ).toBe(true);
    expect(
      canShowCreateProposal({ isAdmin: false, hasApprovedReport: true, hasActiveLink: false })
    ).toBe(false);
    expect(
      canShowCreateProposal({ isAdmin: true, hasApprovedReport: true, hasActiveLink: true })
    ).toBe(false);
  });

  it('solo admin ve acciones de sync (R13)', () => {
    expect(canShowSyncProposal({ isAdmin: true, hasActiveLink: true })).toBe(true);
    expect(canShowSyncProposal({ isAdmin: false, hasActiveLink: true })).toBe(false);
  });

  it('componente muestra número, estado, link y botón crear (R13)', () => {
    expect(source).toContain('data-testid="psys-card"');
    expect(source).toContain('number_display');
    expect(source).toContain('translatePsysStatus');
    expect(source).toContain('Abrir en presupuestossys');
    expect(source).toContain('Crear presupuesto');
    expect(source).toContain('canShowCreateProposal');
    expect(source).not.toContain('isAdmin && hasApprovedReport');
  });
});
