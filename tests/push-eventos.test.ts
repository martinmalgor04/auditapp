/**
 * Tests de envío push por eventos (#53).
 * web-push mockeado: no requiere push service externo.
 * Cubre: R9, R10, R11, R12, R13.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';

// Mock de web-push ANTES de cualquier import del módulo push
vi.mock('web-push', () => {
  const sendNotification = vi.fn();
  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification
    },
    setVapidDetails: vi.fn(),
    sendNotification
  };
});

import webpush from 'web-push';
import { setSqlForTests } from '../src/lib/server/db/client';
import { sendPushToUsers } from '../src/lib/server/push/index';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail } from './helpers/auth';

const sendNotificationMock = webpush.sendNotification as ReturnType<typeof vi.fn>;

const TEST_PAYLOAD = {
  event: 'aviso_briefing_completado' as const,
  title: 'SyS · Briefing completado',
  body: 'Briefing completado para TEST-001',
  url: '/auditorias/test-audit-id'
};

const SUB_EP = 'https://eventos-test.example.com/sub/';

async function insertTestSub(
  sql: postgres.Sql,
  userId: string,
  endpoint: string,
  { p256dh = 'pk', auth = 'ak' } = {}
) {
  await sql`
    INSERT INTO push_subscription (user_id, endpoint, p256dh, auth)
    VALUES (${userId}, ${endpoint}, ${p256dh}, ${auth})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh
  `;
}

describe('push eventos (#53 R9, R10, R11, R12, R13)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let techId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    techId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    await sql`DELETE FROM push_subscription WHERE endpoint LIKE ${SUB_EP + '%'}`;
    sendNotificationMock.mockReset();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // R12: no-op sin VAPID
  it('R12: sin VAPID configurado, sendPushToUsers devuelve no-op (delivered=0) sin lanzar', async () => {
    // En test no hay VAPID configurado; isPushEnabled() → false
    await insertTestSub(sql, adminId, SUB_EP + 'admin');
    const result = await sendPushToUsers([adminId], 'aviso_auditoria_asignada', TEST_PAYLOAD);
    expect(result.delivered).toBe(0);
    // No debe haber llamado a sendNotification
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  // R9: con VAPID, envía a las suscripciones de los usuarios
  it('R9: con VAPID activo, envía push a los usuarios con suscripción', async () => {
    // Simular que VAPID está configurado sobreescribiendo el módulo
    const { getVapidConfig } = await import('../src/lib/server/env');
    vi.spyOn(await import('../src/lib/server/push/webpush'), 'isPushEnabled').mockReturnValue(true);

    sendNotificationMock.mockResolvedValue({ statusCode: 201 });

    await insertTestSub(sql, adminId, SUB_EP + 'admin-r9');
    await sql`
      UPDATE app_user SET notify_push = true WHERE id = ${adminId}
    `;

    const result = await sendPushToUsers([adminId], 'aviso_briefing_completado', TEST_PAYLOAD);
    expect(result.attempted).toBeGreaterThanOrEqual(1);

    vi.restoreAllMocks();
  });

  // R10: opt-out notify_push = false → no recibe push
  it('R10: usuario con notify_push=false no recibe push', async () => {
    vi.spyOn(await import('../src/lib/server/push/webpush'), 'isPushEnabled').mockReturnValue(true);
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });

    await sql`UPDATE app_user SET notify_push = false WHERE id = ${techId}`;
    await insertTestSub(sql, techId, SUB_EP + 'tech-r10');

    const result = await sendPushToUsers([techId], 'aviso_informe_aprobado', TEST_PAYLOAD);
    expect(result.attempted).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();

    await sql`UPDATE app_user SET notify_push = true WHERE id = ${techId}`;
    vi.restoreAllMocks();
  });

  // R10: notify_push=true y notify_internal_email=false → sí recibe push
  it('R10: notify_push=true con email desactivado sigue recibiendo push', async () => {
    vi.spyOn(await import('../src/lib/server/push/webpush'), 'isPushEnabled').mockReturnValue(true);
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });

    await sql`UPDATE app_user SET notify_push = true, notify_internal_email = false WHERE id = ${adminId}`;
    await insertTestSub(sql, adminId, SUB_EP + 'admin-r10b');

    const result = await sendPushToUsers([adminId], 'aviso_auditoria_cerrada', TEST_PAYLOAD);
    expect(result.attempted).toBeGreaterThanOrEqual(1);

    await sql`UPDATE app_user SET notify_internal_email = true WHERE id = ${adminId}`;
    vi.restoreAllMocks();
  });

  // R11: endpoint 410 → elimina suscripción
  it('R11: endpoint 410 elimina la suscripción de push_subscription', async () => {
    vi.spyOn(await import('../src/lib/server/push/webpush'), 'isPushEnabled').mockReturnValue(true);

    const expiredEndpoint = SUB_EP + 'expired-410';
    await insertTestSub(sql, adminId, expiredEndpoint);
    await sql`UPDATE app_user SET notify_push = true WHERE id = ${adminId}`;

    const error410 = Object.assign(new Error('Gone'), { statusCode: 410 });
    sendNotificationMock.mockRejectedValue(error410);

    const result = await sendPushToUsers([adminId], 'aviso_feedback_cliente', TEST_PAYLOAD);
    expect(result.removed).toBeGreaterThanOrEqual(1);

    const rows = await sql<{ id: string }[]>`
      SELECT id FROM push_subscription WHERE endpoint = ${expiredEndpoint}
    `;
    expect(rows).toHaveLength(0);

    vi.restoreAllMocks();
  });

  // R11: error 500 no elimina la suscripción
  it('R11: error 500 NO elimina la suscripción (solo cuenta failed)', async () => {
    vi.spyOn(await import('../src/lib/server/push/webpush'), 'isPushEnabled').mockReturnValue(true);

    const endpoint500 = SUB_EP + 'server-error-500';
    await insertTestSub(sql, adminId, endpoint500);
    await sql`UPDATE app_user SET notify_push = true WHERE id = ${adminId}`;

    const error500 = Object.assign(new Error('Server Error'), { statusCode: 500 });
    sendNotificationMock.mockRejectedValue(error500);

    const result = await sendPushToUsers([adminId], 'aviso_auditoria_asignada', TEST_PAYLOAD);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.removed).toBe(0);

    const rows = await sql<{ id: string }[]>`
      SELECT id FROM push_subscription WHERE endpoint = ${endpoint500}
    `;
    expect(rows).toHaveLength(1);

    await sql`DELETE FROM push_subscription WHERE endpoint = ${endpoint500}`;
    vi.restoreAllMocks();
  });

  // R13: fallo de push no rompe la operación (sendPushToUsers nunca lanza)
  it('R13: sendPushToUsers nunca lanza aunque web-push falle completamente', async () => {
    vi.spyOn(await import('../src/lib/server/push/webpush'), 'isPushEnabled').mockReturnValue(true);
    sendNotificationMock.mockRejectedValue(new Error('Network failure'));

    await insertTestSub(sql, adminId, SUB_EP + 'r13-test');
    await sql`UPDATE app_user SET notify_push = true WHERE id = ${adminId}`;

    await expect(
      sendPushToUsers([adminId], 'aviso_auditoria_cerrada', TEST_PAYLOAD)
    ).resolves.not.toThrow();

    await sql`DELETE FROM push_subscription WHERE endpoint = ${SUB_EP + 'r13-test'}`;
    vi.restoreAllMocks();
  });

  // R9: usuario sin suscripción no genera intento
  it('R9: usuario sin suscripción no genera intento de envío', async () => {
    vi.spyOn(await import('../src/lib/server/push/webpush'), 'isPushEnabled').mockReturnValue(true);
    await sql`UPDATE app_user SET notify_push = true WHERE id = ${techId}`;

    const result = await sendPushToUsers([techId], 'aviso_informe_aprobado', TEST_PAYLOAD);
    expect(result.attempted).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
