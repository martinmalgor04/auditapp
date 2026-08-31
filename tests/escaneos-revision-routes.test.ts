import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import type { AppUser } from '../src/lib/server/auth/types';
import { setSqlForTests } from '../src/lib/server/db/client';
import { hashToken } from '../src/lib/server/auth/password-reset';
import {
  cambiarEstadoEscaneo,
  crearEscaneo,
  upsertDispositivos
} from '../src/lib/server/escaneos/repo';
import { resolverTokenEscaneo } from '../src/lib/server/escaneos/api';
import { dispositivoInput } from '../src/lib/server/escaneos/schemas';
import {
  actions as escaneosActions,
  load as escaneosLoad
} from '../src/routes/(app)/auditorias/[id]/escaneos/+page.server';
import {
  actions as detalleActions,
  load as detalleLoad
} from '../src/routes/(app)/auditorias/[id]/escaneos/dispositivos/[identidad]/+page.server';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail, findUserIdByEmail } from './helpers/auth';
import { insertAuditResponse, insertTestAuditRow } from './helpers/backoffice';

const ADMIN = 'admin@serviciosysistemas.com.ar';
const FACU = 'facu@serviciosysistemas.com.ar';
const SIMON = 'simon@serviciosysistemas.com.ar';
const MAC = 'AA:BB:CC:DD:EE:A0';
const IDENTIDAD = 'aabbccddeea0';

