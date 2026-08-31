import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  cambiarEstadoEscaneo,
  crearEscaneo,
  marcarRevision,
  upsertDispositivos
} from '../src/lib/server/escaneos/repo';
import {
  contadoresRevisionConsolidado,
  listarConsolidado,
  listarEscaneosParaUi,
  obtenerDispositivoConsolidado
} from '../src/lib/server/escaneos/consolidado';
import { dispositivoInput, type DispositivoInput } from '../src/lib/server/escaneos/schemas';
import { findUserIdByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import { insertTestEmpresa } from './helpers/empresa';
import { setupTestDb, teardownTestDb } from './helpers/db';

const ADMIN = 'admin@serviciosysistemas.com.ar';
const TECNICO = 'facu@serviciosysistemas.com.ar';

const T1 = new Date('2026-08-20T10:00:00Z');
const T2 = new Date('2026-08-21T10:00:00Z');
const T3 = new Date('2026-08-22T10:00:00Z');

function chunk(d: unknown): DispositivoInput {
  return dispositivoInput.parse(d);
}

describe('escaneos — read-model consolidado (#62)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function fixtures(razonSocial = 'Consolidado SA') {
    const { auditId, clientId: empresaId } = await insertTestAuditRow(sql, { razonSocial });
    const tecnicoId = await findUserIdByEmail(sql, TECNICO);
    return { auditId, empresaId, tecnicoId };
  }

  async function escaneoEnCurso(
    empresaId: string,
    auditId: string,
    tecnicoId: string,
    etiqueta: string,
    rango = '192.168.10.0/24'
  ) {
    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      etiqueta,
      rangoObjetivo: rango,
      agenteVersion: '1.0.0',
      consentimientoPor: 'CTO del cliente',
      consentimientoAt: new Date('2026-08-20T09:00:00Z')
    });
    await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
    return esc;
  }

  it('misma MAC en 2 escaneos → 1 dispositivo con 2 ocurrencias y provenance ordenada (R9,R10)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Dedup SA');
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'VLAN 10', '192.168.10.0/24');
    const esc2 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'VLAN 20', '192.168.20.0/24');

    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:10', ip: '192.168.10.5', hostname: 'srv', vistoAt: T1 })
    ]);
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:10', ip: '192.168.20.7', vistoAt: T2 })
    ]);
    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ ip: '192.168.10.99', vistoAt: T1 })
    ]);

    const { items, total } = await listarConsolidado(empresaId, auditId);
    expect(total).toBe(2);

    const dedup = items.find((d) => d.mac === 'aabbccddee10')!;
    expect(dedup.identidad).toBe('aabbccddee10');
    // R11: ip de la ocurrencia más reciente
    expect(dedup.ip).toBe('192.168.20.7');
    expect(dedup.vistoAt?.toISOString()).toBe(T2.toISOString());

    // R10: provenance con ambos escaneos, más reciente primero
    expect(dedup.ocurrencias).toHaveLength(2);
    expect(dedup.ocurrencias[0].escaneoId).toBe(esc2.id);
    expect(dedup.ocurrencias[0].escaneoEtiqueta).toBe('VLAN 20');
    expect(dedup.ocurrencias[0].escaneoRango).toBe('192.168.20.0/24');
    expect(dedup.ocurrencias[0].escaneoEstado).toBe('en_curso');
    expect(dedup.ocurrencias[0].vistoAt?.toISOString()).toBe(T2.toISOString());
    expect(dedup.ocurrencias[1].escaneoId).toBe(esc1.id);
    expect(dedup.ocurrencias[1].escaneoEtiqueta).toBe('VLAN 10');
  });

  it('precedencia por campo: valor solo en la ocurrencia vieja se conserva; en ambas gana la reciente (R11)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Precedencia SA');
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Viejo');
    const esc2 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Nuevo');

    await upsertDispositivos(empresaId, esc1.id, [
      chunk({
        mac: 'AA:BB:CC:DD:EE:11',
        ip: '192.168.10.6',
        hostname: 'srv-viejo',
        soNombre: 'Debian 11',
        fabricante: 'Dell',
        memoriaMb: 8192,
        vistoAt: T1
      })
    ]);
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({
        mac: 'AA:BB:CC:DD:EE:11',
        ip: '192.168.10.6',
        hostname: 'srv-nuevo',
        modelo: 'PowerEdge R750',
        vistoAt: T2
      })
    ]);

    const { items } = await listarConsolidado(empresaId, auditId);
    expect(items).toHaveLength(1);
    const d = items[0];
    // Presente en ambas → gana la reciente
    expect(d.hostname).toBe('srv-nuevo');
    // Solo en la vieja → se conserva (relleno de huecos)
    expect(d.soNombre).toBe('Debian 11');
    expect(d.fabricante).toBe('Dell');
    expect(d.memoriaMb).toBe(8192);
    // Solo en la reciente
    expect(d.modelo).toBe('PowerEdge R750');
  });

  it("tipo 'desconocido' reciente no pisa un tipo conocido anterior (R12)", async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Tipo SA');
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Con credenciales');
    const esc2 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'ARP pobre');

    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:12', ip: '192.168.10.7', tipo: 'servidor', vistoAt: T1 })
    ]);
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:12', ip: '192.168.10.7', tipo: 'desconocido', vistoAt: T2 })
    ]);
    // Grupo donde todas las ocurrencias son desconocidas
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({ ip: '192.168.10.70', tipo: 'desconocido', vistoAt: T2 })
    ]);

    const { items } = await listarConsolidado(empresaId, auditId);
    const conocido = items.find((d) => d.mac === 'aabbccddee12')!;
    expect(conocido.tipo).toBe('servidor');
    const pelado = items.find((d) => d.ip === '192.168.10.70')!;
    expect(pelado.tipo).toBe('desconocido');
  });

  it('revisión efectiva: confirmado viejo + ocurrencia nueva sin_revisar → sigue confirmado con quién/cuándo (R13,R14)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Revision efectiva SA');
    const adminId = await findUserIdByEmail(sql, ADMIN);
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Primero');

    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:13', ip: '192.168.10.8', vistoAt: T1 })
    ]);
    const [{ devId }] = await sql<{ devId: string }[]>`
      SELECT id AS "devId" FROM escaneo_dispositivo WHERE escaneo_id = ${esc1.id}
    `;
    await marcarRevision(empresaId, devId, 'confirmado', adminId, 'Verificado en sitio');

    // Un escaneo posterior registra una ocurrencia NUEVA de la misma identidad
    const esc2 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Segundo');
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:13', ip: '192.168.10.8', vistoAt: T2 })
    ]);

    const { items } = await listarConsolidado(empresaId, auditId);
    expect(items).toHaveLength(1);
    const d = items[0];
    // R14: la ocurrencia nueva (sin_revisar a nivel fila) no revierte la decisión
    expect(d.revision).toBe('confirmado');
    expect(d.revisadoPor).toBe(adminId);
    expect(d.revisadoAt).not.toBeNull();
    expect(d.notaTecnico).toBe('Verificado en sitio');
    expect(d.ocurrencias).toHaveLength(2);
  });

  it('grupo sin MAC (identidad por IP) → identidadPorIp = true (R15)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Identidad debil SA');
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'ARP');

    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ ip: '192.168.10.50', vistoAt: T1 }),
      chunk({ mac: 'AA:BB:CC:DD:EE:15', ip: '192.168.10.51', vistoAt: T1 })
    ]);

    const { items } = await listarConsolidado(empresaId, auditId);
    const porIp = items.find((d) => d.identidad === '192.168.10.50')!;
    expect(porIp.identidadPorIp).toBe(true);
    expect(porIp.mac).toBeNull();
    const porMac = items.find((d) => d.identidad === 'aabbccddee15')!;
    expect(porMac.identidadPorIp).toBe(false);
  });

  it('filtros por tipo, revisión efectiva y escaneo de origen, con paginación (R16)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Filtros SA');
    const adminId = await findUserIdByEmail(sql, ADMIN);
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Escaneo A');
    const esc2 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Escaneo B');

    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:20', ip: '192.168.10.20', tipo: 'servidor', vistoAt: T1 }),
      chunk({ mac: 'AA:BB:CC:DD:EE:21', ip: '192.168.10.21', tipo: 'impresora', vistoAt: T1 })
    ]);
    // Mismo servidor también visto por el escaneo B
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:20', ip: '192.168.20.20', tipo: 'servidor', vistoAt: T2 }),
      chunk({ mac: 'AA:BB:CC:DD:EE:22', ip: '192.168.20.22', tipo: 'switch', vistoAt: T2 })
    ]);

    // Revisión efectiva: impresora descartada
    const [{ devId }] = await sql<{ devId: string }[]>`
      SELECT id AS "devId" FROM escaneo_dispositivo
      WHERE escaneo_id = ${esc1.id} AND tipo = 'impresora'
    `;
    await marcarRevision(empresaId, devId, 'descartado', adminId);

    // Por tipo (sobre el consolidado, dedup aplicado)
    const servidores = await listarConsolidado(empresaId, auditId, { tipo: 'servidor' });
    expect(servidores.total).toBe(1);
    expect(servidores.items[0].identidad).toBe('aabbccddee20');

    // Por revisión efectiva
    const descartados = await listarConsolidado(empresaId, auditId, { revision: 'descartado' });
    expect(descartados.total).toBe(1);
    expect(descartados.items[0].identidad).toBe('aabbccddee21');
    const sinRevisar = await listarConsolidado(empresaId, auditId, { revision: 'sin_revisar' });
    expect(sinRevisar.total).toBe(2);

    // Por escaneo de origen: el servidor aparece en ambos
    const deA = await listarConsolidado(empresaId, auditId, { escaneoId: esc1.id });
    expect(deA.total).toBe(2);
    const deB = await listarConsolidado(empresaId, auditId, { escaneoId: esc2.id });
    expect(deB.total).toBe(2);

    // Paginación: sin_revisar primero, luego ip
    const pagina1 = await listarConsolidado(empresaId, auditId, { limit: 2, offset: 0 });
    const pagina2 = await listarConsolidado(empresaId, auditId, { limit: 2, offset: 2 });
    expect(pagina1.total).toBe(3);
    expect(pagina1.items).toHaveLength(2);
    expect(pagina2.items).toHaveLength(1);
    const ids1 = pagina1.items.map((d) => d.identidad);
    const ids2 = pagina2.items.map((d) => d.identidad);
    expect([...ids1, ...ids2]).toHaveLength(3);
    expect(new Set([...ids1, ...ids2]).size).toBe(3);
    // sin_revisar primero: el descartado queda último
    expect(ids2).toEqual(['aabbccddee21']);
  });

  it('contadores por revisión efectiva sobre el consolidado completo (R17)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Contadores SA');
    const adminId = await findUserIdByEmail(sql, ADMIN);
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'A');
    const esc2 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'B');

    // Misma identidad en dos escaneos: cuenta UNA vez
    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:30', ip: '192.168.10.30', vistoAt: T1 })
    ]);
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:30', ip: '192.168.10.30', vistoAt: T2 }),
      chunk({ mac: 'AA:BB:CC:DD:EE:31', ip: '192.168.10.31', vistoAt: T2 })
    ]);
    const [{ devId }] = await sql<{ devId: string }[]>`
      SELECT id AS "devId" FROM escaneo_dispositivo
      WHERE escaneo_id = ${esc2.id} AND identidad = 'aabbccddee31'
    `;
    await marcarRevision(empresaId, devId, 'confirmado', adminId);

    const contadores = await contadoresRevisionConsolidado(empresaId, auditId);
    expect(contadores).toEqual({ sin_revisar: 1, confirmado: 1, descartado: 0, fusionado: 0 });
  });

  it('misma MAC en otra auditoría NO se deduplica entre auditorías (R9)', async () => {
    const a = await fixtures('Auditoria Uno SA');
    const b = await fixtures('Auditoria Dos SA');

    const escA = await escaneoEnCurso(a.empresaId, a.auditId, a.tecnicoId, 'A');
    const escB = await escaneoEnCurso(b.empresaId, b.auditId, b.tecnicoId, 'B');
    await upsertDispositivos(a.empresaId, escA.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:40', ip: '192.168.10.40', hostname: 'en-a', vistoAt: T1 })
    ]);
    await upsertDispositivos(b.empresaId, escB.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:40', ip: '10.0.0.40', hostname: 'en-b', vistoAt: T2 })
    ]);

    const consA = await listarConsolidado(a.empresaId, a.auditId);
    expect(consA.total).toBe(1);
    expect(consA.items[0].hostname).toBe('en-a');
    expect(consA.items[0].ocurrencias).toHaveLength(1);

    const consB = await listarConsolidado(b.empresaId, b.auditId);
    expect(consB.total).toBe(1);
    expect(consB.items[0].hostname).toBe('en-b');
  });

  it('empresaId ajeno → lista vacía, contadores en cero y detalle not found (R27,R28)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Scope SA');
    const otraEmpresa = await insertTestEmpresa(sql, { razonSocial: 'Ajena Consolidado SA' });
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'A');
    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:50', ip: '192.168.10.60', vistoAt: T1 })
    ]);

    expect(await listarConsolidado(otraEmpresa, auditId)).toEqual({ items: [], total: 0 });
    expect(await contadoresRevisionConsolidado(otraEmpresa, auditId)).toEqual({
      sin_revisar: 0,
      confirmado: 0,
      descartado: 0,
      fusionado: 0
    });
    expect(await listarEscaneosParaUi(otraEmpresa, auditId)).toEqual([]);
    await expect(
      obtenerDispositivoConsolidado(otraEmpresa, auditId, 'aabbccddee50')
    ).rejects.toMatchObject({ code: 'ESCANEO_NOT_FOUND' });
    await expect(
      obtenerDispositivoConsolidado(empresaId, auditId, 'identidad-inexistente')
    ).rejects.toMatchObject({ code: 'ESCANEO_NOT_FOUND' });
  });

  it('detalle: software/servicios de la ocurrencia canónica y raw por ocurrencia sin transformación (R18,R19)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Detalle SA');
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Viejo');
    const esc2 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Nuevo');

    const rawViejo = { agente: 'open-audit', tramo: 1 };
    const rawNuevo = { agente: 'open-audit', tramo: 2, anidado: { ok: true } };
    await upsertDispositivos(empresaId, esc1.id, [
      chunk({
        mac: 'AA:BB:CC:DD:EE:60',
        ip: '192.168.10.70',
        vistoAt: T1,
        raw: rawViejo,
        software: [{ nombre: 'nginx', version: '1.24', publisher: 'nginx.org' }],
        servicios: [{ puerto: 22, protocolo: 'tcp', estadoPuerto: 'open', servicio: 'ssh' }]
      })
    ]);
    await upsertDispositivos(empresaId, esc2.id, [
      chunk({
        mac: 'AA:BB:CC:DD:EE:60',
        ip: '192.168.10.70',
        vistoAt: T2,
        raw: rawNuevo,
        software: [{ nombre: 'postgres', version: '16' }],
        servicios: [
          { puerto: 443, protocolo: 'tcp', estadoPuerto: 'open', servicio: 'https' },
          { puerto: 5432, protocolo: 'tcp', estadoPuerto: 'open', servicio: 'postgresql' }
        ]
      })
    ]);

    const detalle = await obtenerDispositivoConsolidado(empresaId, auditId, 'aabbccddee60');

    // R18: la ocurrencia canónica es la más reciente (esc2) y queda identificada
    const [{ devCanonico }] = await sql<{ devCanonico: string }[]>`
      SELECT id AS "devCanonico" FROM escaneo_dispositivo WHERE escaneo_id = ${esc2.id}
    `;
    expect(detalle.canonicalId).toBe(devCanonico);
    expect(detalle.ocurrencias[0].escaneoId).toBe(esc2.id);
    expect(detalle.ocurrencias[0].escaneoEtiqueta).toBe('Nuevo');

    // Software y servicios SOLO de la canónica (no se unen entre escaneos)
    expect(detalle.software.map((s) => s.nombre)).toEqual(['postgres']);
    expect(detalle.software[0].version).toBe('16');
    expect(detalle.servicios.map((s) => s.puerto)).toEqual([443, 5432]);
    expect(detalle.servicios[0].estadoPuerto).toBe('open');

    // R19: raw por ocurrencia, sin transformación, más reciente primero
    expect(detalle.ocurrenciasRaw).toHaveLength(2);
    expect(detalle.ocurrenciasRaw[0].escaneoId).toBe(esc2.id);
    expect(detalle.ocurrenciasRaw[0].raw).toEqual(rawNuevo);
    expect(detalle.ocurrenciasRaw[1].escaneoId).toBe(esc1.id);
    expect(detalle.ocurrenciasRaw[1].raw).toEqual(rawViejo);
  });

  it('listarEscaneosParaUi: estado, rango, conteo y token activo con expiración (R8)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Escaneos UI SA');
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Con token');
    const esc2 = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      etiqueta: 'Pendiente sin token',
      rangoObjetivo: '10.0.9.0/24',
      agenteVersion: '1.0.0'
    });
    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ ip: '192.168.10.80', vistoAt: T1 }),
      chunk({ ip: '192.168.10.81', vistoAt: T1 })
    ]);
    await sql`
      INSERT INTO escaneo_token (escaneo_id, token_hash, creado_por, expires_at)
      VALUES (${esc1.id}, ${'a'.repeat(64)}, ${tecnicoId}, now() + interval '12 hours')
    `;

    const escaneos = await listarEscaneosParaUi(empresaId, auditId);
    expect(escaneos).toHaveLength(2);
    // created_at DESC: el más nuevo primero
    expect(escaneos[0].id).toBe(esc2.id);

    const conToken = escaneos.find((e) => e.id === esc1.id)!;
    expect(conToken.etiqueta).toBe('Con token');
    expect(conToken.rango_objetivo).toBe('192.168.10.0/24');
    expect(conToken.estado).toBe('en_curso');
    expect(conToken.dispositivos_detectados).toBe(2);
    expect(conToken.tokenActivo).toBe(true);
    expect(conToken.tokenExpiresAt).not.toBeNull();
    expect(conToken.iniciado_at).not.toBeNull();

    const sinToken = escaneos.find((e) => e.id === esc2.id)!;
    expect(sinToken.tokenActivo).toBe(false);
    expect(sinToken.tokenExpiresAt).toBeNull();
    expect(sinToken.dispositivos_detectados).toBe(0);
  });

  it('consolidado incluye dispositivos de escaneos fallidos/cancelados con su estado en provenance (OQ3, R10)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Fallido SA');
    const esc1 = await escaneoEnCurso(empresaId, auditId, tecnicoId, 'Tramo que falló');
    await upsertDispositivos(empresaId, esc1.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:70', ip: '192.168.10.90', vistoAt: T3 })
    ]);
    await cambiarEstadoEscaneo(empresaId, esc1.id, 'sincronizando');
    await cambiarEstadoEscaneo(empresaId, esc1.id, 'fallido', 'Se cortó la conexión');

    const { items, total } = await listarConsolidado(empresaId, auditId);
    expect(total).toBe(1);
    expect(items[0].ocurrencias[0].escaneoEstado).toBe('fallido');
  });
});
