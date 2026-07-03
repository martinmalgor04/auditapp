import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  ensureBaselineSeed,
  resetVolatileTablesForTests
} from './helpers/db';
import type postgres from 'postgres';
import {
  insertManualReport,
  getReportManualHtml,
  getLatestApprovedReport,
  listReportsByAudit
} from '$lib/server/db/informe-reports';
import type { CanonicalAudit } from '$lib/server/canonical/schema';

describe('Informe manual (schema + db)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Schema (R1–R3)', () => {
    beforeAll(async () => {
      await ensureBaselineSeed(sql);
    });

    it('should have source column with default ia', async () => {
      const rows = await sql`
        SELECT column_name, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'audit_report' AND column_name = 'source'
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].column_default).toMatch(/ia/);
    });

    it('should have html_manual column', async () => {
      const rows = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'audit_report' AND column_name = 'html_manual'
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].data_type).toBe('text');
    });

    it('should enforce CHECK source IN (ia, manual)', async () => {
      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'borrador',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const canonical: CanonicalAudit = {
        version: '1.0',
        types: ['erp'],
        sections: []
      };

      // INSERT con source inválido debe fallar
      await expect(
        sql`
          INSERT INTO audit_report (audit_id, version, status, source, canonical_json, schema_version, requested_by)
          VALUES (${auditId}, 1, 'pendiente', 'invalid', ${JSON.stringify(canonical)}, '1.0', ${userId})
        `
      ).rejects.toThrow();
    });

    it('should enforce manual_coherence CHECK', async () => {
      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'borrador',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const canonical: CanonicalAudit = {
        version: '1.0',
        types: ['erp'],
        sections: []
      };

      // source='manual' sin html_manual debe fallar
      await expect(
        sql`
          INSERT INTO audit_report (audit_id, version, status, source, canonical_json, schema_version, requested_by)
          VALUES (${auditId}, 1, 'aprobado', 'manual', ${JSON.stringify(canonical)}, '1.0', ${userId})
        `
      ).rejects.toThrow();

      // source='ia' con html_manual debe fallar
      await expect(
        sql`
          INSERT INTO audit_report (
            audit_id, version, status, source, html_manual,
            canonical_json, schema_version, requested_by
          )
          VALUES (${auditId}, 2, 'pendiente', 'ia', '<html></html>', ${JSON.stringify(canonical)}, '1.0', ${userId})
        `
      ).rejects.toThrow();
    });
  });

  describe('insertManualReport (R4–R8)', () => {
    beforeAll(async () => {
      await ensureBaselineSeed(sql);
    });

    it('should create new version with MAX+1', async () => {
      await resetVolatileTablesForTests(sql);

      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'cerrada',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const canonical: CanonicalAudit = {
        version: '1.0',
        types: ['erp'],
        sections: []
      };

      // Crear v1 y v2
      await sql`
        INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by, approved_by, approved_at)
        VALUES (${auditId}, 1, 'aprobado', ${JSON.stringify(canonical)}, '1.0', ${userId}, ${userId}, now())
      `;

      await sql`
        INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by, approved_by, approved_at)
        VALUES (${auditId}, 2, 'aprobado', ${JSON.stringify(canonical)}, '1.0', ${userId}, ${userId}, now())
      `;

      const result = await insertManualReport({
        auditId,
        htmlManual: '<html><body>Test</body></html>',
        uploadedBy: userId
      });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(3);
      expect(result!.source).toBe('manual');
      expect(result!.status).toBe('aprobado');
    });

    it('should return null if audit has no previous version', async () => {
      await resetVolatileTablesForTests(sql);

      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'cerrada',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const result = await insertManualReport({
        auditId,
        htmlManual: '<html></html>',
        uploadedBy: userId
      });

      expect(result).toBeNull();
    });

    it('should preserve existing IA versions', async () => {
      await resetVolatileTablesForTests(sql);

      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'cerrada',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const canonical: CanonicalAudit = {
        version: '1.0',
        types: ['erp'],
        sections: []
      };

      await sql`
        INSERT INTO audit_report (audit_id, version, status, source, canonical_json, schema_version, requested_by, approved_by, approved_at)
        VALUES (${auditId}, 1, 'aprobado', 'ia', ${JSON.stringify(canonical)}, '1.0', ${userId}, ${userId}, now())
      `;

      await insertManualReport({
        auditId,
        htmlManual: '<html></html>',
        uploadedBy: userId
      });

      const versions = await listReportsByAudit(auditId);
      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(2);
      expect(versions[0].source).toBe('manual');
      expect(versions[1].version).toBe(1);
      expect(versions[1].source).toBe('ia');
    });
  });

  describe('getLatestApprovedReport (R15)', () => {
    beforeAll(async () => {
      await ensureBaselineSeed(sql);
    });

    it('should return manual version if it exists', async () => {
      await resetVolatileTablesForTests(sql);

      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'cerrada',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const canonical: CanonicalAudit = {
        version: '1.0',
        types: ['erp'],
        sections: []
      };

      await sql`
        INSERT INTO audit_report (audit_id, version, status, source, canonical_json, schema_version, requested_by, approved_by, approved_at)
        VALUES (${auditId}, 1, 'aprobado', 'ia', ${JSON.stringify(canonical)}, '1.0', ${userId}, ${userId}, now())
      `;

      await insertManualReport({
        auditId,
        htmlManual: '<html></html>',
        uploadedBy: userId
      });

      const latest = await getLatestApprovedReport(auditId);
      expect(latest).not.toBeNull();
      expect(latest!.version).toBe(2);
      expect(latest!.source).toBe('manual');
    });
  });

  describe('getReportManualHtml (R2)', () => {
    beforeAll(async () => {
      await ensureBaselineSeed(sql);
    });

    it('should return html_manual for manual version', async () => {
      await resetVolatileTablesForTests(sql);

      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'cerrada',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const htmlContent = '<html><body>Manual content</body></html>';
      const canonical: CanonicalAudit = {
        version: '1.0',
        types: ['erp'],
        sections: []
      };

      await sql`
        INSERT INTO audit_report (audit_id, version, status, source, canonical_json, schema_version, requested_by, approved_by, approved_at)
        VALUES (${auditId}, 1, 'aprobado', 'ia', ${JSON.stringify(canonical)}, '1.0', ${userId}, ${userId}, now())
      `;

      const result = await insertManualReport({
        auditId,
        htmlManual: htmlContent,
        uploadedBy: userId
      });

      const retrieved = await getReportManualHtml(result!.id);
      expect(retrieved).toBe(htmlContent);
    });

    it('should return null for IA version', async () => {
      await resetVolatileTablesForTests(sql);

      const audit = await sql`
        INSERT INTO audit (client_id, status, template_id, assigned_tech_id)
        VALUES (
          (SELECT id FROM empresa WHERE relacion = 'cliente' LIMIT 1),
          'cerrada',
          (SELECT id FROM template LIMIT 1),
          (SELECT id FROM app_user WHERE role = 'tecnico' LIMIT 1)
        )
        RETURNING id
      `;
      const auditId = audit[0].id;
      const user = await sql`SELECT id FROM app_user LIMIT 1`;
      const userId = user[0].id;

      const canonical: CanonicalAudit = {
        version: '1.0',
        types: ['erp'],
        sections: []
      };

      const iaReport = await sql`
        INSERT INTO audit_report (audit_id, version, status, source, canonical_json, schema_version, requested_by, approved_by, approved_at)
        VALUES (${auditId}, 1, 'aprobado', 'ia', ${JSON.stringify(canonical)}, '1.0', ${userId}, ${userId}, now())
        RETURNING id
      `;

      const retrieved = await getReportManualHtml(iaReport[0].id);
      expect(retrieved).toBeNull();
    });
  });
});
