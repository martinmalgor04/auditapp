import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { GET as listGet, POST as listPost } from '../../src/routes/api/crm/leads/+server';
import { PATCH as leadPatch } from '../../src/routes/api/crm/leads/[id]/+server';
import { POST as statusPost } from '../../src/routes/api/crm/leads/[id]/status/+server';

function locals(user: unknown) {
  return { user } as never;
}

describe('crm leads API', () => {
  let sql: postgres.Sql;
  let admin: NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>;
  let tech: NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>;

  beforeAll(async () => {
    sql = await setupTestDb();
    admin = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;
    tech = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    await seedCrmFixtures(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedCrmFixtures(s: postgres.Sql) {
    await s`DELETE FROM crm_lead_event`;
    await s`DELETE FROM crm_lead`;
    await s`
      INSERT INTO crm_lead (email, empresa, contacto, source, status)
      VALUES
        ('playadito@lead.com', 'Playadito', 'Juan', 'firecrawl', 'contactado'),
        ('otro@lead.com', 'Otra Empresa', null, 'referido', 'lead'),
        ('desc@lead.com', 'Descartado SA', null, 'manual', 'descartado')
    `;
    await s`UPDATE crm_lead SET descartado_at = now() WHERE email = 'desc@lead.com'`;
  }

  it('guards 401/403 por rol (R7)', async () => {
    expect((await listGet({ locals: locals(null), url: new URL('http://x') } as never)).status).toBe(
      401
    );
    expect((await listGet({ locals: locals(tech), url: new URL('http://x') } as never)).status).toBe(
      200
    );
    expect((await listPost({ locals: locals(tech), request: new Request('http://x') } as never)).status).toBe(
      403
    );
    expect((await listPost({ locals: locals(admin), request: new Request('http://x') } as never)).status).toBe(
      400
    );
  });

  it('filtros status/source y búsqueda q (R10)', async () => {
    const res = await listGet({
      locals: locals(admin),
      url: new URL('http://x?status=contactado&source=firecrawl')
    } as never);
    const body = await res.json();
    expect(body.data.leads).toHaveLength(1);
    expect(body.data.leads[0].empresa).toBe('Playadito');

    const search = await listGet({
      locals: locals(admin),
      url: new URL('http://x?q=playa')
    } as never);
    const searchBody = await search.json();
    expect(searchBody.data.leads.some((l: { empresa: string }) => l.empresa === 'Playadito')).toBe(
      true
    );
  });

  it('contadores del funnel omiten descartados (R11)', async () => {
    const res = await listGet({ locals: locals(admin), url: new URL('http://x') } as never);
    const body = await res.json();
    expect(body.data.counts).toEqual({
      lead: 1,
      contactado: 1,
      agendo: 0,
      auditado: 0,
      presupuestado: 0,
      cliente: 0
    });
  });

  it('cambio de estado válido y 409 en inválido (R12)', async () => {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id FROM crm_lead WHERE email = 'otro@lead.com'
    `;
    const ok = await statusPost({
      locals: locals(tech),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ to: 'contactado' }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(ok.status).toBe(200);
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM crm_lead WHERE id = ${lead.id}
    `;
    expect(row.status).toBe('contactado');

    const bad = await statusPost({
      locals: locals(tech),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ to: 'cliente' }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(bad.status).toBe(409);
    const [still] = await sql<{ status: string }[]>`
      SELECT status FROM crm_lead WHERE id = ${lead.id}
    `;
    expect(still.status).toBe('contactado');
  });

  it('registra evento con changed_by (R8)', async () => {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id FROM crm_lead WHERE email = 'otro@lead.com'
    `;
    await statusPost({
      locals: locals(admin),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ to: 'contactado' }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    const [ev] = await sql<{ from_status: string; to_status: string; changed_by: string }[]>`
      SELECT from_status, to_status, changed_by
      FROM crm_lead_event WHERE lead_id = ${lead.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(ev.from_status).toBe('lead');
    expect(ev.to_status).toBe('contactado');
    expect(ev.changed_by).toBe(admin.id);
  });

  it('descartado excluido del listado default, visible con filtro (R9)', async () => {
    const all = await listGet({ locals: locals(admin), url: new URL('http://x') } as never);
    const allBody = await all.json();
    expect(allBody.data.leads.every((l: { status: string }) => l.status !== 'descartado')).toBe(
      true
    );

    const disc = await listGet({
      locals: locals(admin),
      url: new URL('http://x?status=descartado')
    } as never);
    const discBody = await disc.json();
    expect(discBody.data.leads).toHaveLength(1);
    expect(discBody.data.leads[0].email).toBe('desc@lead.com');
  });

  it('PATCH notas y rechaza email/source (R13)', async () => {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id FROM crm_lead WHERE email = 'playadito@lead.com'
    `;
    const ok = await leadPatch({
      locals: locals(admin),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({
          notas: 'Llamar mañana',
          proxima_accion_fecha: '2026-06-20'
        }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(ok.status).toBe(200);
    const [row] = await sql<{ notas: string; proxima_accion_fecha: string }[]>`
      SELECT notas, proxima_accion_fecha::text FROM crm_lead WHERE id = ${lead.id}
    `;
    expect(row.notas).toBe('Llamar mañana');
    expect(row.proxima_accion_fecha).toContain('2026-06-20');

    const badEmail = await leadPatch({
      locals: locals(admin),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ email: 'hack@x.com' }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(badEmail.status).toBe(400);
  });

  it('PATCH client_id válido e inexistente; client count intacto (R14)', async () => {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id FROM crm_lead WHERE email = 'playadito@lead.com'
    `;
    const [client] = await sql<{ id: string }[]>`
      SELECT id FROM client LIMIT 1
    `;
    const clientsBefore = await sql<{ count: string }[]>`SELECT count(*)::text FROM client`;

    const ok = await leadPatch({
      locals: locals(admin),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ client_id: client.id }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(ok.status).toBe(200);

    const missing = await leadPatch({
      locals: locals(admin),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ client_id: randomUUID() }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(missing.status).toBe(404);

    const clientsAfter = await sql<{ count: string }[]>`SELECT count(*)::text FROM client`;
    expect(clientsAfter[0].count).toBe(clientsBefore[0].count);
  });

  it('PATCH audit_id sobre descartado retorna 409 (R3)', async () => {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id FROM crm_lead WHERE email = 'desc@lead.com'
    `;
    const [client] = await sql<{ id: string }[]>`
      INSERT INTO client (razon_social) VALUES ('Tmp') RETURNING id
    `;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (client_id, name, types, template_ids, segment, status, public_token)
      VALUES (${client.id}, 'A', ARRAY['it']::text[], ARRAY[]::uuid[], 'A', 'borrador', ${randomUUID()})
      RETURNING id
    `;
    const res = await leadPatch({
      locals: locals(admin),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ audit_id: audit.id }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(res.status).toBe(409);
  });

  it('tecnico 403 en PATCH edición (R7)', async () => {
    const [lead] = await sql<{ id: string }[]>`
      SELECT id FROM crm_lead WHERE email = 'playadito@lead.com'
    `;
    const res = await leadPatch({
      locals: locals(tech),
      params: { id: lead.id },
      request: new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ notas: 'x' }),
        headers: { 'Content-Type': 'application/json' }
      })
    } as never);
    expect(res.status).toBe(403);
  });
});
