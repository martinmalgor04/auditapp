import { describe, expect, it, vi } from 'vitest';
import { deleteAttachmentFlow } from '../src/lib/client/form/attachment-delete';

describe('deleteAttachmentFlow', () => {
  it('llama DELETE con item_id y row_id opcional', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { ok: true }, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const result = await deleteAttachmentFlow({
      auditId: 'aud-1',
      itemId: 'item-1',
      attachmentId: 'att-1',
      rowId: 'row-1',
      fetchFn: fetchFn as unknown as typeof fetch
    });

    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/audits/aud-1/attachments/att-1',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ item_id: 'item-1', row_id: 'row-1' })
      })
    );
  });
});
