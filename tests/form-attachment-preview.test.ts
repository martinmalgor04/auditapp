import { describe, expect, it, vi } from 'vitest';
import { fetchAttachmentPreviewUrl } from '../src/lib/client/form/attachment-preview';

describe('fetchAttachmentPreviewUrl', () => {
  it('devuelve la URL presignada', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { download_url: 'https://r2.example/photo.jpg' } })
    })) as unknown as typeof fetch;

    const res = await fetchAttachmentPreviewUrl('att-1', fetchFn);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.url).toBe('https://r2.example/photo.jpg');
  });

  it('propaga error del API', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Adjunto no encontrado' })
    })) as unknown as typeof fetch;

    const res = await fetchAttachmentPreviewUrl('att-1', fetchFn);
    expect(res).toEqual({ ok: false, error: 'Adjunto no encontrado' });
  });
});
