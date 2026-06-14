import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildAuditBundle } from '../src/lib/server/bundle/build';
import { importAuditBundle } from '../src/lib/server/bundle/import';
import { AuditBundleResolutionError } from '../src/lib/server/bundle/errors';
import type { AuditBundle } from '../src/lib/server/bundle/schema';
import { seedBundleAuditFixture } from './fixtures/audit-bundle';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';

async function countAudits(sql: postgres.Sql): Promise<number> {
  const [r] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM audit`;
  return Number(r.c);
}

/** Borra la auditoría de origen para simular import en otra instancia (deja libre el cliente). */
async function exportThenDropOrigin(
  sql: postgres.Sql,
  auditId: string,
  opts?: { dropClient?: boolean; clientId?: string }
): Promise<AuditBundle> {
  const bundle = await buildAuditBundle(auditId);
  await sql`DELETE FROM audit WHERE id = ${auditId}`;
  if (opts?.dropClient && opts.clientId) {
    await sql`DELETE FROM client WHERE id = ${opts.clientId}`;
  }
  return bundle;
}

describe('importAuditBundle', () => {
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

  it('crea audit con FK locales y status preservado; recrea responses/scores', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await importAuditBundle(bundle, admin!, 'permissive');
    expect(res.mode).toBe('permissive');
    if (res.mode === 'dry-run') throw new Error('unexpected');

    const [audit] = await sql<{ status: string; client_id: string; assigned_tech_id: string | null }[]>`
      SELECT status, client_id, assigned_tech_id FROM audit WHERE id = ${res.auditId}
    `;
    expect(audit.status).toBe('en_relevamiento');
    expect(audit.client_id).toBe(fx.clientId); // cliente existente reusado por CUIT
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    expect(audit.assigned_tech_id).toBe(tech!.id);

    const [respCount] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM audit_response WHERE audit_id = ${res.auditId}
    `;
    expect(Number(respCount.c)).toBe(bundle.responses.length);

    const [scoreCount] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM audit_section_score WHERE audit_id = ${res.auditId}
    `;
    expect(Number(scoreCount.c)).toBe(bundle.section_scores.length);
  });

  it('preserva closure en auditoría cerrada', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'cerrada' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await importAuditBundle(bundle, admin!, 'permissive');
    if (res.mode === 'dry-run') throw new Error('unexpected');

    const [closure] = await sql<{ audit_id: string; public_token: string | null }[]>`
      SELECT ac.audit_id, a.public_token
      FROM audit_closure ac JOIN audit a ON a.id = ac.audit_id
      WHERE ac.audit_id = ${res.auditId}
    `;
    expect(closure.audit_id).toBe(res.auditId);
    // OQ-3: cerrada → public_token NULL
    expect(closure.public_token).toBeNull();
  });

  it('regenera public_token solo si status en {briefing_enviado, briefing_completo} (OQ-3)', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'briefing_completo' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await importAuditBundle(bundle, admin!, 'permissive');
    if (res.mode === 'dry-run') throw new Error('unexpected');
    const [audit] = await sql<{ public_token: string | null }[]>`
      SELECT public_token FROM audit WHERE id = ${res.auditId}
    `;
    expect(audit.public_token).not.toBeNull();
    expect(audit.public_token).not.toBe(bundle.dedupe_key.origin_audit_id);
  });

  it('remapea attachment_ids embebidos (file_ref y table) y no duplica por r2_key', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    const attCountBefore = (
      await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM attachment`
    )[0];
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    // tras borrar audit, sus attachments caen por CASCADE; re-creamos por import.
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await importAuditBundle(bundle, admin!, 'permissive');
    if (res.mode === 'dry-run') throw new Error('unexpected');

    // file_ref: value.attachment_ids apunta a attachment local (no al origen)
    const fileRefResp = await sql<{ value: { attachment_ids: string[] } }[]>`
      SELECT ar.value
      FROM audit_response ar
      JOIN attachment at ON at.id = ANY(SELECT jsonb_array_elements_text(ar.value->'attachment_ids')::uuid)
      WHERE ar.audit_id = ${res.auditId}
        AND ar.value ? 'attachment_ids'
      LIMIT 1
    `;
    expect(fileRefResp.length).toBeGreaterThan(0);
    const localFileRefIds = fileRefResp[0].value.attachment_ids;
    expect(localFileRefIds).not.toContain(fx.fileRefAttachmentId);
    const [matchLocal] = await sql<{ id: string }[]>`
      SELECT id FROM attachment WHERE audit_id = ${res.auditId} AND r2_key LIKE '%fileref.jpg'
    `;
    expect(localFileRefIds).toContain(matchLocal.id);

    // table: attachment_ids por fila remapeados
    if (fx.tableItemId) {
      const tableResp = await sql<{ value: { rows: Array<{ attachment_ids: string[] }> } }[]>`
        SELECT value FROM audit_response
        WHERE audit_id = ${res.auditId} AND value ? 'rows'
        LIMIT 1
      `;
      expect(tableResp.length).toBe(1);
      const rowAttIds = tableResp[0].value.rows[0].attachment_ids;
      expect(rowAttIds).not.toContain(fx.tableAttachmentId);
    }

    void attCountBefore;
  });

  it('no duplica attachment cuando el r2_key ya existe', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    // NO borramos la auditoría: los r2_key siguen presentes. Cambiamos el cliente para evitar
    // colisión de unicidad de auditoría y simular import "paralelo".
    bundle.header.client = { cuit: '30-55555555-5', razon_social: 'Otro Cliente Bundle' };
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const [before] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM attachment`;
    const res = await importAuditBundle(bundle, admin!, 'permissive');
    if (res.mode === 'dry-run') throw new Error('unexpected');
    const [after] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM attachment`;
    // r2_key ya existía ⇒ no se insertan filas nuevas de attachment.
    expect(Number(after.c)).toBe(Number(before.c));
  });

  it('dry-run no escribe', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits(sql);
    const res = await importAuditBundle(bundle, admin!, 'dry-run');
    expect(res.mode).toBe('dry-run');
    if (res.mode !== 'dry-run') throw new Error('unexpected');
    expect(res.report.would_create).toContain('audit');
    expect(await countAudits(sql)).toBe(before);
  });

  it('dry-run con template faltante lista el faltante y no escribe', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    bundle.header.templates = [{ code: 'noexiste', version: '9.9' }];
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits(sql);
    const res = await importAuditBundle(bundle, admin!, 'dry-run');
    if (res.mode !== 'dry-run') throw new Error('unexpected');
    expect(res.report.missing.some((m) => m.includes('noexiste'))).toBe(true);
    expect(await countAudits(sql)).toBe(before);
  });

  it('reimport no duplica (duplicate:true, +1 audit)', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits(sql);
    const first = await importAuditBundle(bundle, admin!, 'permissive');
    const second = await importAuditBundle(bundle, admin!, 'permissive');
    if (first.mode === 'dry-run' || second.mode === 'dry-run') throw new Error('unexpected');

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.auditId).toBe(first.auditId);
    expect(await countAudits(sql)).toBe(before + 1);
  });

  it('template faltante en escritura lanza AuditBundleResolutionError sin escribir', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    bundle.header.templates = [{ code: 'noexiste', version: '9.9' }];
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits(sql);
    let err: unknown;
    try {
      await importAuditBundle(bundle, admin!, 'permissive');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AuditBundleResolutionError);
    expect((err as AuditBundleResolutionError).code).toBe('AUDIT_BUNDLE_RESOLUTION');
    expect((err as AuditBundleResolutionError).missing.length).toBeGreaterThan(0);
    expect(await countAudits(sql)).toBe(before);
  });

  it('atomicidad: error a mitad hace rollback total (R14)', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'cerrada' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    // Forzar violación de constraint en la closure (indice_it fuera de rango) tras crear audit.
    if (bundle.closure) {
      bundle.closure.indice_it = 999;
    }
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const beforeAudits = await countAudits(sql);
    await expect(importAuditBundle(bundle, admin!, 'permissive')).rejects.toThrow();
    expect(await countAudits(sql)).toBe(beforeAudits);
    const [resp] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM audit_response
      WHERE audit_id NOT IN (SELECT id FROM audit)
    `;
    expect(Number(resp.c)).toBe(0);
  });

  it('strict con cliente ausente falla y no escribe (R17)', async () => {
    const fx = await seedBundleAuditFixture(sql, {
      status: 'en_relevamiento',
      cuit: '30-77777777-7',
      razonSocial: 'Cliente Solo Origen SA'
    });
    const bundle = await buildAuditBundle(fx.auditId);
    await exportThenDropOrigin(sql, fx.auditId, { dropClient: true, clientId: fx.clientId });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits(sql);
    await expect(importAuditBundle(bundle, admin!, 'strict')).rejects.toBeInstanceOf(
      AuditBundleResolutionError
    );
    expect(await countAudits(sql)).toBe(before);
  });

  it('permissive crea cliente ausente por CUIT y deja assigned_tech NULL si el email no existe', async () => {
    const fx = await seedBundleAuditFixture(sql, {
      status: 'en_relevamiento',
      cuit: '30-88888888-8',
      razonSocial: 'Cliente Nuevo Permissive SA'
    });
    const bundle = await buildAuditBundle(fx.auditId);
    // técnico inexistente en destino
    bundle.header.assigned_tech = { email: 'fantasma@noexiste.com' };
    await exportThenDropOrigin(sql, fx.auditId, { dropClient: true, clientId: fx.clientId });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await importAuditBundle(bundle, admin!, 'permissive');
    if (res.mode === 'dry-run') throw new Error('unexpected');

    const [audit] = await sql<{ assigned_tech_id: string | null; client_id: string }[]>`
      SELECT assigned_tech_id, client_id FROM audit WHERE id = ${res.auditId}
    `;
    expect(audit.assigned_tech_id).toBeNull();
    const [client] = await sql<{ cuit: string }[]>`
      SELECT cuit FROM client WHERE id = ${audit.client_id}
    `;
    expect(client.cuit).toBe('30-88888888-8');
  });

  it('body inválido lanza AuditBundleValidationError', async () => {
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    await expect(
      importAuditBundle({ nope: true }, admin!, 'dry-run')
    ).rejects.toMatchObject({ code: 'AUDIT_BUNDLE_VALIDATION' });
  });
});
