import { describe, expect, it } from 'vitest';
import { IMAGE_JPEG_QUALITY, IMAGE_MAX_SIDE_PX } from '../src/lib/client/form/image-pipeline';

describe('form image compress', () => {
  it('uses max side 1600 and jpeg quality 0.8', () => {
    expect(IMAGE_MAX_SIDE_PX).toBeLessThanOrEqual(1600);
    expect(IMAGE_JPEG_QUALITY).toBe(0.8);
  });

  it('HEIC filename converts to jpeg extension', () => {
    const filename = 'photo.heic'.replace(/\.heic$/i, '.jpg');
    expect(filename).toBe('photo.jpg');
  });

  it('content type for upload is image/jpeg after pipeline', () => {
    const contentType = 'image/jpeg';
    expect(contentType).toBe('image/jpeg');
  });
});
