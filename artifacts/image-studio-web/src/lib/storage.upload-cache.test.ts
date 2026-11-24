import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake Firebase Storage: records what would be uploaded, nothing leaves the test.
const h = vi.hoisted(() => ({ uploads: [] as Array<{ path: string; metadata: any }> }));
vi.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => ({ fullPath: path }),
  uploadBytes: async (reference: { fullPath: string }, _data: unknown, metadata?: unknown) => {
    h.uploads.push({ path: reference.fullPath, metadata });
    return { ref: reference };
  },
  getDownloadURL: async (reference: { fullPath: string }) => `https://files.example.test/${reference.fullPath}`,
  deleteObject: vi.fn(),
  listAll: vi.fn(),
  getMetadata: vi.fn(),
}));
vi.mock('./firebase', () => ({ storage: {} }));
vi.mock('./imageCompression', () => ({ compressImage: async (file: File) => file }));
import { IMMUTABLE_UPLOAD_CACHE, StorageService } from './storage';

beforeEach(() => { h.uploads.length = 0; });

describe('StorageService.uploadFile cache headers', () => {
  it('uploads images with a one-year private cache, since every path is unique', async () => {
    const photo = new File([new Uint8Array([255, 216, 255])], 'scatto.jpg', { type: 'image/jpeg' });

    await StorageService.uploadGalleryPhotos([photo], 'gallery-1');

    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0].path).toMatch(/^galleries\/gallery-1\/photos\/\d+-scatto\.jpg$/);
    expect(h.uploads[0].metadata).toEqual({ cacheControl: IMMUTABLE_UPLOAD_CACHE });
    expect(IMMUTABLE_UPLOAD_CACHE).toBe('private, max-age=31536000, immutable');
  });

  it('leaves other files on the default cache', async () => {
    const pdf = new File(['%PDF'], 'contratto.pdf', { type: 'application/pdf' });

    await StorageService.uploadFile(pdf, 'documents');

    expect(h.uploads[0].metadata).toBeUndefined();
  });
});
