import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, serializeError } from '../src/lib/server/logger';

describe('server logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits JSON with level and message', () => {
    logger.info('startup_ok', { port: 3033 });
    const line = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as { level: string; msg: string; port: number };
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('startup_ok');
    expect(parsed.port).toBe(3033);
  });

  it('redacts sensitive fields', () => {
    logger.warn('auth_failed', { password: 'secret', email: 'a@b.com' });
    const line = vi.mocked(console.warn).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as { password: string; email: string };
    expect(parsed.password).toBe('[redacted]');
    expect(parsed.email).toBe('a@b.com');
  });

  it('respects LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'error';
    logger.info('hidden');
    logger.error('visible');
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('serializes Error with stack', () => {
    const err = new Error('boom');
    expect(serializeError(err)).toMatchObject({
      name: 'Error',
      message: 'boom'
    });
    expect(serializeError(err).stack).toContain('boom');
  });
});
