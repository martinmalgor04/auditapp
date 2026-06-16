/**
 * Flujo cliente: POST del audio directamente al servidor (sin CORS con R2).
 * El servidor transcribe con Whisper y guarda solo el texto.
 */

export type UploadProgress = {
  phase: 'uploading' | 'done' | 'error';
  percent?: number;
  error?: string;
};

export type UploadOptions = {
  auditId: string;
  sessionId: string;
  blob: Blob;
  filename: string;
  contentType: 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/x-m4a' | 'audio/ogg';
  onProgress?: (progress: UploadProgress) => void;
};

export type UploadResult = {
  attachmentId: string;
  transcriptPreview?: string;
};

export async function uploadReunionAudio(opts: UploadOptions): Promise<UploadResult> {
  const { auditId, sessionId, blob, filename, contentType, onProgress } = opts;

  onProgress?.({ phase: 'uploading', percent: 0 });

  const res = await fetch(
    `/api/audits/${auditId}/reunion/sessions/${sessionId}/upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-Filename': filename
      },
      body: blob
    }
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = data.error?.message ?? `Error ${res.status}`;
    onProgress?.({ phase: 'error', error: msg });
    throw new Error(msg);
  }

  const data = (await res.json()) as { data: { attachment_id: string; transcript_preview?: string } };
  onProgress?.({ phase: 'done', percent: 100 });

  return {
    attachmentId: data.data.attachment_id,
    transcriptPreview: data.data.transcript_preview
  };
}
