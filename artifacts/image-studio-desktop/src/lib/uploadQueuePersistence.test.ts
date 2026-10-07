import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashFile, walkFolder } from '../../electron/file-operations.mjs';
import { restoreUploadQueue, resumeUploadItem, serializeUploadQueue } from './uploadQueuePersistence';
import type { UploadItem } from './uploadQueue';

describe('desktop interrupted upload after restart', () => {
  it('restores native file paths and hashes, pauses in-flight jobs and resumes them explicitly', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gallery-queue-fixture-'));
    try {
      const nested = path.join(root, 'Cerimonia', 'Ingresso');
      await mkdir(nested, { recursive: true });
      const bytes = Buffer.from([0, 255, 9, 8, 128]);
      const original = path.join(nested, 'original.jpg');
      await writeFile(original, bytes);
      await writeFile(path.join(root, 'notes.txt'), 'not a photo');
       await writeFile(path.join(root, 'scatto.tiff'), bytes);
       await writeFile(path.join(root, 'radice.jpg'), bytes);
      const selected = await walkFolder(root);
       expect(selected).toHaveLength(2);
       const nestedPhoto = selected.find(photo => photo.fileName === 'original.jpg')!;
       expect(nestedPhoto).toMatchObject({
        absolutePath: original,
        relativePath: path.join('Cerimonia', 'Ingresso', 'original.jpg'),
        chapterName: 'Cerimonia',
        size: bytes.length,
      });
       expect(selected.find(photo => photo.fileName === 'radice.jpg')?.chapterName).toBeNull();
       expect(selected.some(photo => photo.fileName === 'scatto.tiff')).toBe(false);
      const hash = await hashFile(original);
      expect(hash).toBe(createHash('sha256').update(bytes).digest('hex'));
      const inFlight: UploadItem = {
        id: 'one', galleryId: 'fixture-gallery', fileName: 'original.jpg',
         relativePath: nestedPhoto.relativePath, absolutePath: original,
         chapterName: nestedPhoto.chapterName!, size: bytes.length, hash,
        status: 'uploading', progress: 63, retries: 1,
      };
      const restored = restoreUploadQueue(serializeUploadQueue([inFlight]));
      // In-flight hashes describe compressed bytes that no longer exist after a
      // restart, so they are dropped and recomputed from the original on resume.
      expect(restored).toMatchObject([{ status: 'paused', hash: undefined, absolutePath: original, chapterName: 'Cerimonia' }]);
      expect(resumeUploadItem(restored, 'one')).toMatchObject([{ status: 'pending', absolutePath: original }]);
      expect(restoreUploadQueue(serializeUploadQueue([{ ...inFlight, status: 'success', uploadSize: 3 }]))[0]).toMatchObject({ hash, uploadSize: 3 });
      expect(restoreUploadQueue(serializeUploadQueue([{ ...inFlight, status: 'compressing' }]))[0].status).toBe('paused');
      expect(restoreUploadQueue(serializeUploadQueue([{ ...inFlight, status: 'hashing' }]))[0].status).toBe('paused');
      expect(restoreUploadQueue(serializeUploadQueue([{ ...inFlight, status: 'pending' }]))[0].status).toBe('paused');
      expect(restoreUploadQueue('invalid')).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});