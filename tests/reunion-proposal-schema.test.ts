import { describe, it, expect } from 'vitest';
import {
  reunionProposalSchema,
  reunionConsentSchema,
  reunionAudioPresignSchema
} from '../src/lib/server/reunion/schemas';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

describe('reunionProposalSchema', () => {
  it('acepta propuesta válida de tipo text', () => {
    const result = reunionProposalSchema.safeParse({
      item_id: VALID_UUID,
      proposed_value: 'Hola mundo',
      quote: 'El cliente dijo hola mundo',
      confidence: 0.9
    });
    expect(result.success).toBe(true);
  });

  it('acepta propuesta con tri=si', () => {
    const result = reunionProposalSchema.safeParse({
      item_id: VALID_UUID,
      proposed_value: 'si',
      quote: 'El cliente confirmó',
      confidence: 0.8
    });
    expect(result.success).toBe(true);
  });

  it('rechaza confidence fuera de rango', () => {
    const result = reunionProposalSchema.safeParse({
      item_id: VALID_UUID,
      proposed_value: 'algo',
      quote: 'cita',
      confidence: 1.5
    });
    expect(result.success).toBe(false);
  });

  it('rechaza quote vacía', () => {
    const result = reunionProposalSchema.safeParse({
      item_id: VALID_UUID,
      proposed_value: 'algo',
      quote: '',
      confidence: 0.8
    });
    expect(result.success).toBe(false);
  });

  it('acepta proposed_value booleano', () => {
    const result = reunionProposalSchema.safeParse({
      item_id: VALID_UUID,
      proposed_value: true,
      quote: 'El cliente dijo sí',
      confidence: 0.85
    });
    expect(result.success).toBe(true);
  });
});

describe('reunionConsentSchema', () => {
  it('acepta datos válidos de consentimiento', () => {
    const result = reunionConsentSchema.safeParse({
      session_type: 'kickoff',
      consent_recorded_at: new Date().toISOString()
    });
    expect(result.success).toBe(true);
  });

  it('acepta session_type visita', () => {
    const result = reunionConsentSchema.safeParse({
      session_type: 'visita',
      consent_recorded_at: new Date().toISOString()
    });
    expect(result.success).toBe(true);
  });

  it('rechaza session_type inválido', () => {
    const result = reunionConsentSchema.safeParse({
      session_type: 'invalido',
      consent_recorded_at: new Date().toISOString()
    });
    expect(result.success).toBe(false);
  });

  it('usa visita como default si no se especifica session_type', () => {
    const result = reunionConsentSchema.safeParse({
      consent_recorded_at: new Date().toISOString()
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.session_type).toBe('visita');
    }
  });

  it('acepta consent_note opcional', () => {
    const result = reunionConsentSchema.safeParse({
      session_type: 'visita',
      consent_recorded_at: new Date().toISOString(),
      consent_note: 'Cliente Juan García autorizó'
    });
    expect(result.success).toBe(true);
  });
});

describe('reunionAudioPresignSchema', () => {
  it('acepta audio/webm válido dentro del límite', () => {
    const result = reunionAudioPresignSchema.safeParse({
      filename: 'grabacion.webm',
      content_type: 'audio/webm',
      size_bytes: 1024 * 1024 // 1 MB
    });
    expect(result.success).toBe(true);
  });

  it('rechaza application/pdf', () => {
    const result = reunionAudioPresignSchema.safeParse({
      filename: 'doc.pdf',
      content_type: 'application/pdf',
      size_bytes: 1024
    });
    expect(result.success).toBe(false);
  });

  it('rechaza archivo > 100 MB', () => {
    const result = reunionAudioPresignSchema.safeParse({
      filename: 'grande.webm',
      content_type: 'audio/webm',
      size_bytes: 104_857_601 // 100MB + 1 byte
    });
    expect(result.success).toBe(false);
  });

  it('acepta audio/mp4', () => {
    const result = reunionAudioPresignSchema.safeParse({
      filename: 'grabacion.mp4',
      content_type: 'audio/mp4',
      size_bytes: 50 * 1024 * 1024
    });
    expect(result.success).toBe(true);
  });

  it('rechaza size_bytes = 0', () => {
    const result = reunionAudioPresignSchema.safeParse({
      filename: 'vacio.webm',
      content_type: 'audio/webm',
      size_bytes: 0
    });
    expect(result.success).toBe(false);
  });
});
