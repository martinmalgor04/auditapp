import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('aws4fetch', () => {
  class MockAwsClient {
    async sign(
      url: string | URL,
      init?: { method?: string; aws?: { expires?: number; signQuery?: boolean } }
    ): Promise<Request> {
      const u = new URL(url.toString());
      u.searchParams.set('X-Amz-Signature', 'mock-signature');
      if (init?.aws?.expires) {
        u.searchParams.set('X-Amz-Expires', String(init.aws.expires));
      }
      return new Request(u.toString(), { method: init?.method ?? 'GET' });
    }
  }
  return { AwsClient: MockAwsClient };
});

import {
  buildR2Key,
  getR2Env,
  presignGet,
  presignPut,
  resetR2EnvForTests,
  sanitizeSectionCode
} from '../src/lib/server/storage';
import { applyTestR2Env, clearTestR2Env } from './fixtures/r2-mock';

const AUDIT_ID = '11111111-1111-1111-1111-111111111111';
const FIXED_UUID = '22222222-2222-2222-2222-222222222222';

describe('storage R2 module', () => {
  beforeEach(() => {
    applyTestR2Env();
  });

  afterEach(() => {
    clearTestR2Env();
  });

  it('exports storage module with presign helpers', async () => {
    const put = await presignPut({
      r2Key: `audits/${AUDIT_ID}/_general/${FIXED_UUID}`,
      contentType: 'image/jpeg'
    });
    expect(put.uploadUrl).toContain('X-Amz-Signature=mock-signature');
    expect(put.headers['Content-Type']).toBe('image/jpeg');
  });

  it('presignPut returns signed PUT URL', async () => {
    const key = buildR2Key({ auditId: AUDIT_ID, general: true, uuid: FIXED_UUID });
    const result = await presignPut({ r2Key: key, contentType: 'image/png' });

    expect(result.uploadUrl).toContain('auditapp-test');
    expect(result.uploadUrl).toContain(key);
    expect(result.uploadUrl).toContain('X-Amz-Signature');
    expect(result.r2Key).toBe(key);
  });

  it('presignGet returns signed GET URL for r2_key', async () => {
    const key = buildR2Key({ auditId: AUDIT_ID, sectionCode: 'A11', uuid: FIXED_UUID });
    const result = await presignGet({ r2Key: key });

    expect(result.downloadUrl).toContain(key);
    expect(result.downloadUrl).toContain('X-Amz-Signature');
    expect(result.downloadUrl).not.toMatch(/^https:\/\/[^?]+$/);
  });

  it('presignGet uses R2_PUBLIC_BASE_URL when configured', async () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://auditapp.example.com';
    resetR2EnvForTests();

    const key = buildR2Key({ auditId: AUDIT_ID, sectionCode: 'A1', uuid: FIXED_UUID });
    const result = await presignGet({ r2Key: key });

    expect(result.downloadUrl).toBe(`https://auditapp.example.com/${key}`);
    expect(result.downloadUrl).not.toContain('X-Amz-Signature');
  });

  it('respects R2_PRESIGN_TTL_SECONDS', async () => {
    applyTestR2Env('600');
    const key = buildR2Key({ auditId: AUDIT_ID, general: true, uuid: FIXED_UUID });
    const result = await presignPut({ r2Key: key, contentType: 'image/jpeg' });

    expect(result.uploadUrl).toContain('X-Amz-Expires=600');
    const ttlMs = result.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(590_000);
    expect(ttlMs).toBeLessThanOrEqual(600_000);
  });

  it('defaults TTL to 900 when env var absent', () => {
    delete process.env.R2_PRESIGN_TTL_SECONDS;
    resetR2EnvForTests();
    expect(getR2Env().R2_PRESIGN_TTL_SECONDS).toBe(900);
  });

  it('buildR2Key uses _general pattern without item', () => {
    const key = buildR2Key({ auditId: AUDIT_ID, general: true, uuid: FIXED_UUID });
    expect(key).toBe(`audits/${AUDIT_ID}/_general/${FIXED_UUID}`);
    expect(key).toMatch(/^audits\/[0-9a-f-]+\/_general\/[0-9a-f-]+$/);
  });

  it('buildR2Key uses section code for template items', () => {
    const key = buildR2Key({
      auditId: AUDIT_ID,
      sectionCode: 'A11',
      uuid: FIXED_UUID
    });
    expect(key).toBe(`audits/${AUDIT_ID}/A11/${FIXED_UUID}`);
  });

  it('sanitizeSectionCode rejects path traversal', () => {
    expect(() => sanitizeSectionCode('../etc')).toThrow();
  });

  it('throws clear error without R2 env vars', () => {
    clearTestR2Env();
    expect(() => getR2Env()).toThrow(/Configuración R2/);
  });
});
