import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { makeDrivePageHttp, drivePageMetadata } from './test-utils/drive-page-http.js';
const mock = vi.hoisted(() => ({ request: null as any, session: null as any }));
vi.mock('./drive-request.js', async importOriginal => ({
  ...await importOriginal<typeof import('./drive-request.js')>(),
  boundedDriveRequest: (...args: any[]) => mock.request(...args),
  driveSessionRequest: (...args: any[]) => mock.session(...args),
}));
import { copyPhotobookPage } from './photobook-drive-copy.js';

describe('Ripresa resumable con stato remoto incerto', () => {
  for (const fault of ['timeout', 'rate-limit'] as const) {
    it(`riprende dal byte confermato dopo ${fault}, senza ripetere il chunk già accettato`, async () => {
      const bytes = Buffer.alloc(9 * 1024 * 1024, 0x1d);
      const files = new Map<string, any>();
      const http = makeDrivePageHttp({
        inventory: async () => [...files.values()],
        commit: async (_folder, metadata, body) => {
          expect(body.equals(bytes)).toBe(true);
          files.set(metadata.id, drivePageMetadata(metadata.id, metadata.name, body, metadata.appProperties));
        },
      });
      let faultInjected = false;
      let probes = 0;
      mock.request = http.request;
      mock.session = async (url: string, options: RequestInit) => {
        const isProbe = new Headers(options.headers).get('content-range')?.startsWith('bytes */');
        if (isProbe) probes++;
        const result = await http.sessionRequest(url, options);
        if (!faultInjected && !isProbe) {
          faultInjected = true;
          if (fault === 'timeout') throw new TypeError('timeout after accepting chunk');
          return new Response(JSON.stringify({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }), { status: 403 });
        }
        return result;
      };
      await copyPhotobookPage({
        folderId: 'folder', page: { id: 'large', pageNumber: 1, storagePath: 'large.jpg' },
        source: {
          getMetadata: async () => [{ size: String(bytes.length), md5Hash: createHash('md5').update(bytes).digest('base64') }],
          createReadStream: () => Readable.from(bytes),
        },
        reserve: async () => {}, assertActive: async () => {},
      });
      expect(probes).toBe(1);
      expect(http.stats.chunks).toEqual([8 * 1024 * 1024, 1024 * 1024]);
      expect(files.size).toBe(1);
    });
  }
  it('limita i tentativi anche quando Drive non conferma alcun avanzamento', async () => {
    mock.request = async (path: string) => path.includes('generateIds')
      ? Response.json({ ids: ['reserved'] })
      : path.startsWith('/upload/')
        ? new Response('', { headers: { location: 'https://www.googleapis.com/upload/session' } })
        : Response.json({ files: [] });
    const session = vi.fn(async () => new Response('', { status: 308 }));
    mock.session = session;
    const bytes = Buffer.from('page');
    await expect(copyPhotobookPage({
      folderId: 'folder', page: { id: 'p1', pageNumber: 1, storagePath: 'p1.jpg' },
      source: {
        getMetadata: async () => [{ size: String(bytes.length), md5Hash: createHash('md5').update(bytes).digest('base64') }],
        createReadStream: () => Readable.from(bytes),
      },
      reserve: async () => {}, assertActive: async () => {},
    })).rejects.toThrow('senza avanzamento');
    expect(session).toHaveBeenCalledTimes(5);
  });
});
