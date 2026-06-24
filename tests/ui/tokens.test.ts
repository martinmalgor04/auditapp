import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../../');

describe('Design tokens — brand.css', () => {
  const css = readFileSync(resolve(root, 'src/lib/styles/brand.css'), 'utf-8');

  it('--sys-font-base contiene Montserrat', () => {
    expect(css).toMatch(/--sys-font-base\s*:[^;]*Montserrat/);
  });

  const cssTokens: Record<string, string> = {
    '--sys-primary': '#2196F3',
    '--sys-navy': '#0A1929',
    '--sys-navy-mid': '#0E2540',
    '--sys-bg-app': '#ECEEF2',
    '--sys-surface': '#ffffff',
    '--sys-border': '#E4E7ED',
    '--sys-text-primary': '#0A1929',
    '--sys-text-secondary': '#374151',
    '--sys-text-muted': '#6B7280',
    '--sys-text-faint': '#9CA3AF',
    '--sys-text-navy-muted': '#A2C6D4',
    '--sys-status-green': '#10B981',
    '--sys-status-amber': '#F59E0B',
    '--sys-status-red': '#EF4444',
    '--sys-status-blue-bg': '#DBEAFE',
    '--sys-status-blue-text': '#1E40AF',
  };

  for (const [variable, value] of Object.entries(cssTokens)) {
    it(`${variable}: ${value}`, () => {
      const escaped = variable.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(`${escaped}\\s*:\\s*${value.replace(/[#]/g, '\\$&')}`, 'i');
      expect(css).toMatch(regex);
    });
  }
});

describe('Design tokens — tailwind.config.js', () => {
  const tw = readFileSync(resolve(root, 'tailwind.config.js'), 'utf-8');

  const twKeys = [
    'sys-primary',
    'sys-navy',
    'sys-navy-mid',
    'sys-bg-app',
    'sys-surface',
    'sys-border',
    'sys-text-primary',
    'sys-text-secondary',
    'sys-text-muted',
    'sys-text-faint',
    'sys-text-navy-muted',
    'sys-status-green',
    'sys-status-amber',
    'sys-status-red',
    'sys-status-blue-bg',
    'sys-status-blue-text',
  ];

  for (const key of twKeys) {
    it(`contiene clave "${key}"`, () => {
      expect(tw).toContain(`'${key}'`);
    });
  }
});
