import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake bucket: no connection to Firebase credentials or real files.
const h = vi.hoisted(() => ({
  saved: new Map<string, { bytes: Buffer; metadata: any }>(),
  failSave: false,
}));
vi.mock('./firebase-admin.js', () => ({
  db: {},
  storage: {
    bucket: () => ({
      name: 'fixture-bucket',
      file: (path: string) => ({
        save: async (bytes: Buffer, options: any) => {
          if (h.failSave) throw new Error('storage unavailable');
          h.saved.set(path, { bytes, metadata: options.metadata });
        },
      }),
    }),
  },
}));
import { PHOTO_CACHE_CONTROL, createPhotoVersions, renderPhotoVersions } from './thumbnails.js';

/** Camera-like JPEG: 2400x1600 pixels stored sideways (EXIF orientation 6 = rotate 90°). */
const sidewaysJpeg = () => sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#6b7f6b' } })
  .jpeg().withMetadata({ orientation: 6 }).toBuffer();

beforeEach(() => {
  h.saved.clear();
  h.failSave = false;
});

describe('renderPhotoVersions', () => {
  it('makes a 400 px JPEG thumbnail and 800/1600 px WebP versions, upright', async () => {
    const versions = await renderPhotoVersions(await sidewaysJpeg());

    expect({ width: versions.width, height: versions.height }).toEqual({ width: 1600, height: 2400 });
    const thumb = await sharp(versions.thumb).metadata();
    const retina = await sharp(versions.w800).metadata();
    const display = await sharp(versions.w1600).metadata();
    expect([thumb.format, thumb.width, thumb.height]).toEqual(['jpeg', 267, 400]);
    expect([retina.format, retina.width, retina.height]).toEqual(['webp', 533, 800]);
    expect([display.format, display.width, display.height]).toEqual(['webp', 1067, 1600]);
  });

  it('never enlarges a small photo', async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const versions = await renderPhotoVersions(small);
    expect((await sharp(versions.w1600).metadata()).width).toBe(300);
    expect([versions.width, versions.height]).toEqual([300, 200]);
  });

  it('rejects bytes that are not an image', async () => {
    await expect(renderPhotoVersions(Buffer.from([255, 216, 255, 1, 2, 3]))).rejects.toThrow();
  });
});

describe('createPhotoVersions', () => {
  it('saves the three files with a long private cache and writes their URLs on the photo', async () => {
    const update = vi.fn(async () => undefined);
    const fields = await createPhotoVersions('gallery-1', { id: 'photo-9', update } as any, await sidewaysJpeg());

    expect(fields).not.toBeNull();
    expect([...h.saved.keys()].sort()).toEqual([
      'thumbnails/gallery-1/photo-9-1600.webp',
      'thumbnails/gallery-1/photo-9-800.webp',
      'thumbnails/gallery-1/photo-9.jpg',
    ]);
    for (const { metadata } of h.saved.values()) {
      expect(metadata.cacheControl).toBe(PHOTO_CACHE_CONTROL);
      expect(metadata.metadata.firebaseStorageDownloadTokens).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(h.saved.get('thumbnails/gallery-1/photo-9-800.webp')!.metadata.contentType).toBe('image/webp');
    expect(h.saved.get('thumbnails/gallery-1/photo-9.jpg')!.metadata.contentType).toBe('image/jpeg');
    expect(PHOTO_CACHE_CONTROL).toBe('private, max-age=31536000, immutable');

    expect(update).toHaveBeenCalledWith(fields);
    const token = h.saved.get('thumbnails/gallery-1/photo-9.jpg')!.metadata.metadata.firebaseStorageDownloadTokens;
    expect(fields).toEqual({
      thumbnailUrl: `https://firebasestorage.googleapis.com/v0/b/fixture-bucket/o/thumbnails%2Fgallery-1%2Fphoto-9.jpg?alt=media&token=${token}`,
      variants: {
        w800: `https://firebasestorage.googleapis.com/v0/b/fixture-bucket/o/thumbnails%2Fgallery-1%2Fphoto-9-800.webp?alt=media&token=${token}`,
        w1600: `https://firebasestorage.googleapis.com/v0/b/fixture-bucket/o/thumbnails%2Fgallery-1%2Fphoto-9-1600.webp?alt=media&token=${token}`,
      },
      width: 1600,
      height: 2400,
    });
  });

  it('returns null without touching the photo when the image cannot be read or saved', async () => {
    const update = vi.fn(async () => undefined);
    expect(await createPhotoVersions('gallery-1', { id: 'bad', update } as any, Buffer.from('not an image'))).toBeNull();
    h.failSave = true;
    expect(await createPhotoVersions('gallery-1', { id: 'photo-9', update } as any, await sidewaysJpeg())).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
