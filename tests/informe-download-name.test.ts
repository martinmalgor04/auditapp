import { describe, expect, it } from 'vitest';
import { slugify, informeHtmlFilename } from '../src/lib/server/informe/download-name';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';

/** Construye un AuditReportRow mínimo para probar el filename (solo campos usados). */
function fakeReport(opts: {
  razonSocial: string;
  types: string[];
  closedAt: string | null;
  version: number;
}): AuditReportRow {
  return {
    version: opts.version,
    canonicalJson: {
      client: { razon_social: opts.razonSocial },
      types: opts.types,
      closed_at: opts.closedAt
    }
  } as unknown as AuditReportRow;
}

describe('slugify (R7)', () => {
  it('normaliza acentos y símbolos a kebab-case ASCII', () => {
    expect(slugify('Playadito S.A.')).toBe('playadito-s-a');
    expect(slugify('Mazzoni & Cía. S.R.L.')).toBe('mazzoni-cia-s-r-l');
    expect(slugify('Café Ñandú')).toBe('cafe-nandu');
  });

  it('colapsa y recorta guiones', () => {
    expect(slugify('  ---Popp   Hnos--- ')).toBe('popp-hnos');
  });

  it('usa fallback "cliente" cuando la cadena queda vacía', () => {
    expect(slugify('')).toBe('cliente');
    expect(slugify('@@@ ###')).toBe('cliente');
  });
});

describe('informeHtmlFilename (R7)', () => {
  it('produce YYYY-MM-DD_informe_<slug>_<tipo>_vN.html usando closed_at', () => {
    const report = fakeReport({
      razonSocial: 'Playadito S.A.',
      types: ['it'],
      closedAt: '2026-06-02T14:25:00-03:00',
      version: 3
    });
    expect(informeHtmlFilename(report)).toBe('2026-06-02_informe_playadito-s-a_it_v3.html');
  });

  it('deriva el token de tipo: it / erp / mixta', () => {
    const it = fakeReport({ razonSocial: 'Acme', types: ['it'], closedAt: '2026-01-01T00:00:00Z', version: 1 });
    const erp = fakeReport({ razonSocial: 'Acme', types: ['erp-tango'], closedAt: '2026-01-01T00:00:00Z', version: 1 });
    const mixta = fakeReport({
      razonSocial: 'Acme',
      types: ['erp-tango', 'it'],
      closedAt: '2026-01-01T00:00:00Z',
      version: 1
    });
    expect(informeHtmlFilename(it)).toContain('_it_');
    expect(informeHtmlFilename(erp)).toContain('_erp_');
    expect(informeHtmlFilename(mixta)).toContain('_mixta_');
  });

  it('usa la fecha actual cuando closed_at es null', () => {
    // Sin fake timers (congelarían el hook de DB de setup.ts): se compara contra
    // la fecha actual real en formato YYYY-MM-DD (UTC), igual que el helper.
    const today = new Date().toISOString().slice(0, 10);
    const report = fakeReport({ razonSocial: 'Acme', types: ['it'], closedAt: null, version: 2 });
    expect(informeHtmlFilename(report)).toBe(`${today}_informe_acme_it_v2.html`);
  });

  it('el filename completo solo contiene [a-z0-9._-]', () => {
    const report = fakeReport({
      razonSocial: 'Çırçá & Ñoño ™ S.A.',
      types: ['erp-tango', 'it'],
      closedAt: '2026-06-02T14:25:00-03:00',
      version: 12
    });
    const name = informeHtmlFilename(report);
    expect(name).toMatch(/^[a-z0-9._-]+$/);
    expect(name.endsWith('.html')).toBe(true);
  });
});
