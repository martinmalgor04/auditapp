import { beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildMercadoDashboard, MIN_GROUP_N } from '../src/lib/server/mercado/aggregate';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import {
  seedMercadoDashboardFixtures,
  seedMercadoGroupOfThree
} from './fixtures/mercado-audit';
import { getTestSql } from './helpers/db';

describe('mercado aggregations', () => {
  beforeEach(async () => {
    setSqlForTests(getTestSql());
    await seedMercadoDashboardFixtures(getTestSql());
  });

  it('R2 — solo auditorías cerradas en el universo', async () => {
    const dashboard = await buildMercadoDashboard({});
    expect(dashboard.universe.n).toBe(5);
  });

  it('R3 — distribución ERP con bucket Sin dato', async () => {
    const dashboard = await buildMercadoDashboard({});
    const byKey = Object.fromEntries(dashboard.erp_distribution.map((r) => [r.key, r]));
    expect(byKey['Tango Gestión']?.n).toBe(2);
    expect(byKey['Sin dato']?.n).toBe(2);
    expect(byKey.Bejerman?.n).toBe(1);
    expect(dashboard.erp_distribution.reduce((sum, r) => sum + r.n, 0)).toBe(5);
  });

  it('R4 — módulos Tango agregados y respuesta inválida no rompe', async () => {
    const dashboard = await buildMercadoDashboard({});
    const byKey = Object.fromEntries(dashboard.modulos_tango.map((r) => [r.key, r.n]));
    expect(byKey.ventas).toBe(2);
    expect(byKey.stock).toBe(3);
    expect(byKey.compras).toBe(1);
  });

  it('R5 — promedios globales y por segmento con NULLs', async () => {
    const dashboard = await buildMercadoDashboard({});
    expect(dashboard.indices_global.n_it).toBe(4);
    expect(dashboard.indices_global.n_erp).toBe(4);
    expect(dashboard.indices_global.avg_it).toBe(55);
    expect(dashboard.indices_global.avg_erp).toBe(65);

    const segmentA = dashboard.indices_by_segment.find((g) => g.key === 'A');
    expect(segmentA?.n).toBe(3);
    expect(segmentA?.suppressed).toBe(false);
    expect(segmentA?.avg_it).toBe(63);
    expect(segmentA?.avg_erp).toBe(58);
  });

  it('R6 — agrupación por rubro con Sin rubro', async () => {
    const dashboard = await buildMercadoDashboard({});
    const rubros = Object.fromEntries(dashboard.indices_by_rubro.map((g) => [g.key, g]));
    expect(rubros['Sin rubro']?.n).toBe(1);
    expect(rubros.Industria?.n).toBe(2);
    expect(rubros.Industria?.suppressed).toBe(true);
  });

  it('R7 — semáforos respetan indexToSemaphore y cuentan sin dato', async () => {
    const dashboard = await buildMercadoDashboard({});
    expect(dashboard.semaforos.it.verde).toBe(1);
    expect(dashboard.semaforos.it.amarillo).toBe(2);
    expect(dashboard.semaforos.it.rojo).toBe(1);
    expect(dashboard.semaforos.it.sin_dato).toBe(1);
    expect(dashboard.semaforos.erp.sin_dato).toBe(1);

    expect(indexToSemaphore(80)).toBe('green');
    expect(indexToSemaphore(60)).toBe('amber');
    expect(indexToSemaphore(30)).toBe('red');
  });

  it('R8 — serie mensual con 3 meses y sin ceros implícitos', async () => {
    const dashboard = await buildMercadoDashboard({});
    expect(dashboard.monthly).toHaveLength(3);
    expect(dashboard.monthly.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);

    const jan = dashboard.monthly.find((m) => m.month === '2026-01');
    expect(jan?.n).toBe(2);
    expect(jan?.avg_it).toBe(70);
    expect(jan?.avg_erp).toBe(60);
  });

  it('R9 — upsell agregado con vacíos', async () => {
    const dashboard = await buildMercadoDashboard({});
    expect(dashboard.upsell_internal.total).toBe(3);
    expect(dashboard.upsell_internal.audits_with_findings).toBe(2);
    expect(dashboard.upsell_internal.avg_per_audit).toBeCloseTo(0.6);
  });

  it('R13 — universo vacío devuelve estructura segura', async () => {
    const dashboard = await buildMercadoDashboard({
      rubro: 'Rubro Inexistente XYZ'
    });
    expect(dashboard.universe.n).toBe(0);
    expect(dashboard.erp_distribution).toEqual([]);
    expect(dashboard.indices_global).toEqual({
      n_it: 0,
      n_erp: 0,
      avg_it: null,
      avg_erp: null
    });
    expect(dashboard.upsell_internal.avg_per_audit).toBeNull();
  });

  it('R14 — supresión n < MIN_GROUP_N', async () => {
    const sql = getTestSql();
    await seedMercadoGroupOfThree(sql);
    const filtered = await buildMercadoDashboard({ rubro: 'Servicios' });
    const group = filtered.indices_by_rubro.find((g) => g.key === 'Servicios');
    expect(group?.n).toBe(3);
    expect(group?.suppressed).toBe(false);
    expect(group?.avg_it).toBe(71);

    const full = await buildMercadoDashboard({});
    const small = full.indices_by_rubro.find((g) => g.key === 'Agro');
    expect(small?.n).toBe(1);
    expect(small?.suppressed).toBe(true);
    expect(small?.avg_it).toBeNull();
    expect(MIN_GROUP_N).toBe(3);
  });
});
