import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { addEvento, listEventos, setEstadoOverride, getEmpresaById } from '../../src/lib/server/db/empresa';
import { EmpresaNotFoundError } from '../../src/lib/server/crm/errors';
import {
  GET as eventosGet,
  POST as eventosPost
} from '../../src/routes/api/crm/empresas/[id]/eventos/+server';
import { POST as overridePost } from '../../src/routes/api/crm/empresas/[id]/override/+server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail, findUserIdByEmail } from '../helpers/auth';

/**
 * #23 Fase 5 (T25, R22/R23): eventos/timeline y override de estado.
 *
 * - Capa de datos (`addEvento`/`listEventos`/`setEstadoOverride`): registrar evento/nota,
 *   listar más-reciente-primero, setear override (genera evento `cambio_estado` con from/to),
 *   limpiar override (vuelve al derivado, registra el cambio).
 * - Endpoints `[id]/eventos` (GET/POST) y `[id]/override` (POST): validación Zod, 404 si no existe,
 *   guards staff (401 sin sesión, 403 rol no staff).
 */
describe('#23 Fase 5 — eventos/timeline + override (R22, R23)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let admin: unknown;
  let tecnico: unknown;
  const cuit = '30950000001';
  let empresaId: string;

  async function cleanup() {
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
  }

  async function mkEmpresa(relacion = 'prospecto'): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, origen)
      VALUES ('ZZZ Eventos Empresa SA', ${cuit}, ${relacion}, 'presupuestos')
      RETURNING id
    `;
    return row.id;
  }

  function callEventosGet(id: string, user: unknown) {
    return eventosGet({
      params: { id },
      locals: { user }
    } as never);
  }

  function callEventosPost(id: string, body: unknown, user: unknown) {
    return eventosPost({
      request: new Request(`http://localhost/api/crm/empresas/${id}/eventos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }),
      params: { id },
      locals: { user }
    } as never);
  }

  function callOverridePost(id: string, body: unknown, user: unknown) {
    return overridePost({
      request: new Request(`http://localhost/api/crm/empresas/${id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }),
      params: { id },
      locals: { user }
    } as never);
  }

  beforeAll(async () => {
    sql = await setupTestDb();
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnico = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    await cleanup();
    empresaId = await mkEmpresa();
  });

  afterAll(async () => {
    setSqlForTests(sql);
    await cleanup();
    await teardownTestDb();
  });

  // ---- Capa de datos -------------------------------------------------------

  it('addEvento registra un evento/nota y listEventos lo devuelve (R22)', async () => {
    const ev = await addEvento(empresaId, { tipo: 'llamada', texto: 'Primer contacto telefónico' }, adminId);
    expect(ev.tipo).toBe('llamada');
    expect(ev.texto).toBe('Primer contacto telefónico');
    expect(ev.createdBy).toBe(adminId);

    const eventos = await listEventos(empresaId);
    expect(eventos.some((e) => e.id === ev.id)).toBe(true);
  });

  it('listEventos ordena más reciente primero (R22)', async () => {
    await addEvento(empresaId, { tipo: 'nota', texto: 'nota 1' }, adminId);
    await addEvento(empresaId, { tipo: 'reunion', texto: 'nota 2' }, adminId);
    const eventos = await listEventos(empresaId);
    // El más reciente (nota 2) primero.
    expect(eventos[0].texto).toBe('nota 2');
    expect(eventos[1].texto).toBe('nota 1');
  });

  it('addEvento sobre empresa inexistente lanza EmpresaNotFoundError (R22)', async () => {
    await expect(
      addEvento('00000000-0000-0000-0000-000000000000', { tipo: 'nota', texto: 'x' }, adminId)
    ).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });

  it('setEstadoOverride fija el override y genera un evento cambio_estado con from/to (R23)', async () => {
    // Sin actividad → derivado = sin_contactar.
    const before = await getEmpresaById(empresaId);
    expect(before!.estado).toBe('sin_contactar');
    expect(before!.estadoSource).toBe('derived');

    const detail = await setEstadoOverride(empresaId, 'presupuestada', adminId);
    expect(detail.estado).toBe('presupuestada');
    expect(detail.estadoSource).toBe('override');
    expect(detail.estadoOverride).toBe('presupuestada');

    const eventos = await listEventos(empresaId);
    const cambio = eventos.find((e) => e.tipo === 'cambio_estado');
    expect(cambio).toBeTruthy();
    expect(cambio!.fromStatus).toBe('sin_contactar');
    expect(cambio!.toStatus).toBe('presupuestada');
  });

  it('setEstadoOverride a null limpia el override y vuelve al derivado, registrando el cambio (R23)', async () => {
    await setEstadoOverride(empresaId, 'auditada', adminId);
    const cleared = await setEstadoOverride(empresaId, null, adminId);
    expect(cleared.estadoOverride).toBeNull();
    expect(cleared.estadoSource).toBe('derived');
    expect(cleared.estado).toBe('sin_contactar'); // derivado: prospecto sin actividad

    const eventos = await listEventos(empresaId);
    const cambios = eventos.filter((e) => e.tipo === 'cambio_estado');
    // Dos cambios: fijar (→auditada) y limpiar (auditada→sin_contactar).
    expect(cambios.length).toBe(2);
    const clear = cambios[0]; // más reciente
    expect(clear.fromStatus).toBe('auditada');
    expect(clear.toStatus).toBe('sin_contactar');
  });

  it('setEstadoOverride sobre empresa inexistente lanza EmpresaNotFoundError (R23)', async () => {
    await expect(
      setEstadoOverride('00000000-0000-0000-0000-000000000000', 'activa', adminId)
    ).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });

  // ---- Endpoint GET/POST eventos ------------------------------------------

  it('POST /eventos crea el evento (201) y GET lo lista (R22)', async () => {
    const res = await callEventosPost(empresaId, { tipo: 'reunion', texto: 'Reunión inicial' }, admin);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.evento.tipo).toBe('reunion');

    const getRes = await callEventosGet(empresaId, admin);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.eventos.some((e: { texto: string }) => e.texto === 'Reunión inicial')).toBe(true);
  });

  it('POST /eventos con texto vacío → 400 (validación Zod) (R22)', async () => {
    const res = await callEventosPost(empresaId, { tipo: 'nota', texto: '' }, admin);
    expect(res.status).toBe(400);
  });

  it('POST /eventos con tipo inválido → 400 (R22)', async () => {
    const res = await callEventosPost(empresaId, { tipo: 'cambio_estado', texto: 'x' }, admin);
    expect(res.status).toBe(400);
  });

  it('POST /eventos sobre empresa inexistente → 404 (R22)', async () => {
    const res = await callEventosPost(
      '00000000-0000-0000-0000-000000000000',
      { tipo: 'nota', texto: 'x' },
      admin
    );
    expect(res.status).toBe(404);
  });

  // ---- Endpoint POST override ---------------------------------------------

  it('POST /override fija el override y devuelve la empresa con source=override (R23)', async () => {
    const res = await callOverridePost(empresaId, { estado_override: 'activa' }, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.empresa.estado).toBe('activa');
    expect(body.data.empresa.estadoSource).toBe('override');
  });

  it('POST /override con null limpia el override (R23)', async () => {
    await callOverridePost(empresaId, { estado_override: 'activa' }, admin);
    const res = await callOverridePost(empresaId, { estado_override: null }, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.empresa.estadoSource).toBe('derived');
  });

  it('POST /override con estado inválido → 400 (R23)', async () => {
    const res = await callOverridePost(empresaId, { estado_override: 'no_existe' }, admin);
    expect(res.status).toBe(400);
  });

  it('POST /override sobre empresa inexistente → 404 (R23)', async () => {
    const res = await callOverridePost(
      '00000000-0000-0000-0000-000000000000',
      { estado_override: 'activa' },
      admin
    );
    expect(res.status).toBe(404);
  });

  // ---- Guards --------------------------------------------------------------

  it('GET /eventos sin sesión → 401 (R29)', async () => {
    const res = await callEventosGet(empresaId, null);
    expect(res.status).toBe(401);
  });

  it('POST /eventos con rol staff (técnico) → 201 (R29)', async () => {
    const res = await callEventosPost(empresaId, { tipo: 'nota', texto: 'tec nota' }, tecnico);
    expect(res.status).toBe(201);
  });

  it('POST /override sin sesión → 401 (R29)', async () => {
    const res = await callOverridePost(empresaId, { estado_override: 'activa' }, null);
    expect(res.status).toBe(401);
  });
});
