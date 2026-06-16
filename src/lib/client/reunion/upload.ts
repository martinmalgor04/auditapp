/**
 * Flujo cliente: presign → PUT a R2 → confirm.
 */

export type UploadProgress = {
  phase: 'presigning' | 'uploading' | 'confirming' | 'done' | 'error';
  percent?: number;
  error?: string;
};

export type UploadOptions = {
  auditId: string;
  sessionId: string;
  blob: Blob;
  filename: string;
  contentType: 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/x-m4a';
  onProgress?: (progress: UploadProgress) => void;
};

export type UploadResult = {
  attachmentId: string;
};

/** Ejecuta el flujo completo presign → PUT → confirm para audio de reunión. */
export async function uploadReunionAudio(opts: UploadOptions): Promise<UploadResult> {
  const { auditId, sessionId, blob, filename, contentType, onProgress } = opts;

  const notify = (p: UploadProgress) => onProgress?.(p);

  // 1. Presign
  notify({ phase: 'presigning' });

  const presignRes = await fetch(
    `/api/audits/${auditId}/reunion/sessions/${sessionId}/presign-put`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        content_type: contentType,
        size_bytes: blob.size
      })
    }
  );

  if (!presignRes.ok) {
    const data = (await presignRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Presign error ${presignRes.status}`);
  }

  const presignData = (await presignRes.json()) as {
    data: { upload_url: string; r2_key: string; headers: Record<string, string> };
  };
  const { upload_url, r2_key, headers } = presignData.data;

  // 2. PUT a R2
  notify({ phase: 'uploading', percent: 0 });

  // No incluir Content-Type en el PUT: la URL ya está firmada con signQuery=true
  // y mandar headers extra dispara un preflight CORS que R2 no responde en Safari.
  const putRes = await fetch(upload_url, {
    method: 'PUT',
    body: blob
  });

  if (!putRes.ok) {
    throw new Error(`Upload a R2 falló: HTTP ${putRes.status}`);
  }

  notify({ phase: 'uploading', percent: 100 });

  // 3. Confirm
  notify({ phase: 'confirming' });

  const confirmRes = await fetch(
    `/api/audits/${auditId}/reunion/sessions/${sessionId}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        r2_key,
        filename,
        content_type: contentType,
        size_bytes: blob.size
      })
    }
  );

  if (!confirmRes.ok) {
    const data = (await confirmRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Confirm error ${confirmRes.status}`);
  }

  const confirmData = (await confirmRes.json()) as { data: { attachment_id: string } };
  notify({ phase: 'done' });

  return { attachmentId: confirmData.data.attachment_id };
}
