import { describe, expect, it, vi } from 'vitest';
import { uploadPhotoFlow, type PhotoTableRow } from '../src/lib/client/form/photo-upload';

const prepared = {
  filename: 'foto.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1024,
  blob: new Blob(['x'])
};

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as unknown as Response;
}

function happyFetch(attachmentId = 'a1a1a1a1-0000-4000-8000-000000000001') {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('presign-put')) {
      return jsonRes({ data: { upload_url: 'https://r2.example/put', r2_key: 'k', headers: {} } });
    }
    if (u.includes('r2.example')) {
      return jsonRes({}, true, 200);
    }
    return jsonRes({ data: { attachment_id: attachmentId } });
  });
}

const liveRows: PhotoTableRow[] = [
  { row_id: 'row-1', cells: { tipo: 'PC' }, attachment_ids: [] },
  { row_id: 'row-2', cells: { tipo: 'NB' }, attachment_ids: ['old-att'] }
];

describe('uploadPhotoFlow (hotfix data loss)', () => {
  it('mergea el attachment sobre las filas VIVAS, no sobre snapshot viejo', async () => {
    const fetchFn = happyFetch();
    const res = await uploadPhotoFlow({
      auditId: 'aud-1',
      itemId: 'item-1',
      sectionCode: 'S1',
      prepared,
      rowId: 'row-1',
      currentRows: liveRows,
      fetchFn: fetchFn as unknown as typeof fetch
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mergedValue?.rows).toHaveLength(2);
    expect(res.mergedValue?.rows[0].attachment_ids).toContain(res.attachmentId);
    expect(res.mergedValue?.rows[1].attachment_ids).toEqual(['old-att']);
  });

  it('una foto NO puede reducir/vaciar filas: si la fila no está en las vivas, no devuelve value para guardar', async () => {
    const fetchFn = happyFetch();
    const res = await uploadPhotoFlow({
      auditId: 'aud-1',
      itemId: 'item-1',
      sectionCode: 'S1',
      prepared,
      rowId: 'row-borrada',
      currentRows: [],
      fetchFn: fetchFn as unknown as typeof fetch
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/no se guardó/i);
  });

  it('PUT a R2 fallido: no llama a confirm y devuelve error', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('presign-put')) {
        return jsonRes({ data: { upload_url: 'https://r2.example/put', r2_key: 'k' } });
      }
      if (u.includes('r2.example')) {
        return jsonRes({}, false, 403);
      }
      throw new Error('confirm no debería llamarse');
    });
    const res = await uploadPhotoFlow({
      auditId: 'aud-1',
      itemId: 'item-1',
      sectionCode: 'S1',
      prepared,
      fetchFn: fetchFn as unknown as typeof fetch
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/403/);
    const confirmCalls = fetchFn.mock.calls.filter(([u]) => String(u).includes('confirm'));
    expect(confirmCalls).toHaveLength(0);
  });

  it('presign fallido devuelve error con mensaje del envelope', async () => {
    const fetchFn = vi.fn(async () => jsonRes({ error: 'Auditoría no editable' }, false, 409));
    const res = await uploadPhotoFlow({
      auditId: 'aud-1',
      itemId: 'item-1',
      sectionCode: 'S1',
      prepared,
      fetchFn: fetchFn as unknown as typeof fetch
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('Auditoría no editable');
  });

  it('excepción de red no se traga: devuelve error', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    const res = await uploadPhotoFlow({
      auditId: 'aud-1',
      itemId: 'item-1',
      sectionCode: 'S1',
      prepared,
      fetchFn: fetchFn as unknown as typeof fetch
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/network down/);
  });
});
