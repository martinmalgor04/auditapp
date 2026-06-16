import type { SttAdapter, SttResult } from '../../src/lib/server/reunion/pipeline/stt';
import type { AnalyzedProposal } from '../../src/lib/server/reunion/pipeline/analyze';

/** Transcript fijo para tests de pipeline. */
export const MOCK_TRANSCRIPT_TEXT =
  'El cliente usa Tango hace 5 años. Tienen 50 empleados. Los backups se hacen cada noche.';

/** Crea un mock STT que devuelve transcript fijo. */
export function mockStt(overrideText?: string): SttAdapter {
  const result = (): Promise<SttResult> =>
    Promise.resolve({
      full_text: overrideText ?? MOCK_TRANSCRIPT_TEXT,
      provider: 'mock',
      language: 'es'
    });
  return {
    async transcribe(_audioUrl: string, _contentType: string): Promise<SttResult> {
      return result();
    },
    async transcribeBuffer(
      _buffer: ArrayBuffer,
      _contentType: string,
      _filename: string
    ): Promise<SttResult> {
      return result();
    }
  };
}

/** Mock STT que falla. */
export function mockSttError(message = 'STT mock error'): SttAdapter {
  return {
    async transcribe(_audioUrl: string, _contentType: string): Promise<SttResult> {
      throw new Error(message);
    },
    async transcribeBuffer(
      _buffer: ArrayBuffer,
      _contentType: string,
      _filename: string
    ): Promise<SttResult> {
      throw new Error(message);
    }
  };
}

/** Propuestas mock fijas para tests. */
export function mockExtract(itemId: string): AnalyzedProposal[] {
  return [
    {
      item_id: itemId,
      proposed_value: 'Mock valor extraído',
      quote: 'El cliente mencionó esto en la reunión',
      confidence: 0.9
    }
  ];
}
