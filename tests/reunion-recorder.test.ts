import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectBestMimeType,
  extFromMimeType,
  normalizeContentType
} from '../src/lib/client/reunion/recorder';

// Mock de MediaRecorder para entorno jsdom/node
class MockMediaRecorder {
  static supportedTypes = ['audio/webm;codecs=opus', 'audio/webm'];

  static isTypeSupported(type: string): boolean {
    return MockMediaRecorder.supportedTypes.includes(type);
  }

  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: { size: number } }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm';
  }

  start(_timeslice?: number) {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: { size: 100 } });
    this.onstop?.();
  }
}

beforeEach(() => {
  // @ts-expect-error – sobreescribir global para tests
  globalThis.MediaRecorder = MockMediaRecorder;
});

describe('detectBestMimeType', () => {
  it('elige audio/webm;codecs=opus cuando es soportado', () => {
    MockMediaRecorder.supportedTypes = ['audio/webm;codecs=opus', 'audio/webm'];
    const mime = detectBestMimeType();
    expect(mime).toBe('audio/webm;codecs=opus');
  });

  it('elige audio/webm cuando opus no es soportado', () => {
    MockMediaRecorder.supportedTypes = ['audio/webm'];
    const mime = detectBestMimeType();
    expect(mime).toBe('audio/webm');
  });

  it('devuelve audio/webm como fallback si ninguno es soportado', () => {
    MockMediaRecorder.supportedTypes = [];
    const mime = detectBestMimeType();
    expect(mime).toBe('audio/webm');
  });
});

describe('extFromMimeType', () => {
  it('retorna webm para audio/webm', () => {
    expect(extFromMimeType('audio/webm')).toBe('webm');
    expect(extFromMimeType('audio/webm;codecs=opus')).toBe('webm');
  });

  it('retorna m4a para audio/mp4', () => {
    expect(extFromMimeType('audio/mp4')).toBe('m4a');
  });

  it('retorna mp3 para audio/mpeg', () => {
    expect(extFromMimeType('audio/mpeg')).toBe('mp3');
  });
});

describe('normalizeContentType', () => {
  it('normaliza audio/webm;codecs=opus a audio/webm', () => {
    expect(normalizeContentType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeContentType('audio/webm')).toBe('audio/webm');
  });

  it('normaliza audio/mp4 correctamente', () => {
    expect(normalizeContentType('audio/mp4')).toBe('audio/mp4');
  });

  it('normaliza audio/mpeg correctamente', () => {
    expect(normalizeContentType('audio/mpeg')).toBe('audio/mpeg');
  });
});
