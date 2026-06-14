import type { CanonicalAudit } from '../../src/lib/server/canonical/schema';
import { loadInformeCanonicalGolden } from './informe-claude-mock';

function withTemplateCodes(canonical: CanonicalAudit): CanonicalAudit {
  return {
    ...canonical,
    schema_version: '1.1',
    sections: canonical.sections.map((s) => ({
      ...s,
      template_code: s.template_code ?? (s.code.startsWith('A') ? 'it' : 'erp-tango')
    }))
  };
}

/** Canónico ERP puro para snapshots render ERP (R2). */
export function loadInformeCanonicalErp(): CanonicalAudit {
  const golden = withTemplateCodes(loadInformeCanonicalGolden());
  const erpSections = golden.sections
    .filter((s) => s.template_code === 'erp-tango')
    .map((s, i) => ({
      ...s,
      score: i === 0 ? 45 : i === 1 ? 72 : i === 2 ? 30 : s.score
    }));
  return {
    ...golden,
    types: ['erp-tango'],
    templates: [{ code: 'erp-tango', version: 'v2' }],
    sections: erpSections.slice(0, 3),
    indices: { erp: golden.indices.erp ?? 55 },
    market_data: {
      ...golden.market_data,
      erp_actual: 'Tango Gestión',
      modulos_tango: golden.market_data.modulos_tango
    }
  };
}

/** Canónico IT puro con áreas A1–A14 (R3). */
export function loadInformeCanonicalIt(): CanonicalAudit {
  const golden = withTemplateCodes(loadInformeCanonicalGolden());
  const itTitles: Record<string, string> = {
    A1: 'Inventario de activos',
    A2: 'Software / licencias',
    A3: 'Gestión de datos',
    A4: 'Configuración segura',
    A5: 'Control de acceso',
    A6: 'Protección de cuentas',
    A7: 'Gestión de vulnerabilidades',
    A8: 'Registro y monitoreo',
    A9: 'Protección contra malware',
    A10: 'Recuperación de datos / backups',
    A11: 'Seguridad de red',
    A12: 'Seguridad perimetral',
    A13: 'Seguridad wireless',
    A14: 'Formación y concienciación'
  };
  const scores = [20, 100, 55, 40, 65, 30, 50, 70, 45, 25, 60, 35, 80, 55];
  const sections = Object.entries(itTitles).map(([code, title], i) => {
    const fromGolden = golden.sections.find((s) => s.code === code);
    return {
      code,
      title,
      standard_ref: fromGolden?.standard_ref ?? `CIS ${i + 1}`,
      weight: fromGolden?.weight ?? ('alto' as const),
      score: scores[i] ?? 50,
      score_basis: 'auto' as const,
      template_code: 'it',
      observations: null,
      items: fromGolden?.items?.slice(0, 1) ?? [
        {
          item_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          label: `Ítem ${code}`,
          field_type: 'bool',
          value: null,
          na: false,
          observations: null,
          attachments: []
        }
      ]
    };
  });
  return {
    ...golden,
    types: ['it'],
    templates: [{ code: 'it', version: 'v2' }],
    sections,
    indices: { it: golden.indices.it ?? 52 },
    market_data: {
      ...golden.market_data,
      modulos_tango: [],
      erp_actual: null
    }
  };
}

/** Canónico mixto IT+ERP con template_code (R5, R6). */
export function loadInformeCanonicalMixta(): CanonicalAudit {
  return withTemplateCodes(loadInformeCanonicalGolden());
}
