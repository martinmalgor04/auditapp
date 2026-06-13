/** Quita un adjunto confirmado (DB + respuesta del form). */

export async function deleteAttachmentFlow(opts: {
  auditId: string;
  itemId: string;
  attachmentId: string;
  rowId?: string;
  fetchFn?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const fetchFn = opts.fetchFn ?? fetch;

  try {
    const res = await fetchFn(
      `/api/audits/${opts.auditId}/attachments/${opts.attachmentId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: opts.itemId,
          ...(opts.rowId ? { row_id: opts.rowId } : {})
        })
      }
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? `No se pudo borrar la foto (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red al borrar la foto'
    };
  }
}
