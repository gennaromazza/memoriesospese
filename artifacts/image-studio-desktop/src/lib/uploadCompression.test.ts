import { beforeEach, describe, expect, it, vi } from 'vitest';
import imageCompression from 'browser-image-compression';
import { compressGalleryUpload, sha256File } from './uploadCompression';

vi.mock('browser-image-compression', () => ({ default: vi.fn() }));

const compressMock = vi.mocked(imageCompression);

describe('desktop gallery upload compression', () => {
  beforeEach(() => compressMock.mockReset());

  it('uses the same JPEG compression settings as the web gallery uploader', async () => {
    const source = new File(['original image bytes'], 'portrait.png', {
      type: 'image/png',
      lastModified: 123,
    });
    const output = new File(['compressed jpeg'], 'portrait.png', { type: 'image/jpeg' });
    compressMock.mockResolvedValueOnce(output);

    const result = await compressGalleryUpload(source);

    expect(compressMock).toHaveBeenCalledWith(source, {
      maxSizeMB: 2,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg',
      signal: undefined,
    });
    expect(result.file.name).toBe(source.name);
    expect(result.file.type).toBe('image/jpeg');
    expect(result.file.size).toBe(output.size);
    expect(result.sourceSize).toBe(source.size);
    expect(result.compressed).toBe(true);
    expect(source.type).toBe('image/png');
    expect(source.size).toBe(new Blob(['original image bytes']).size);
  });

  it('keeps the original file and returns a visible warning if compression fails', async () => {
    const source = new File(['original image bytes'], 'portrait.heic', { type: 'image/heic' });
    compressMock.mockRejectedValueOnce(new Error('Decoder unavailable'));

    const result = await compressGalleryUpload(source);

    expect(result.file).toBe(source);
    expect(result.sourceSize).toBe(source.size);
    expect(result.compressed).toBe(false);
    expect(result.warning).toContain('file originale');
  });

  it('propagates a pause/cancel instead of falling back to the original', async () => {
    const source = new File(['bytes'], 'portrait.jpg', { type: 'image/jpeg' });
    const controller = new AbortController();
    compressMock.mockImplementationOnce(async () => { controller.abort(); throw new Error('aborted'); });
    await expect(compressGalleryUpload(source, controller.signal)).rejects.toThrow('aborted');
  });

  it('hashes the exact bytes that will be uploaded', async () => {
    const file = new File(['compressed bytes'], 'portrait.jpg', { type: 'image/jpeg' });
    const hash = await sha256File(file);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});