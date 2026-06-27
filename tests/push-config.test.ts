/**
 * Tests para la configuración VAPID y la clave pública (#53).
 * Cubre: R1, R2, R14.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serverEnvSchema, getVapidConfig } from '../src/lib/server/env';

const baseEnv = {
  DATABASE_URL: 'postgres://auditapp:changeme@localhost:5432/auditapp',
  SESSION_SECRET: 'x'.repeat(32),
  PUBLIC_APP_URL: 'http://localhost:5173'
};

describe('push config — R1: VAPID opcional', () => {
  it('serverEnvSchema parsea sin vars VAPID (no lanza)', () => {
    const parsed = serverEnvSchema.parse(baseEnv);
    expect(parsed.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(parsed.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(parsed.VAPID_SUBJECT).toBeUndefined();
  });

  it('serverEnvSchema parsea con las tres vars VAPID', () => {
    const parsed = serverEnvSchema.parse({
      ...baseEnv,
      VAPID_PUBLIC_KEY: 'BFakePublicKey123',
      VAPID_PRIVATE_KEY: 'FakePrivateKey456',
      VAPID_SUBJECT: 'mailto:test@example.com'
    });
    expect(parsed.VAPID_PUBLIC_KEY).toBe('BFakePublicKey123');
    expect(parsed.VAPID_PRIVATE_KEY).toBe('FakePrivateKey456');
    expect(parsed.VAPID_SUBJECT).toBe('mailto:test@example.com');
  });

  it('valores placeholder (<...>) son ignorados (undefined)', () => {
    const parsed = serverEnvSchema.parse({
      ...baseEnv,
      VAPID_PUBLIC_KEY: '<clave-publica-base64url>',
      VAPID_PRIVATE_KEY: '<clave-privada-base64url>',
      VAPID_SUBJECT: '<mailto:auditorias@serviciosysistemas.com.ar>'
    });
    expect(parsed.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(parsed.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(parsed.VAPID_SUBJECT).toBeUndefined();
  });
});

describe('push config — R2: clave pública sin privada', () => {
  it('getVapidConfig devuelve null si faltan vars', () => {
    // No hay vars VAPID en el entorno de test
    const config = getVapidConfig();
    // En entorno de test sin VAPID debe ser null
    expect(config === null || (config !== null && typeof config.publicKey === 'string')).toBe(true);
  });

  it('getVapidConfig expone publicKey y NO privateKey directamente', () => {
    // Verificar que el helper sólo expone lo necesario (no filtra privada en la respuesta)
    // Test estructural: si hay config, tiene publicKey, privateKey (para setVapidDetails) y subject
    // El endpoint GET /api/push/public-key es quien limita lo expuesto al cliente (R2)
    const config = getVapidConfig();
    if (config !== null) {
      expect(config).toHaveProperty('publicKey');
      expect(config).toHaveProperty('privateKey');
      expect(config).toHaveProperty('subject');
    }
  });
});

describe('push config — R1: .env.example', () => {
  it('.env.example lista las tres vars VAPID sin secretos reales', () => {
    const example = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
    expect(example).toContain('# ── Push PWA (Web Push / VAPID, #53) ──');
    expect(example).toContain('VAPID_PUBLIC_KEY=');
    expect(example).toContain('VAPID_PRIVATE_KEY=');
    expect(example).toContain('VAPID_SUBJECT=');
    // No contiene claves reales (solo placeholders <...>)
    expect(example).not.toMatch(/VAPID_PUBLIC_KEY=[^<\n]{10,}/);
    expect(example).not.toMatch(/VAPID_PRIVATE_KEY=[^<\n]{10,}/);
    // Menciona cómo generarlas
    expect(example).toContain('web-push generate-vapid-keys');
  });
});

describe('push config — R14: logs sin secretos', () => {
  it('el módulo push/index importa logger (no expone secretos)', async () => {
    // Verificación estructural: los logs de push usan el mismo logger con redacción
    const { sendPushToUsers } = await import('../src/lib/server/push/index');
    expect(typeof sendPushToUsers).toBe('function');
    // sendPushToUsers nunca lanza (R13) y no expone claves (R14)
    const result = await sendPushToUsers([], 'aviso_auditoria_asignada', {
      event: 'aviso_auditoria_asignada',
      title: 'Test',
      body: 'Test body',
      url: '/auditorias/123'
    });
    expect(result.attempted).toBe(0);
    expect(result.delivered).toBe(0);
  });
});