describe('escaneos UI — rutas de revisión (#62)', () => {
  let sql: postgres.Sql;
  let admin: AppUser;
  let facu: AppUser;
  let simon: AppUser;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    admin = (await findUserByEmail(sql, ADMIN))!;
    facu = (await findUserByEmail(sql, FACU))!;
    simon = (await findUserByEmail(sql, SIMON))!;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function fixtures(razonSocial: string, status?: 'borrador' | 'cerrada') {
    const { auditId, clientId: empresaId } = await insertTestAuditRow(
      sql,
      status ? { razonSocial, status } : { razonSocial }
    );
    const tecnicoId = await findUserIdByEmail(sql, FACU);
    return { auditId, empresaId, tecnicoId };
  }

  /** Escaneo en curso con el dispositivo MAC en dos escaneos (grupo de 2). */
  async function grupoSemilla(empresaId: string, auditId: string, tecnicoId: string) {
    const ids: string[] = [];
    for (const [i, etiqueta] of ['VLAN 10', 'VLAN 20'].entries()) {
      const esc = await crearEscaneo(empresaId, tecnicoId, {
        auditId,
        etiqueta,
        rangoObjetivo: `192.168.${i}.0/24`,
        agenteVersion: '1.0.0',
        consentimientoPor: 'CTO',
        consentimientoAt: new Date('2026-08-20T09:00:00Z')
      });
      await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
      await upsertDispositivos(empresaId, esc.id, [
        dispositivoInput.parse({
          mac: MAC,
          ip: `192.168.${i}.90`,
          hostname: 'srv-archivos',
          tipo: 'servidor',
          vistoAt: new Date(`2026-08-2${i}T10:00:00Z`)
        })
      ]);
      ids.push(esc.id);
    }
    return ids;
  }

  function loadEvent(auditId: string, user: AppUser | null, qs = '') {
    return {
      locals: { user },
      params: { id: auditId },
      url: new URL(`http://localhost/auditorias/${auditId}/escaneos${qs}`)
    } as never;
  }

  function detalleEvent(auditId: string, user: AppUser | null, identidad = IDENTIDAD) {
    return {
      locals: { user },
      params: { id: auditId, identidad },
      url: new URL(`http://localhost/auditorias/${auditId}/escaneos/dispositivos/${identidad}`)
    } as never;
  }

  function actionEvent(auditId: string, user: AppUser | null, fd: FormData) {
    return {
      locals: { user },
      params: { id: auditId },
      request: new Request(`http://localhost/auditorias/${auditId}/escaneos`, {
        method: 'POST',
        body: fd
      })
    } as never;
  }

  function detalleActionEvent(auditId: string, user: AppUser | null, fd: FormData) {
    return {
      locals: { user },
      params: { id: auditId, identidad: IDENTIDAD },
      request: new Request(
        `http://localhost/auditorias/${auditId}/escaneos/dispositivos/${IDENTIDAD}`,
        { method: 'POST', body: fd }
      )
    } as never;
  }

  function fd(campos: Record<string, string>): FormData {
    const data = new FormData();
    for (const [k, v] of Object.entries(campos)) data.set(k, v);
    return data;
  }

  it('guards: sin sesión → 303 /login; técnico no asignado → 403; admin y asignado → 200 (R2,R3)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Guards SA');
    await grupoSemilla(empresaId, auditId, tecnicoId);

    // Técnico IT en scope de tipo pero NO asignado a esta auditoría
    await sql`
      INSERT INTO app_user (email, name, password_hash, role, active, audit_types)
      VALUES ('otro-it@serviciosysistemas.com.ar', 'Otro IT', 'x', 'tecnico', true, ${['it']})
      ON CONFLICT (email) DO NOTHING
    `;
    const otroIt = (await findUserByEmail(sql, 'otro-it@serviciosysistemas.com.ar'))!;

    await expect(escaneosLoad(loadEvent(auditId, null))).rejects.toMatchObject({
      status: 303,
      location: '/login'
    });
    // R3: técnico no asignado → 403 en lista y detalle
    await expect(escaneosLoad(loadEvent(auditId, otroIt))).rejects.toMatchObject({ status: 403 });
    await expect(detalleLoad(detalleEvent(auditId, otroIt))).rejects.toMatchObject({ status: 403 });
    // Fuera de scope de tipo (simon es erp-*): 404 vía getAuditById, patrón del detalle
    await expect(escaneosLoad(loadEvent(auditId, simon))).rejects.toMatchObject({ status: 404 });

    // R3: la mutación tampoco se ejecuta para el no asignado
    const prohibido = await escaneosActions.marcar(
      actionEvent(auditId, otroIt, fd({ identidad: IDENTIDAD, revision: 'confirmado' }))
    );
    expect(prohibido).toMatchObject({ status: 403 });

    const dataAdmin = (await escaneosLoad(loadEvent(auditId, admin))) as {
      dispositivos: unknown[];
    };
    expect(dataAdmin.dispositivos).toHaveLength(1);

    const dataFacu = (await escaneosLoad(loadEvent(auditId, facu))) as {
      dispositivos: unknown[];
    };
    expect(dataFacu.dispositivos).toHaveLength(1);

    // Detalle 200 para admin y 404 para identidad inexistente
    const detalle = (await detalleLoad(detalleEvent(auditId, admin))) as {
      dispositivo: { identidad: string };
    };
    expect(detalle.dispositivo.identidad).toBe(IDENTIDAD);
    await expect(detalleLoad(detalleEvent(auditId, admin, 'no-existe'))).rejects.toMatchObject({
      status: 404
    });
  });

  it('auditoría cerrada: revisión permitida (R4); crear escaneo y tokens → 409 (R32)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Cerrada SA', 'cerrada');
    const [escaneoId] = await grupoSemilla(empresaId, auditId, tecnicoId);

    // R32: creación y tokens bloqueados
    const crear = await escaneosActions.crearEscaneo(
      actionEvent(auditId, admin, fd({ rangoObjetivo: '10.9.9.0/24' }))
    );
    expect(crear).toMatchObject({ status: 409 });
    const emitir = await escaneosActions.emitirToken(
      actionEvent(auditId, admin, fd({ escaneoId }))
    );
    expect(emitir).toMatchObject({ status: 409 });
    const revocar = await escaneosActions.revocarToken(
      actionEvent(auditId, admin, fd({ escaneoId }))
    );
    expect(revocar).toMatchObject({ status: 409 });

    // R4: la revisión opera normal con auditoría cerrada
    const marcar = await escaneosActions.marcar(
      actionEvent(auditId, admin, fd({ identidad: IDENTIDAD, revision: 'confirmado' }))
    );
    expect(marcar).toMatchObject({ success: true });

    const confirmar = await detalleActions.confirmar(
      detalleActionEvent(auditId, facu, fd({ nota: 'Post-cierre' }))
    );
    expect(confirmar).toMatchObject({ success: true });

    const filas = await sql<{ revision: string; nota_tecnico: string | null }[]>`
      SELECT revision, nota_tecnico FROM escaneo_dispositivo WHERE identidad = ${IDENTIDAD}
    `;
    expect(filas).toHaveLength(2);
    for (const f of filas) {
      expect(f.revision).toBe('confirmado');
      expect(f.nota_tecnico).toBe('Post-cierre');
    }
  });

  it('action crearEscaneo → escaneo pendiente con el técnico de la sesión (R5)', async () => {
    const { auditId } = await fixtures('Crear UI SA');

    const res = await escaneosActions.crearEscaneo(
      actionEvent(auditId, facu, fd({ rangoObjetivo: '10.1.0.0/24', etiqueta: 'VLAN piso 2' }))
    );
    expect(res).toMatchObject({ success: true });

    const [esc] = await sql<
      { estado: string; tecnico_id: string; etiqueta: string; agente_version: string }[]
    >`
      SELECT estado, tecnico_id, etiqueta, agente_version
      FROM escaneo WHERE audit_id = ${auditId}
    `;
    expect(esc.estado).toBe('pendiente');
    expect(esc.tecnico_id).toBe(facu.id);
    expect(esc.etiqueta).toBe('VLAN piso 2');
    expect(esc.agente_version).toBe('1.0.0');

    // Body inválido → 400 sin escribir
    const invalido = await escaneosActions.crearEscaneo(
      actionEvent(auditId, facu, fd({ rangoObjetivo: '' }))
    );
    expect(invalido).toMatchObject({ status: 400 });
  });

  it('action emitirToken → claro una vez + expiración; DB guarda solo hash (R6)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Token UI SA');
    const [escaneoId] = await grupoSemilla(empresaId, auditId, tecnicoId);

    const res = (await escaneosActions.emitirToken(
      actionEvent(auditId, facu, fd({ escaneoId }))
    )) as { success: boolean; token: string; expiresAt: string };
    expect(res.success).toBe(true);
    expect(res.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const [row] = await sql<{ token_hash: string }[]>`
      SELECT token_hash FROM escaneo_token WHERE escaneo_id = ${escaneoId}
    `;
    expect(row.token_hash).toBe(hashToken(res.token));
    expect(row.token_hash).not.toBe(res.token);

    // Escaneo de otra auditoría → 404
    const otro = await escaneosActions.emitirToken(
      actionEvent(auditId, admin, fd({ escaneoId: randomUUID() }))
    );
    expect(otro).toMatchObject({ status: 404 });
  });

  it('action revocarToken → el token deja de resolver de inmediato (R7)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Revocar UI SA');
    const [escaneoId] = await grupoSemilla(empresaId, auditId, tecnicoId);

    const emitido = (await escaneosActions.emitirToken(
      actionEvent(auditId, admin, fd({ escaneoId }))
    )) as { token: string };

    const res = await escaneosActions.revocarToken(
      actionEvent(auditId, admin, fd({ escaneoId }))
    );
    expect(res).toMatchObject({ success: true });

    expect(await resolverTokenEscaneo(emitido.token)).toEqual({ ok: false, reason: 'revoked' });
    // Historial conservado
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM escaneo_token WHERE escaneo_id = ${escaneoId}
    `;
    expect(n).toBe(1);
  });

  it('load lista escaneos con estado, rango, conteo y token activo (R8)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Lista UI SA');
    const [escaneoId] = await grupoSemilla(empresaId, auditId, tecnicoId);
    await escaneosActions.emitirToken(actionEvent(auditId, admin, fd({ escaneoId })));

    const data = (await escaneosLoad(loadEvent(auditId, admin))) as {
      escaneos: {
        id: string;
        etiqueta: string | null;
        rangoObjetivo: string;
        estado: string;
        dispositivosDetectados: number;
        iniciadoAt: string | null;
        tokenActivo: boolean;
      }[];
      total: number;
      contadores: Record<string, number>;
    };
    expect(data.escaneos).toHaveLength(2);
    const conToken = data.escaneos.find((e) => e.id === escaneoId)!;
    expect(conToken.estado).toBe('en_curso');
    expect(conToken.rangoObjetivo).toBe('192.168.0.0/24');
    expect(conToken.etiqueta).toBe('VLAN 10');
    expect(conToken.dispositivosDetectados).toBe(1);
    expect(conToken.iniciadoAt).not.toBeNull();
    expect(conToken.tokenActivo).toBe(true);
    const sinToken = data.escaneos.find((e) => e.id !== escaneoId)!;
    expect(sinToken.tokenActivo).toBe(false);

    // Consolidado dedup + contadores (R9/R17 a nivel ruta)
    expect(data.total).toBe(1);
    expect(data.contadores.sin_revisar).toBe(1);
  });

  it('action marcar desde la lista aplica la revisión al grupo completo (R20)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Marcar UI SA');
    await grupoSemilla(empresaId, auditId, tecnicoId);

    const res = await escaneosActions.marcar(
      actionEvent(auditId, facu, fd({ identidad: IDENTIDAD, revision: 'descartado' }))
    );
    expect(res).toMatchObject({ success: true, revision: 'descartado' });

    const filas = await sql<{ revision: string; revisado_por: string | null }[]>`
      SELECT revision, revisado_por FROM escaneo_dispositivo WHERE identidad = ${IDENTIDAD}
    `;
    expect(filas).toHaveLength(2);
    for (const f of filas) {
      expect(f.revision).toBe('descartado');
      expect(f.revisado_por).toBe(facu.id);
    }
  });

  it('error de dominio en action → fail() con mensaje legible, sin stack (R29)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Errores UI SA');
    await grupoSemilla(empresaId, auditId, tecnicoId);

    // Dispositivo inexistente → 404 con mensaje
    const noExiste = (await escaneosActions.marcar(
      actionEvent(auditId, admin, fd({ identidad: 'no-existe', revision: 'confirmado' }))
    )) as { status: number; data: { error: string } };
    expect(noExiste.status).toBe(404);
    expect(noExiste.data.error).toBe('Dispositivo no encontrado');
    // Sin stack ni SQL en la respuesta (el code estable es contrato, patrón failFromError)
    expect(JSON.stringify(noExiste)).not.toContain('stack');
    expect(JSON.stringify(noExiste)).not.toContain('SELECT');

    // Fusión con fila inexistente → 400 con mensaje legible
    const [item] = await sql<{ id: string }[]>`
      SELECT ti.id
      FROM audit a
      JOIN section s ON s.template_id = ANY(a.template_ids)
      JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
      WHERE a.id = ${auditId}
      LIMIT 1
    `;
    const fusionInvalida = (await detalleActions.fusionar(
      detalleActionEvent(auditId, admin, fd({ itemId: item.id, rowId: randomUUID() }))
    )) as { status: number; data: { error: string } };
    expect(fusionInvalida.status).toBe(400);
    expect(fusionInvalida.data.error).toContain('relevamiento manual');
  });

  it('fusión desde el detalle vincula sin tocar audit_response (R21,R23 a nivel ruta)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Fusion UI SA');
    await grupoSemilla(empresaId, auditId, tecnicoId);

    const [item] = await sql<{ id: string }[]>`
      SELECT ti.id
      FROM audit a
      JOIN section s ON s.template_id = ANY(a.template_ids)
      JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
      WHERE a.id = ${auditId}
      LIMIT 1
    `;
    const rowId = randomUUID();
    const value = {
      rows: [{ row_id: rowId, cells: { tipo: 'Servidor', marca: 'HP' }, attachment_ids: [] }]
    };
    await insertAuditResponse(sql, auditId, item.id, value);

    const res = await detalleActions.fusionar(
      detalleActionEvent(auditId, facu, fd({ itemId: item.id, rowId, nota: 'Mismo equipo' }))
    );
    expect(res).toMatchObject({ success: true, revision: 'fusionado' });

    const filas = await sql<
      { revision: string; relevamiento_item_id: string | null; relevamiento_row_id: string | null }[]
    >`
      SELECT revision, relevamiento_item_id, relevamiento_row_id
      FROM escaneo_dispositivo WHERE identidad = ${IDENTIDAD}
    `;
    for (const f of filas) {
      expect(f.revision).toBe('fusionado');
      expect(f.relevamiento_item_id).toBe(item.id);
      expect(f.relevamiento_row_id).toBe(rowId);
    }

    const [resp] = await sql<{ value: unknown }[]>`
      SELECT value FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${item.id}
    `;
    expect(resp.value).toEqual(value);

    // Desvincular desde el detalle (R24)
    const des = await detalleActions.desvincular(detalleActionEvent(auditId, facu, new FormData()));
    expect(des).toMatchObject({ success: true });
    const [tras] = await sql<{ revision: string; relevamiento_item_id: string | null }[]>`
      SELECT revision, relevamiento_item_id FROM escaneo_dispositivo WHERE identidad = ${IDENTIDAD} LIMIT 1
    `;
    expect(tras.revision).toBe('sin_revisar');
    expect(tras.relevamiento_item_id).toBeNull();
  });

  it('markup: cards lg:hidden + tabla hidden lg:block y targets táctiles --sys-touch-min (R30,R31)', async () => {
    const cards = readFileSync(
      join(process.cwd(), 'src/lib/components/escaneos/consolidado-cards.svelte'),
      'utf8'
    );
    const tabla = readFileSync(
      join(process.cwd(), 'src/lib/components/escaneos/consolidado-tabla.svelte'),
      'utf8'
    );
    const lista = readFileSync(
      join(process.cwd(), 'src/routes/(app)/auditorias/[id]/escaneos/+page.svelte'),
      'utf8'
    );
    const detalle = readFileSync(
      join(
        process.cwd(),
        'src/routes/(app)/auditorias/[id]/escaneos/dispositivos/[identidad]/+page.svelte'
      ),
      'utf8'
    );

    // R30: patrón CRM — cards < lg, tabla >= lg
    expect(cards).toContain('lg:hidden');
    expect(tabla).toContain('hidden');
    expect(tabla).toContain('lg:block');
    expect(lista).toContain('lg:hidden');
    expect(lista).toContain('lg:block');

    // R31: targets táctiles y badges con tokens --sys-*
    for (const src of [cards, tabla, lista]) {
      expect(src).toContain('min-h-[var(--sys-touch-min)]');
    }
    // El detalle usa SysButton (touch-min incorporado) para toda acción
    expect(detalle).toContain('<SysButton');
    const sysButton = readFileSync(
      join(process.cwd(), 'src/lib/components/brand/SysButton.svelte'),
      'utf8'
    );
    expect(sysButton).toContain('min-h-[var(--sys-touch-min)]');
    const rawDetails = readFileSync(
      join(process.cwd(), 'src/lib/components/escaneos/raw-json-details.svelte'),
      'utf8'
    );
    expect(rawDetails).toContain('min-h-[var(--sys-touch-min)]');
    const view = readFileSync(
      join(process.cwd(), 'src/lib/escaneos/escaneo-view.ts'),
      'utf8'
    );
    expect(view).toContain('sys-status-green');
    expect(view).toContain('sys-status-red');
    expect(view).toContain('sys-status-blue-bg');
  });

  it('el detalle de auditoría enlaza a /escaneos (R1)', async () => {
    const pagina = readFileSync(
      join(process.cwd(), 'src/routes/(app)/auditorias/[id]/+page.svelte'),
      'utf8'
    );
    expect(pagina).toContain('href="/auditorias/{data.audit.id}/escaneos"');
    expect(pagina).toContain('Escaneos de red');
  });
});
