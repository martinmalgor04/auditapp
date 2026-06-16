import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { getSttAdapter } from '../src/lib/server/reunion/pipeline/stt';

// R1 — el STT sigue en OpenAI Whisper (whisper-1); la feature #24 no toca stt.ts salvo comentarios.
describe('STT intacto — OpenAI Whisper (R1)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-openai-test';
    delete process.env.REUNION_STT_PROVIDER;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.OPENAI_API_KEY;
  });

  it('transcribe llama a la API de Whisper de OpenAI (whisper-1) y reporta provider openai-whisper', async () => {
    let capturedUrl = '';
    let capturedModel: FormDataEntryValue | null = null;
    let capturedAuth = '';

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('audio.example.com')) {
        // descarga del audio presigned
        return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), {
          status: 200
        });
      }
      capturedUrl = url;
      capturedAuth = (init.headers as Record<string, string>).Authorization;
      capturedModel = (init.body as FormData).get('model');
      return new Response(
        JSON.stringify({ text: 'transcripción de prueba', language: 'es', segments: [] }),
        { status: 200 }
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const adapter = getSttAdapter();
    const result = await adapter.transcribe('https://audio.example.com/x.webm', 'audio/webm');

    expect(capturedUrl).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(capturedModel).toBe('whisper-1');
    expect(capturedAuth).toBe('Bearer sk-openai-test');
    expect(result.provider).toBe('openai-whisper');
    expect(capturedUrl).not.toContain('anthropic');
  });

  it('provider=mock devuelve el adapter mock (sin red)', async () => {
    process.env.REUNION_STT_PROVIDER = 'mock';
    const adapter = getSttAdapter();
    const result = await adapter.transcribe('ignored', 'audio/webm');
    expect(result.provider).toBe('mock');
  });
});
