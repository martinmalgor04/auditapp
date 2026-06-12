/** Presigned GET para mostrar previews de adjuntos en el form técnico. */

export async function fetchAttachmentPreviewUrl(
  attachmentId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetchFn(`/api/attachments/${attachmentId}/presign-get`);
    const body = (await res.json().catch(() => null)) as {
      data?: { download_url?: string };
      error?: string;
    } | null;
    if (!res.ok) {
      return { ok: false, error: body?.error ?? 'No se pudo cargar la foto' };
    }
    const url = body?.data?.download_url;
    if (typeof url !== 'string' || !url) {
      return { ok: false, error: 'Respuesta de preview inválida' };
    }
    return { ok: true, url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red al cargar la foto'
    };
  }
}
