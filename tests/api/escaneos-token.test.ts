import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { insertTestAuditRow } from '../helpers/backoffice';
import { findUserByEmail, findUserIdByEmail } from '../helpers/auth';
import { crearEscaneo } from '../../src/lib/server/escaneos/repo';
import { hashToken } from '../../src/lib/server/auth/password-reset';
import { resetEscaneoRateLimits } from '../../src/lib/server/api/escaneo-rate-limit';
import { POST as crearEscaneoPost } from '../../src/routes/api/escaneos/+server';
import {
  POST as emitirTokenPost,
  DELETE as revocarTokenDelete
} from '../../src/routes/api/escaneos/[escaneoId]/token/+server';
import { GET as getEstado } from '../../src/routes/api/escaneos/[escaneoId]/+server';

const ADMIN = 'admin@serviciosysistemas.com.ar';
const FACU = 'facu@serviciosysistemas.com.ar';
const SIMON = 'simon@serviciosysistemas.com.ar';
const VERSION = '1.2.3';

/**
 * #60 T8 — ciclo de vida del token de escaneo y guards staff.
 * Cubre R1, R3, R4, R5, R6, R7, R22.
 */
describe('escaneos API — token y creación staff', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    resetEscaneoRateLimits();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function fixtures(razonSocial: string) {
    const { auditId, clientId: empresaId } = await insertTestAuditRow(sql, { razonSocial });
    const tecnicoId = await findUserIdByEmail(sql, FACU);
    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      rangoObjetivo: '192.168.10.0/24',
      agenteVersion: VERSION
    });
    return { auditId, empresaId, tecnicoId, escaneoId: esc.id };
  }

  function emitir(escaneoId: string, user: unknown) {
    return emitirTokenPost({
      request: new Request(`http://localhost/api/escaneos/${escaneoId}/token`, { method: 'POST' }),
      params: { escaneoId },
      locals: { user }
    } as never);
  }

  function revocar(escaneoId: string, user: unknown) {
    return revocarTokenDelete({
      request: new Request(`http://localhost/api/escaneos/${escaneoId}/token`, { method: 'DELETE' }),
      params: { escaneoId },
      locals: { user }
    } as never);
  }

  function getEstadoCon(escaneoId: string, token: string, ip = '10.60.1.1') {
    return getEstado({
      request: new Request(`http://localhost/api/escaneos/${escaneoId}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Agente-Version': VERSION }
      }),
      params: { escaneoId },
      getClientAddress: () => ip
    } as never);
  }

  function crearEscaneoViaApi(body: unknown, user: unknown) {
    return crearEscaneoPost({
      request: new Request('http://localhost/api/escaneos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }),
      locals: { user }
    } as never);
  }

  async function tokensDeEscaneo(escaneoId: string) {
    return sql<
      { token_hash: string; revoked_at: Date | null; expires_at: Date; created_at: Date }[]
    >`
      SELECT token_hash, revoked_at, expires_at, created_at
      FROM escaneo_token WHERE escaneo_id = ${escaneoId} ORDER BY created_at
    `;
  }

  it('emisión: 401 sin sesión y 403 a técnico no asignado, sin mutar nada (R6)', async () => {
    const { escaneoId } = await fixtures('Token Guards SA');
    const simon = await findUserByEmail(sql, SIMON);

    const sinSesion = await emitir(escaneoId, null);
    expect(sinSesion.status).toBe(401);

    const noAsignado = await emitir(escaneoId, simon);
    expect(noAsignado.status).toBe(403);

    const sinSesionDel = await revocar(escaneoId, null);
    expect(sinSesionDel.status).toBe(401);

    const noAsignadoDel = await revocar(escaneoId, simon);
    expect(noAsignadoDel.status).toBe(403);

    expect(await tokensDeEscaneo(escaneoId)).toHaveLength(0);
  });

  it('emisión: 404 si el escaneo no existe (R6)', async () => {
    const admin = await findUserByEmail(sql, ADMIN);
    const res = await emitir(randomUUID(), admin);
    expect(res.status).toBe(404);
  });

  it('emisión admin y técnico asignado: claro solo en la respuesta, hash de 64 hex en DB (R1, R5, R6)', async () => {
    const { escaneoId } = await fixtures('Token Emision SA');
    const admin = await findUserByEmail(sql, ADMIN);

    const res = await emitir(escaneoId, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const token = body.data.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits base64url
    expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // R1/R2: en DB solo el hash SHA-256, con TTL dentro de las 12 h
    const [row] = await tokensDeEscaneo(escaneoId);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).not.toBe(token);
    expect(row.revoked_at).toBeNull();
    const ttlMs = row.expires_at.getTime() - row.created_at.getTime();
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(12 * 60 * 60 * 1000);

    // R5: ninguna otra respuesta expone el claro
    const estado = await getEstadoCon(escaneoId, token);
    expect(estado.status).toBe(200);
    expect(JSON.stringify(await estado.json())).not.toContain(token);

    // R6: técnico asignado también emite
    const facu = await findUserByEmail(sql, FACU);
    const resTec = await emitir(escaneoId, facu);
    expect(resTec.status).toBe(200);
  });

  it('rotación: el segundo POST revoca el primero en la misma operación (R3)', async () => {
    const { escaneoId } = await fixtures('Token Rotacion SA');
    const admin = await findUserByEmail(sql, ADMIN);

    const t1 = (await (await emitir(escaneoId, admin)).json()).data.token as string;
    const t2 = (await (await emitir(escaneoId, admin)).json()).data.token as string;
    expect(t1).not.toBe(t2);

    // El viejo deja de funcionar de inmediato; el nuevo funciona
    const viejo = await getEstadoCon(escaneoId, t1);
    expect(viejo.status).toBe(401);
    const nuevo = await getEstadoCon(escaneoId, t2);
    expect(nuevo.status).toBe(200);

    // Un solo token activo por escaneo; historial conservado
    const rows = await tokensDeEscaneo(escaneoId);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.revoked_at === null)).toHaveLength(1);
    expect(rows.find((r) => r.token_hash === hashToken(t1))?.revoked_at).not.toBeNull();
  });

  it('revocación: DELETE impide el uso de inmediato, conserva historial y es idempotente (R4)', async () => {
    const { escaneoId } = await fixtures('Token Revocacion SA');
    const admin = await findUserByEmail(sql, ADMIN);

    const token = (await (await emitir(escaneoId, admin)).json()).data.token as string;

    const del = await revocar(escaneoId, admin);
    expect(del.status).toBe(200);

    const uso = await getEstadoCon(escaneoId, token);
    expect(uso.status).toBe(401);

    // Idempotente: 200 aunque no haya token activo
    const del2 = await revocar(escaneoId, admin);
    expect(del2.status).toBe(200);

    // Historial conservado
    const rows = await tokensDeEscaneo(escaneoId);
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it('token expirado responde 401 con el mismo mensaje que uno inexistente (R7)', async () => {
    const { escaneoId, tecnicoId } = await fixtures('Token Expirado SA');
    const tokenExpirado = 'token-expirado-de-prueba';

    // Emitido hace 13 h con TTL de 12 h → expirado (el CHECK exige expires_at > created_at)
    await sql`
      INSERT INTO escaneo_token (escaneo_id, token_hash, creado_por, expires_at, created_at)
      VALUES (
        ${escaneoId}, ${hashToken(tokenExpirado)}, ${tecnicoId},
        now() - interval '1 hour', now() - interval '13 hours'
      )
    `;

    const expirado = await getEstadoCon(escaneoId, tokenExpirado, '10.60.7.1');
    expect(expirado.status).toBe(401);
    const inexistente = await getEstadoCon(escaneoId, 'token-que-no-existe', '10.60.7.2');
    expect(inexistente.status).toBe(401);
    expect(await expirado.json()).toEqual(await inexistente.json());
  });

  it('POST /api/escaneos: 201 en pendiente para admin y técnico asignado (R22, R6)', async () => {
    const { auditId } = await fixtures('Crear Escaneo SA');
    const admin = await findUserByEmail(sql, ADMIN);
    const facu = await findUserByEmail(sql, FACU);

    const body = {
      auditId,
      rangoObjetivo: '10.0.0.0/24',
      agenteVersion: VERSION,
      etiqueta: 'VLAN admin'
    };

    const resAdmin = await crearEscaneoViaApi(body, admin);
    expect(resAdmin.status).toBe(201);
    const dataAdmin = (await resAdmin.json()).data;
    expect(dataAdmin.estado).toBe('pendiente');
    expect(dataAdmin.audit_id).toBe(auditId);
    expect(dataAdmin.rango_objetivo).toBe('10.0.0.0/24');

    const resTec = await crearEscaneoViaApi({ ...body, etiqueta: 'VLAN depósito' }, facu);
    expect(resTec.status).toBe(201);
  });

  it('POST /api/escaneos: 401 sin sesión, 403 técnico no asignado, 404 auditoría inexistente, 400 body inválido (R22, R6)', async () => {
    const { auditId } = await fixtures('Crear Escaneo Guards SA');
    const admin = await findUserByEmail(sql, ADMIN);
    const simon = await findUserByEmail(sql, SIMON);
    const body = { auditId, rangoObjetivo: '10.0.1.0/24', agenteVersion: VERSION };

    expect((await crearEscaneoViaApi(body, null)).status).toBe(401);
    expect((await crearEscaneoViaApi(body, simon)).status).toBe(403);
    expect(
      (await crearEscaneoViaApi({ ...body, auditId: randomUUID() }, admin)).status
    ).toBe(404);
    expect((await crearEscaneoViaApi({ auditId }, admin)).status).toBe(400);
  });
});
