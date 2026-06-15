import { logger } from '$lib/server/logger';

export type SttResult = {
  full_text: string;
  segments?: Array<{ start_ms: number; end_ms: number; text: string }>;
  provider: string;
  language: string;
};

export type SttAdapter = {
  transcribe(audioUrl: string, contentType: string): Promise<SttResult>;
};

/** Descarga audio desde R2 presigned URL y lo envía a Whisper API. */
async function transcribeWithOpenAIWhisper(
  audioUrl: string,
  contentType: string
): Promise<SttResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no configurado');
  }

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`No se pudo descargar audio: HTTP ${audioRes.status}`);
  }
  const audioBlob = await audioRes.blob();

  const formData = new FormData();
  formData.append('file', audioBlob, `audio.${contentType.split('/')[1] ?? 'webm'}`);
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

/** Mock adapter: solo para tests — retorna transcript fijo. */
export function createMockSttAdapter(overrideText?: string): SttAdapter {
  return {
    async transcribe(_audioUrl, _contentType) {
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
    }
  };
}
