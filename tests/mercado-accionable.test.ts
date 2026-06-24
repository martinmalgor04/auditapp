import { beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildMercadoDashboard } from '../src/lib/server/mercado/aggregate';
import { classifyErp, classifyFinding, normalizeProvincia } from '../src/lib/server/mercado/classify';
import { seedMercadoAccionable } from './fixtures/mercado-accionable';
import { getTestSql } from './helpers/db';

describe('mercado accionable (#43)', () => {
  beforeEach(async () => {
    setSqlForTests(getTestSql());
    await seedMercadoAccionable(getTestSql());
  });

  it('R2 — solo cuenta auditorías cerradas (excluye en_cierre)', async () => {
    const d = await buildMercadoDashboard({});
    expect(d.universe.n).toBe(8);
    const total = d.tango_opportunity.overall.reduce((s, g) => s + g.n, 0);
    expect(total).toBe(8);
  });

  it('R6 — distribución agrupada de ERP con conteos y % exactos', async () => {
    const d = await buildMercadoDashboard({});
    const byGroup = Object.fromEntries(d.tango_opportunity.overall.map((g) => [g.group, g]));
    expect(byGroup.tango.n).toBe(3);
    expect(byGroup.competidor.n).toBe(3);
    expect(byGroup.sin_erp.n).toBe(2);
    expect(byGroup.tango.pct).toBe(37.5);
    expect(byGroup.competidor.pct).toBe(37.5);
    expect(byGroup.sin_erp.pct).toBe(25);
  });

  it('R6 — classifyErp agrupa Tango / competidores / sin_erp', () => {
    expect(classifyErp('Tango Gestión')).toBe('tango');
    expect(classifyErp('tango')).toBe('tango');
    expect(classifyErp('SAP')).toBe('competidor');
    expect(classifyErp('Bejerman')).toBe('competidor');
    expect(classifyErp('Odoo')).toBe('competidor');
    expect(classifyErp('Otro X')).toBe('competidor');
    expect(classifyErp(null)).toBe('sin_erp');
    expect(classifyErp('')).toBe('sin_erp');
    expect(classifyErp('Sin ERP')).toBe('sin_erp');
  });

  it('R7 — cruce ERP × rubro: n≥3 con desglose, n<3 suprimido', async () => {
    const d = await buildMercadoDashboard({});
    const byRubro = Object.fromEntries(d.tango_opportunity.by_rubro.map((c) => [c.key, c]));
    expect(byRubro.Industria.n).toBe(3);
    expect(byRubro.Industria.suppressed).toBe(false);
    expect(byRubro.Industria.groups).toEqual({ tango: 3, competidor: 0, sin_erp: 0 });
    expect(byRubro.Comercio.groups).toEqual({ tango: 0, competidor: 3, sin_erp: 0 });
    expect(byRubro.Servicios.n).toBe(1);
    expect(byRubro.Servicios.suppressed).toBe(true);
    expect(byRubro.Servicios.groups).toBeNull();
  });

  it('R7 — cruce ERP × segmento con supresión', async () => {
    const d = await buildMercadoDashboard({});
    const bySeg = Object.fromEntries(d.tango_opportunity.by_segment.map((c) => [c.key, c]));
    expect(bySeg.A.groups).toEqual({ tango: 3, competidor: 0, sin_erp: 0 });
    expect(bySeg.B.groups).toEqual({ tango: 0, competidor: 3, sin_erp: 0 });
    expect(bySeg.C.n).toBe(2);
    expect(bySeg.C.suppressed).toBe(true);
    expect(bySeg.C.groups).toBeNull();
  });

  it('R8 — mapa NEA: provincia normalizada (variantes colapsan) y bucket Sin dato', async () => {
    const d = await buildMercadoDashboard({});
    const byProv = Object.fromEntries(d.nea_map.by_provincia.map((p) => [p.key, p]));
    expect(byProv.Corrientes.n).toBe(3);
    expect(byProv.Corrientes.is_nea).toBe(true);
    expect(byProv.Chaco.n).toBe(2);
    expect(byProv.Chaco.is_nea).toBe(true);
    expect(byProv.Formosa.is_nea).toBe(true);
    expect(byProv['Sin dato'].n).toBe(2);
    expect(byProv['Sin dato'].is_nea).toBe(false);
  });

  it('R8 — normalizeProvincia colapsa variantes y marca NEA', () => {
    expect(normalizeProvincia('  corrientes ')).toEqual({ key: 'Corrientes', is_nea: true });
    expect(normalizeProvincia('CORRIENTES')).toEqual({ key: 'Corrientes', is_nea: true });
    expect(normalizeProvincia(null)).toEqual({ key: 'Sin dato', is_nea: false });
    expect(normalizeProvincia('Buenos Aires').is_nea).toBe(false);
  });

  it('R9 — conteos por rubro (incl. Sin rubro) y por segmento', async () => {
    const d = await buildMercadoDashboard({});
    const rubro = Object.fromEntries(d.nea_map.by_rubro.map((r) => [r.key, r.n]));
    expect(rubro.Industria).toBe(3);
    expect(rubro.Comercio).toBe(3);
    expect(rubro.Servicios).toBe(1);
    expect(rubro['Sin rubro']).toBe(1);
    const seg = Object.fromEntries(d.nea_map.by_segment.map((s) => [s.key, s.n]));
    expect(seg.A).toBe(3);
    expect(seg.B).toBe(3);
    expect(seg.C).toBe(2);
  });

  it('R10 — base instalada: promedio ERP de usuarios Tango (NULLs excluidos)', async () => {
    const d = await buildMercadoDashboard({});
    expect(d.installed_base.tango_users_n).toBe(3);
    expect(d.installed_base.suppressed).toBe(false);
    expect(d.installed_base.avg_erp).toBe(70);
  });

  it('R11 — ranking de módulos menos adoptados primero, faltantes y %', async () => {
    const d = await buildMercadoDashboard({});
    const mods = d.installed_base.modules;
    expect(mods.length).toBeGreaterThanOrEqual(6);
    const first = mods[0];
    expect(first.adopted).toBe(0);
    expect(first.missing).toBe(3);
    const ventas = mods.find((m) => m.key === 'ventas');
    expect(ventas?.adopted).toBe(3);
    expect(ventas?.missing).toBe(0);
    expect(ventas?.adoption_pct).toBe(100);
    const sueldos = mods.find((m) => m.key === 'sueldos');
    expect(sueldos?.adopted).toBe(0);
    expect(sueldos?.adoption_pct).toBe(0);
  });

  it('R12 — hallazgos recurrentes por categoría (interno), totales correctos', async () => {
    const d = await buildMercadoDashboard({});
    expect(d.recurring_findings.internal).toBe(true);
    expect(d.recurring_findings.total_risks).toBe(6);
    expect(d.recurring_findings.total_quick_wins).toBe(5);
    const risks = Object.fromEntries(
      d.recurring_findings.top_risks.map((c) => [c.category, c.n])
    );
    expect(risks.hardware_eol).toBe(2);
    expect(risks.backups).toBe(1);
    expect(risks.seguridad).toBe(1);
    expect(risks.redes).toBe(1);
    expect(risks.otros).toBe(1);
    const wins = Object.fromEntries(
      d.recurring_findings.quick_wins.map((c) => [c.category, c.n])
    );
    expect(wins.licencias).toBe(2);
    expect(wins.backups).toBe(1);
    expect(wins.seguridad).toBe(1);
    expect(wins.redes).toBe(1);
  });

  it('R12 — classifyFinding mapea keywords y cae en otros sin match', () => {
    expect(classifyFinding('Falta backup diario')).toBe('backups');
    expect(classifyFinding('Firewall desactualizado')).toBe('seguridad');
    expect(classifyFinding('Renovar licencia office')).toBe('licencias');
    expect(classifyFinding('Servidor obsoleto fuera de soporte')).toBe('hardware_eol');
    expect(classifyFinding('Red wifi inestable')).toBe('redes');
    expect(classifyFinding('Algo no clasificable xyz')).toBe('otros');
  });

  it('R14/R15 — riesgo/retención: ex_cliente, inactiva (derivada + override), unión', async () => {
    const d = await buildMercadoDashboard({});
    expect(d.risk_retention.internal).toBe(true);
    expect(d.risk_retention.universe_empresas).toBe(8);
    expect(d.risk_retention.ex_cliente).toBe(1);
    expect(d.risk_retention.inactiva).toBe(2);
    expect(d.risk_retention.at_risk).toBe(2);
    expect(d.risk_retention.suppressed).toBe(false);
  });

  it('R17 — supresión n<3: base instalada y riesgo/retención bajo filtro', async () => {
    const filtered = await buildMercadoDashboard({
      from: new Date('2026-01-01'),
      to: new Date('2026-02-28')
    });
    expect(filtered.universe.n).toBe(2);
    expect(filtered.installed_base.tango_users_n).toBe(2);
    expect(filtered.installed_base.suppressed).toBe(true);
    expect(filtered.installed_base.avg_erp).toBeNull();
    expect(filtered.installed_base.modules).toEqual([]);
    expect(filtered.risk_retention.suppressed).toBe(true);
    expect(filtered.risk_retention.ex_cliente).toBeNull();
    expect(filtered.risk_retention.inactiva).toBeNull();
    expect(filtered.risk_retention.at_risk).toBeNull();
  });

  it('R18 — universo vacío: estructura completa en estado vacío', async () => {
    const d = await buildMercadoDashboard({ rubro: 'Rubro Inexistente XYZ' });
    expect(d.universe.n).toBe(0);
    expect(d.tango_opportunity.overall.every((g) => g.n === 0 && g.pct === 0)).toBe(true);
    expect(d.tango_opportunity.by_rubro).toEqual([]);
    expect(d.tango_opportunity.by_segment).toEqual([]);
    expect(d.nea_map.by_provincia).toEqual([]);
    expect(d.nea_map.by_rubro).toEqual([]);
    expect(d.installed_base).toEqual({
      tango_users_n: 0,
      avg_erp: null,
      suppressed: true,
      modules: []
    });
    expect(d.recurring_findings.total_risks).toBe(0);
    expect(d.recurring_findings.top_risks).toEqual([]);
    expect(d.risk_retention.universe_empresas).toBe(0);
    expect(d.risk_retention.at_risk).toBeNull();
  });

  it('R20 — los campos del dashboard #18 se conservan (no regresión)', async () => {
    const d = await buildMercadoDashboard({});
    expect(d.erp_distribution.reduce((s, r) => s + r.n, 0)).toBe(8);
    expect(d.indices_global).toHaveProperty('avg_erp');
    expect(Array.isArray(d.indices_by_segment)).toBe(true);
    expect(Array.isArray(d.modulos_tango)).toBe(true);
    expect(d.semaforos).toHaveProperty('it');
    expect(d.upsell_internal).toHaveProperty('total');
  });

  it('R4 — filtro provincia normaliza y reduce el universo', async () => {
    const corrientes = await buildMercadoDashboard({ provincia: '  CHACO ' });
    expect(corrientes.universe.n).toBe(2);
    const inexistente = await buildMercadoDashboard({ provincia: 'Mendoza' });
    expect(inexistente.universe.n).toBe(0);
  });
});
