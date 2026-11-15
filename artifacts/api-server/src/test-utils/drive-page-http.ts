import { createHash } from 'node:crypto';
import type { DrivePageFile } from '../photobook-drive-copy.js';

/** An in-memory HTTP boundary, never imports credentials or cloud SDKs. */
export function makeDrivePageHttp(adapter: {
  inventory(folderId: string): Promise<DrivePageFile[]>;
  commit(folderId: string, metadata: any, bytes: Buffer): Promise<void>;
}) {
  let sequence = 0;
  const sessions = new Map<string, { metadata: any; bytes: Buffer; complete: boolean }>();
  const stats = { chunks: [] as number[], committed: [] as string[] };
  const request = async (path: string, options: RequestInit = {}) => {
    const url = new URL(path, 'https://isolated.invalid');
    if (url.pathname.endsWith('/generateIds')) return Response.json({ ids: [`reserved-${++sequence}`] });
    if (url.pathname === '/drive/v3/files') {
      const folder = url.searchParams.get('q')?.match(/^'([^']+)'/)?.[1] || '';
      return Response.json({ files: await adapter.inventory(folder) });
    }
    if (url.pathname === '/upload/drive/v3/files') {
      const metadata = JSON.parse(options.body as string);
      const folderFiles = await adapter.inventory(metadata.parents[0]);
      if (folderFiles.some(file => file.id === metadata.id)) return new Response('', { status: 409 });
      const location = `https://www.googleapis.com/upload/isolated/${++sequence}`;
      sessions.set(location, { metadata, bytes: Buffer.alloc(0), complete: false });
      return new Response('', { headers: { location } });
    }
    throw new Error(`Unmocked Drive request: ${url.pathname}`);
  };
  const sessionRequest = async (url: string, options: RequestInit) => {
    const session = sessions.get(url);
    if (!session) return new Response('', { status: 404 });
    const headers = new Headers(options.headers);
    const range = headers.get('content-range')!;
    if (range.startsWith('bytes */')) {
      return session.complete ? Response.json({ id: session.metadata.id }) : new Response('', {
        status: 308, headers: session.bytes.length ? { range: `bytes=0-${session.bytes.length - 1}` } : {},
      });
    }
    const match = range.match(/^bytes (\d+)-(\d+)\/(\d+)$/)!;
    const offset = Number(match[1]);
    if (offset !== session.bytes.length) throw new Error('Replay without status probe');
    const bytes = Buffer.from(options.body as Uint8Array);
    stats.chunks.push(bytes.length);
    session.bytes = Buffer.concat([session.bytes, bytes]);
    if (session.bytes.length === Number(match[3])) {
      // The flag is set before the hook, allowing simulated lost responses.
      session.complete = true;
      await adapter.commit(session.metadata.parents[0], session.metadata, session.bytes);
      stats.committed.push(session.metadata.name);
      return Response.json({ id: session.metadata.id });
    }
    return new Response('', { status: 308, headers: { range: `bytes=0-${session.bytes.length - 1}` } });
  };
  return { request, sessionRequest, stats };
}

export function drivePageMetadata(id: string, name: string, bytes: Buffer, appProperties?: Record<string, string>): DrivePageFile {
  return { id, name, size: String(bytes.length), md5Checksum: createHash('md5').update(bytes).digest('hex'), appProperties };
}
