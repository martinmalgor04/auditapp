export const IMAGE_MAX_SIDE_PX = 1600;
export const IMAGE_JPEG_QUALITY = 0.8;

export type PreparedImage = {
  blob: Blob;
  contentType: 'image/jpeg';
  sizeBytes: number;
  filename: string;
};

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  if (typeof window === 'undefined') {
    return file;
  }
  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: IMAGE_JPEG_QUALITY });
    const blob = Array.isArray(result) ? result[0] : result;
    return blob as Blob;
  } catch {
    return file;
  }
}

async function loadImageBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function getDimensions(source: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  if ('width' in source && 'height' in source) {
    return { w: source.width, h: source.height };
  }
  const img = source as HTMLImageElement;
  return { w: img.naturalWidth, h: img.naturalHeight };
}

export async function resizeToJpeg(blob: Blob, filename: string): Promise<PreparedImage> {
  const bitmap = await loadImageBitmap(blob);
  const { w, h } = getDimensions(bitmap);
  const maxSide = Math.max(w, h);
  const scale = maxSide > IMAGE_MAX_SIDE_PX ? IMAGE_MAX_SIDE_PX / maxSide : 1;
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas no disponible');
  }
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, tw, th);

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      IMAGE_JPEG_QUALITY
    );
  });

  const baseName = filename.replace(/\.[^.]+$/, '') || 'photo';
  return {
    blob: outBlob,
    contentType: 'image/jpeg',
    sizeBytes: outBlob.size,
    filename: `${baseName}.jpg`
  };
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  let blob: Blob = file;
  if (isHeic(file)) {
    blob = await heicToJpegBlob(file);
  }
  return resizeToJpeg(blob, file.name);
}

/** Node/test helper without canvas. */
export async function prepareImageForUploadNode(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<PreparedImage> {
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  return {
    blob,
    contentType: mimeType.startsWith('image/') && !mimeType.includes('heic') ? 'image/jpeg' : 'image/jpeg',
    sizeBytes: buffer.length,
    filename: filename.replace(/\.heic$/i, '.jpg')
  };
}
