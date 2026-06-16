import { logger } from '$lib/server/logger';

export type SttResult = {
  full_text: string;
  segments?: Array<{ start_ms: number; end_ms: number; text: string }>;
  provider: string;
  language: string;
};

export type SttAdapter = {
  transcribe(audioUrl: string, contentType: string): Promise<SttResult>;
  transcribeBuffer(buffer: ArrayBuffer, contentType: string, filename: string): Promise<SttResult>;
};

async function callWhisperApi(blob: Blob, filename: string): Promise<SttResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurado');

  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('model', 'whisper-1');
  formData.append('language', 'es');
  formData.append('response_format', 'verbose_json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    text: string;
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    full_text: data.text,
    provider: 'openai-whisper',
    language: data.language ?? 'es',
    segments: data.segments?.map((s) => ({
      start_ms: Math.round(s.start * 1000),
      end_ms: Math.round(s.end * 1000),
      text: s.text
    }))
  };
}

/** Descarga audio desde R2 presigned URL y lo envía a Whisper API. */
async function transcribeWithOpenAIWhisper(audioUrl: string, contentType: string): Promise<SttResult> {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`No se pudo descargar audio: HTTP ${audioRes.status}`);
  const blob = await audioRes.blob();
  const ext = contentType.split('/')[1] ?? 'webm';
  return callWhisperApi(blob, `audio.${ext}`);
}

/** Envía un ArrayBuffer directamente a Whisper sin pasar por R2. */
async function transcribeBufferWithOpenAIWhisper(
  buffer: ArrayBuffer,
  contentType: string,
  filename: string
): Promise<SttResult> {
  const blob = new Blob([buffer], { type: contentType });
  return callWhisperApi(blob, filename);
}

/** Mock adapter: solo para tests — retorna transcript fijo. */
export function createMockSttAdapter(overrideText?: string): SttAdapter {
  return {
    async transcribe(_audioUrl, _contentType) {
      return {
        full_text: overrideText ?? 'Mock transcript: el cliente usa Tango hace 5 años.',
        provider: 'mock',
        language: 'es'
      };
    },
    async transcribeBuffer(_buffer, _contentType, _filename) {
      return {
        full_text: overrideText ?? 'Mock transcript: el cliente usa Tango hace 5 años.',
        provider: 'mock',
        language: 'es'
      };
    }
  };
}

/** Retorna el adapter STT según configuración de entorno. */
export function getSttAdapter(): SttAdapter {
  const provider = process.env.REUNION_STT_PROVIDER ?? 'openai';

  if (provider === 'mock') {
    return createMockSttAdapter();
  }

  return {
    async transcribe(audioUrl: string, contentType: string): Promise<SttResult> {
      logger.info('stt_start', { provider: 'openai-whisper', contentType });
      const result = await transcribeWithOpenAIWhisper(audioUrl, contentType);
      logger.info('stt_done', { provider: 'openai-whisper', chars: result.full_text.length });
      return result;
    },
    async transcribeBuffer(buffer: ArrayBuffer, contentType: string, filename: string): Promise<SttResult> {
      logger.info('stt_start', { provider: 'openai-whisper', contentType, mode: 'buffer' });
      const result = await transcribeBufferWithOpenAIWhisper(buffer, contentType, filename);
      logger.info('stt_done', { provider: 'openai-whisper', chars: result.full_text.length });
      return result;
    }
  };
}
