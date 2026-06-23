/**
 * T15 — markReportsStale + clearReportStale (#39 R13-R15)
 *
 * Cubre:
 *  - markReportsStale pone stale_since != null en todos los informes de una auditoría
 *  - markReportsStale es idempotente (segunda llamada no cambia stale_since)
 *  - clearReportStale limpia stale_since de un informe puntual
 *  - clearReportStale no afecta otros informes de la misma auditoría
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import {
  markReportsStale,
  clearReportStale
} from '../src/lib/server/db/informe-reports';

describe('markReportsStale (#39 R13)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedAuditWithReports(count = 2) {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Stale Test SA',
      types: ['it'],
      status: 'cerrada',
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const reportIds: string[] = [];
    for (let i = 1; i <= count; i++) {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by)
        VALUES (${auditId}, ${i}, 'borrador', '{}'::jsonb, '1.0', ${admin!.id})
        RETURNING id
      `;
      reportIds.push(row.id);
    }

    return { auditId, reportIds, admin: admin! };
  }

  it('marca stale_since en todos los informes de la auditoría', async () => {
    const { auditId, reportIds } = await seedAuditWithReports(2);

    await markReportsStale(auditId);

    const rows = await sql<{ id: string; stale_since: Date | null }[]>`
      SELECT id, stale_since FROM audit_report WHERE audit_id = ${auditId}
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.stale_since).not.toBeNull();
    }
  });

  it('idempotente: segunda llamada no actualiza stale_since existente', async () => {
    const { auditId } = await seedAuditWithReports(1);

    await markReportsStale(auditId);

    const [first] = await sql<{ stale_since: Date }[]>`
      SELECT stale_since FROM audit_report WHERE audit_id = ${auditId}
    `;
    const firstStale = first.stale_since;

    // Pequeña espera para que now() sea diferente si se actualizara
    await new Promise((r) => setTimeout(r, 10));
    await markReportsStale(auditId);

    const [second] = await sql<{ stale_since: Date }[]>`
      SELECT stale_since FROM audit_report WHERE audit_id = ${auditId}
    `;
    // stale_since no cambió (WHERE stale_since IS NULL no matchea)
    expect(second.stale_since.toISOString()).toBe(firstStale.toISOString());
  });

  it('no afecta informes de otras auditorías', async () => {
    const { auditId: auditA } = await seedAuditWithReports(1);
    const { auditId: auditB } = await seedAuditWithReports(1);

    await markReportsStale(auditA);

    const [rowB] = await sql<{ stale_since: Date | null }[]>`
      SELECT stale_since FROM audit_report WHERE audit_id = ${auditB}
    `;
    expect(rowB.stale_since).toBeNull();
  });
});

describe('clearReportStale (#39 R15)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedStaleReport() {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Clear Stale SA',
      types: ['it'],
      status: 'cerrada',
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const [row1] = await sql<{ id: string }[]>`
      INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by)
      VALUES (${auditId}, 1, 'borrador', '{}'::jsonb, '1.0', ${admin!.id})
      RETURNING id
    `;
    const [row2] = await sql<{ id: string }[]>`
      INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by)
      VALUES (${auditId}, 2, 'borrador', '{}'::jsonb, '1.0', ${admin!.id})
      RETURNING id
    `;

    // Marcar ambos como stale
    await markReportsStale(auditId);

    return { auditId, reportId1: row1.id, reportId2: row2.id };
  }

  it('clearReportStale limpia stale_since solo del informe indicado', async () => {
    const { reportId1, reportId2 } = await seedStaleReport();

    await clearReportStale(reportId1);

    const [r1] = await sql<{ stale_since: Date | null }[]>`
      SELECT stale_since FROM audit_report WHERE id = ${reportId1}
    `;
    const [r2] = await sql<{ stale_since: Date | null }[]>`
      SELECT stale_since FROM audit_report WHERE id = ${reportId2}
    `;

    expect(r1.stale_since).toBeNull();
    expect(r2.stale_since).not.toBeNull();
  });

  it('clearReportStale es idempotente (ya nulo → sigue nulo)', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Clear Idempotente SA',
      types: ['it'],
      status: 'cerrada',
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by)
      VALUES (${auditId}, 1, 'borrador', '{}'::jsonb, '1.0', ${admin!.id})
      RETURNING id
    `;

    // stale_since ya es null
    await expect(clearReportStale(row.id)).resolves.toBeUndefined();

    const [after] = await sql<{ stale_since: Date | null }[]>`
      SELECT stale_since FROM audit_report WHERE id = ${row.id}
    `;
    expect(after.stale_since).toBeNull();
  });
});
