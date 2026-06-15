/**
 * MediaRecorder wrapper para grabación de audio en el navegador.
 * Soporta fallback de MIME type para distintos browsers.
 */

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped';

export type RecorderResult = {
  blob: Blob;
  contentType: string;
  filename: string;
  durationMs: number;
};

/** MIME types soportados en orden de preferencia. */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg'
] as const;

/** Detecta el mejor MIME type disponible para MediaRecorder. */
export function detectBestMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'audio/webm';
}

/** Extrae la extensión apropiada del MIME type. */
export function extFromMimeType(mimeType: string): 'webm' | 'm4a' | 'mp3' {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  return 'webm';
}

/** Convierte MIME completo (con codecs) al content_type de la API. */
export function normalizeContentType(
  mimeType: string
): 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/x-m4a' {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'audio/mp4';
  if (mimeType.includes('mpeg')) return 'audio/mpeg';
  return 'audio/webm';
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private stream: MediaStream | null = null;
  state: RecorderState = 'idle';
  mimeType: string;

  constructor(mimeType?: string) {
    this.mimeType = mimeType ?? detectBestMimeType();
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Grabador ya en uso');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(1000); // chunk cada 1s
    this.startTime = Date.now();
    this.state = 'recording';
  }

  stop(): Promise<RecorderResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.state === 'idle') {
        reject(new Error('No hay grabación activa'));
        return;
      }

      const durationMs = Date.now() - this.startTime;

      this.mediaRecorder.onstop = () => {
        const contentType = normalizeContentType(this.mimeType);
        const ext = extFromMimeType(this.mimeType);
        const blob = new Blob(this.chunks, { type: this.mimeType });

        // Limpiar stream
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.state = 'stopped';

        resolve({
          blob,
          contentType,
          filename: `grabacion-reunion.${ext}`,
          durationMs
        });
      };

      this.mediaRecorder.stop();
    });
  }

  get durationMs(): number {
    if (this.state !== 'recording') return 0;
    return Date.now() - this.startTime;
  }
}
