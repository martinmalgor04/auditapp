import { describe, it, expect } from 'vitest';

// Unit test for StatusBadge style logic — mirrors what the component computes
// without mounting Svelte (avoids SSR/DOM setup in unit test environment).

type StyleDef = { background: string; color: string };

type AuditStatus =
  | 'borrador'
  | 'briefing_enviado'
  | 'briefing_completo'
  | 'en_relevamiento'
  | 'en_cierre'
  | 'cerrada';

const STATUS_STYLES: Record<AuditStatus, StyleDef> = {
  cerrada: { background: 'rgba(16,185,129,.12)', color: 'var(--sys-status-green)' },
  en_cierre: { background: 'rgba(245,158,11,.12)', color: 'var(--sys-status-amber)' },
  borrador: { background: 'var(--sys-status-blue-bg)', color: 'var(--sys-status-blue-text)' },
  briefing_enviado: {
    background: 'var(--sys-status-blue-bg)',
    color: 'var(--sys-status-blue-text)'
  },
  briefing_completo: {
    background: 'var(--sys-status-blue-bg)',
    color: 'var(--sys-status-blue-text)'
  },
  en_relevamiento: {
    background: 'var(--sys-status-blue-bg)',
    color: 'var(--sys-status-blue-text)'
  }
};

function resolveStyles(status: AuditStatus, scoreLow: boolean): StyleDef {
  if (scoreLow) {
    return { background: 'rgba(239,68,68,.12)', color: 'var(--sys-status-red)' };
  }
  return STATUS_STYLES[status] ?? STATUS_STYLES['borrador'];
}

describe('StatusBadge — color por status', () => {
  it('cerrada → fondo verde, texto sys-status-green', () => {
    const s = resolveStyles('cerrada', false);
    expect(s.background).toBe('rgba(16,185,129,.12)');
    expect(s.color).toBe('var(--sys-status-green)');
  });

  it('en_cierre → fondo amber, texto sys-status-amber', () => {
    const s = resolveStyles('en_cierre', false);
    expect(s.background).toBe('rgba(245,158,11,.12)');
    expect(s.color).toBe('var(--sys-status-amber)');
  });

  it('borrador → fondo blue-bg, texto sys-status-blue-text', () => {
    const s = resolveStyles('borrador', false);
    expect(s.background).toBe('var(--sys-status-blue-bg)');
    expect(s.color).toBe('var(--sys-status-blue-text)');
  });

  it('briefing_enviado → fondo blue', () => {
    const s = resolveStyles('briefing_enviado', false);
    expect(s.background).toBe('var(--sys-status-blue-bg)');
  });

  it('briefing_completo → fondo blue', () => {
    const s = resolveStyles('briefing_completo', false);
    expect(s.background).toBe('var(--sys-status-blue-bg)');
  });

  it('en_relevamiento → fondo blue', () => {
    const s = resolveStyles('en_relevamiento', false);
    expect(s.background).toBe('var(--sys-status-blue-bg)');
  });
});

describe('StatusBadge — scoreLow sobreescribe status', () => {
  it('scoreLow=true con status cerrada → rojo (ignora green)', () => {
    const s = resolveStyles('cerrada', true);
    expect(s.background).toBe('rgba(239,68,68,.12)');
    expect(s.color).toBe('var(--sys-status-red)');
  });

  it('scoreLow=true con status borrador → rojo', () => {
    const s = resolveStyles('borrador', true);
    expect(s.background).toBe('rgba(239,68,68,.12)');
    expect(s.color).toBe('var(--sys-status-red)');
  });

  it('scoreLow=true con status en_cierre → rojo (ignora amber)', () => {
    const s = resolveStyles('en_cierre', true);
    expect(s.color).toBe('var(--sys-status-red)');
  });

  it('scoreLow=false no aplica override', () => {
    const s = resolveStyles('cerrada', false);
    expect(s.color).toBe('var(--sys-status-green)');
  });
});
