import { describe, it, expect } from 'vitest';
import {
  ensureDownloadToken,
  buildDownloadUrl,
  isSignedUrl,
} from './storage-download-url';

/** Fake bucket/file minimale per ensureDownloadToken. */
function makeFakeBucket(files: Record<string, { metadata?: Record<string, string> }>) {
  const setCalls: Array<{ path: string; metadata: any }> = [];
  const bucket = {
    name: 'test-bucket',
    file(path: string) {
      return {
        async exists() {
          return [path in files];
        },
        async getMetadata() {
          return [{ metadata: files[path]?.metadata }];
        },
        async setMetadata(meta: any) {
          setCalls.push({ path, metadata: meta.metadata });
          files[path] = { metadata: { ...(files[path]?.metadata || {}), ...meta.metadata } };
        },
      };
    },
  } as any;
  return { bucket, setCalls };
}

describe('isSignedUrl', () => {
  it('riconosce i signed URL con GoogleAccessId', () => {
    expect(
      isSignedUrl(
        'https://storage.googleapis.com/b/consultation-templates/x.jpg?GoogleAccessId=sa@x.iam.gserviceaccount.com&Signature=abc'
      )
    ).toBe(true);
  });

  it('ignora gli URL stabili con token', () => {
    expect(
      isSignedUrl(
        'https://firebasestorage.googleapis.com/v0/b/b/o/x.jpg?alt=media&token=uuid'
      )
    ).toBe(false);
    expect(isSignedUrl(undefined as any)).toBe(false);
  });
});

describe('ensureDownloadToken', () => {
  it('riusa il token esistente senza scrivere metadata', async () => {
    const { bucket, setCalls } = makeFakeBucket({
      'a/b.jpg': { metadata: { firebaseStorageDownloadTokens: 'tok-1,tok-2' } },
    });
    const token = await ensureDownloadToken(bucket, 'a/b.jpg');
    expect(token).toBe('tok-1');
    expect(setCalls).toHaveLength(0);
  });

  it('genera e salva un token nuovo se assente', async () => {
    const { bucket, setCalls } = makeFakeBucket({ 'a/b.jpg': {} });
    const token = await ensureDownloadToken(bucket, 'a/b.jpg');
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].metadata.firebaseStorageDownloadTokens).toBe(token);
  });

  it('ritorna null se l\'oggetto non esiste', async () => {
    const { bucket, setCalls } = makeFakeBucket({});
    expect(await ensureDownloadToken(bucket, 'manca.jpg')).toBeNull();
    expect(setCalls).toHaveLength(0);
  });
});

describe('buildDownloadUrl', () => {
  it('codifica il path e usa il formato firebasestorage', () => {
    expect(buildDownloadUrl('bkt', 'consultation-templates/id/f 1.jpg', 't')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/bkt/o/consultation-templates%2Fid%2Ff%201.jpg?alt=media&token=t'
    );
  });
});
