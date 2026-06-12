/**
 * Flujo de subida de foto (presign → PUT R2 → confirm) extraído de la página
 * para que sea testeable y para que NUNCA reconstruya filas desde un snapshot
 * viejo: el merge del attachment se hace sobre las filas VIVAS que pasa el
 * FieldRenderer en el momento del click.
 */

export type PhotoTableRow = {
  row_id: string;
  cells: Record<string, unknown>;
  attachment_ids: string[];
};

export type PreparedPhoto = {
  filename: string;
  contentType: string;
  sizeBytes: number;
  blob: Blob;
};

export type PhotoUploadResult =
  | { ok: true; attachmentId: string; mergedValue?: { rows: PhotoTableRow[] } }
  | { ok: false; error: string };

export async function uploadPhotoFlow(opts: {
  auditId: string;
  itemId: string;
  sectionCode: string;
  prepared: PreparedPhoto;
  rowId?: string;
  /** Filas vivas del field-table al momento de pedir la foto. Obligatorias si hay rowId. */
  currentRows?: PhotoTableRow[];
  fetchFn?: typeof fetch;
}): Promise<PhotoUploadResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const { auditId, itemId, sectionCode, prepared, rowId } = opts;

  try {
    const presignRes = await fetchFn(`/api/audits/${auditId}/attachments/presign-put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        section_code: sectionCode,
        filename: prepared.filename,
        content_type: prepared.contentType,
        size_bytes: prepared.sizeBytes,
        kind: 'photo'
      })
    });
    if (!presignRes.ok) {
      return { ok: false, error: await readError(presignRes, 'No se pudo iniciar la subida') };
    }
    const presignBody = await presignRes.json();
    const uploadUrl = presignBody.data.upload_url as string;
    const r2Key = presignBody.data.r2_key as string;

    const putRes = await fetchFn(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': prepared.contentType, ...(presignBody.data.headers ?? {}) },
      body: prepared.blob
    });
    if (!putRes.ok) {
      return { ok: false, error: `Falló la subida de la foto (HTTP ${putRes.status})` };
    }

    const confirmRes = await fetchFn(`/api/audits/${auditId}/attachments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        r2_key: r2Key,
        filename: prepared.filename,
        content_type: prepared.contentType,
        size_bytes: prepared.sizeBytes,
        kind: 'photo'
      })
    });
    if (!confirmRes.ok) {
      return { ok: false, error: await readError(confirmRes, 'No se pudo confirmar la foto') };
    }
    const confirmBody = await confirmRes.json();
    const attachmentId = confirmBody.data.attachment_id as string;

    if (!rowId) {
      return { ok: true, attachmentId };
    }

    const rows = opts.currentRows ?? [];
    const target = rows.find((r) => r.row_id === rowId);
    if (!target) {
      // Nunca guardar un value de tabla reconstruido sin la fila destino:
      // eso es exactamente el bug que pisaba el inventario.
      return { ok: false, error: 'La fila de la foto ya no existe; no se guardó para no pisar datos' };
    }

    const merged = rows.map((r) =>
      r.row_id === rowId
        ? { ...r, attachment_ids: [...(r.attachment_ids ?? []), attachmentId] }
        : r
    );
    return { ok: true, attachmentId, mergedValue: { rows: merged } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Error subiendo la foto: ${err.message}` : 'Error subiendo la foto'
    };
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* sin cuerpo JSON */
  }
  return `${fallback} (HTTP ${res.status})`;
}
