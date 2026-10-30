import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { makeDrivePageHttp, drivePageMetadata } from './test-utils/drive-page-http.js';

const state = vi.hoisted(() => ({
  request: null as any, session: null as any,
}));
vi.mock('./drive-request.js', async importOriginal => ({
  ...await importOriginal<typeof import('./drive-request.js')>(),
  boundedDriveRequest: (...args: any[]) => state.request(...args),
  driveSessionRequest: (...args: any[]) => state.session(...args),
}));
import { copyPhotobookPage, verifyPhotobookDrivePages, matchDrivePage, listPhotobookDriveFiles, type DrivePageFile } from './photobook-drive-copy.js';
import { orderPhotobookPages, photobookPageFileName } from './photobook-page-order.js';

const remote = new Map<string, { metadata: DrivePageFile; bytes: Buffer }>();
const objects = new Map<string, Buffer>();
const reservations = new Map<string, string>();
const originals = Array.from({ length: 12 }, (_, index) => ({
  id: `p${index + 1}`, pageNumber: index + 1,
  storagePath: `uploads/${['zeta', '001', 'alfa'][index % 3]}-${12 - index}.jpg`,
}));
const bucket = {
  file: (path: string) => ({
    getMetadata: async () => {
      const bytes = objects.get(path)!;
      return [{ size: String(bytes.length), md5Hash: createHash('md5').update(bytes).digest('base64'), contentType: 'image/jpeg' }];
    },
    createReadStream: () => Readable.from(objects.get(path)!),
  }),
};
let http: ReturnType<typeof makeDrivePageHttp>;
let beforeCommit: (metadata: any, bytes: Buffer) => Promise<void>;
let afterCommit: (metadata: any) => Promise<void>;
async function copy(page = originals[0], assertActive = async () => {}) {
  return copyPhotobookPage({
    page, folderId: 'folder', source: bucket.file(page.storagePath),
    reservedId: reservations.get(page.id), assertActive,
    reserve: async id => { reservations.set(page.id, id); },
  });
}
beforeEach(() => {
  remote.clear(); objects.clear(); reservations.clear();
  for (const page of originals) objects.set(page.storagePath, Buffer.from(`ORIGINAL-JPEG-${page.id}\0binary\xff`));
  beforeCommit = async () => {};
  afterCommit = async () => {};
  http = makeDrivePageHttp({
    inventory: async () => [...remote.values()].map(file => file.metadata),
    commit: async (_folder, metadata, bytes) => {
      await beforeCommit(metadata, bytes);
      remote.set(metadata.id, { metadata: drivePageMetadata(metadata.id, metadata.name, bytes, metadata.appProperties), bytes: Buffer.from(bytes) });
      await afterCommit(metadata);
    },
  });
  state.request = http.request;
  state.session = http.sessionRequest;
});

describe('Originali fotolibro: copie e riconciliazione Drive senza servizi reali', () => {
  it('trasferisce 12 pagine con nomi originali disordinati e retry fuori sequenza mantenendo bytes e ordine numerico', async () => {
    const failed = new Set(['pagina-003-p3.jpg', 'pagina-008-p8.jpg']);
    beforeCommit = async metadata => { if (failed.has(metadata.name)) throw new Error('temporary failure'); };
    // HTTP failure test is separate; avoid waiting real retry backoff here.
    state.session = async (...args: Parameters<typeof http.sessionRequest>) => {
      const result = http.sessionRequest(...args);
      return result.catch(() => new Response('', { status: 400 }));
    };
    for (const page of [...originals].reverse()) {
      if (failed.has(photobookPageFileName(page))) await expect(copy(page)).rejects.toThrow();
      else await copy(page);
    }
    failed.clear();
    for (const page of originals) await copy(page);
    const verified = await verifyPhotobookDrivePages('folder', originals, bucket);
    expect(verified.map(file => file.name)).toEqual(originals.map(photobookPageFileName));
    expect([...remote.values()].map(file => file.metadata.name).sort()).toEqual(verified.map(file => file.name));
    expect(remote.size).toBe(12);
    for (const page of originals) {
      const actual = [...remote.values()].find(file => file.metadata.name === photobookPageFileName(page))!;
      expect(actual.bytes).toEqual(objects.get(page.storagePath));
    }
  });

  it('adotta un commit riuscito anche quando si perde la risposta finale', async () => {
    afterCommit = async () => { throw new TypeError('network timeout after commit'); };
    const result = await copy();
    expect(result.file.id).toBe(reservations.get(originals[0].id));
    expect(remote.size).toBe(1);
    expect((await copy()).skipped).toBe(true);
    expect(remote.size).toBe(1);
  });

  it('recupera il commit prima della persistenza Firestore senza generare un secondo file', async () => {
    await copy();
    reservations.clear(); // Simulated crash before registering files[].
    const calls = vi.fn(state.request);
    state.request = calls;
    expect((await copy()).skipped).toBe(true);
    expect(calls.mock.calls.every(([path]) => !String(path).includes('generateIds'))).toBe(true);
    expect(remote.size).toBe(1);
  });

  it('rileva un file mancante e lo ripristina, non si fida della registrazione precedente', async () => {
    await copy();
    remote.clear();
    await expect(verifyPhotobookDrivePages('folder', [originals[0]], bucket)).rejects.toThrow('mancante');
    await copy();
    expect(remote.size).toBe(1);
  });

  it('riserva una nuova identità soltanto dopo aver verificato che la precedente sia stata eliminata', async () => {
    await copy();
    const oldId = reservations.get(originals[0].id);
    remote.clear();
    let firstInit = true;
    state.request = async (path: string, options?: RequestInit) => {
      if (path.startsWith('/upload/') && firstInit) {
        firstInit = false;
        return new Response('', { status: 409 });
      }
      if (path.startsWith(`/drive/v3/files/${oldId}?`)) return new Response('', { status: 404 });
      return http.request(path, options);
    };
    await copy();
    expect(reservations.get(originals[0].id)).not.toBe(oldId);
    expect(remote.size).toBe(1);
  });

  it('non adotta un omonimo con byte diversi né elimina il file', async () => {
    const bytes = Buffer.from('wrong');
    remote.set('foreign', { metadata: drivePageMetadata('foreign', photobookPageFileName(originals[0]), bytes), bytes });
    await expect(copy()).rejects.toThrow('diverso');
    expect([...remote.keys()]).toEqual(['foreign']);
    expect(http.stats.chunks).toHaveLength(0);
  });

  it('blocca copie duplicate anche se entrambe integre', async () => {
    const { file } = await copy();
    remote.set('duplicate', { metadata: { ...file, id: 'duplicate' }, bytes: objects.get(originals[0].storagePath)! });
    await expect(verifyPhotobookDrivePages('folder', [originals[0]], bucket)).rejects.toThrow('duplicate');
    expect(remote.size).toBe(2);
  });

  it('blocca pagine remote obsolete ma conserva copertine e altri allegati', async () => {
    await copy();
    const bytes = Buffer.from('attachment');
    remote.set('attachment', { metadata: drivePageMetadata('attachment', 'copertina.tif', bytes), bytes });
    expect(await verifyPhotobookDrivePages('folder', [originals[0]], bucket)).toHaveLength(1);
    remote.set('old', { metadata: drivePageMetadata('old', 'pagina-002-old.jpg', bytes), bytes });
    await expect(verifyPhotobookDrivePages('folder', [originals[0]], bucket)).rejects.toThrow('obsolete');
    expect(remote.has('attachment')).toBe(true);
  });

  it('preserva salti legittimi, rifiuta numeri invalidi e produce ordine lessicale anche oltre 999', () => {
    const pages = orderPhotobookPages([originals[1], { ...originals[0], pageNumber: 1001 }]);
    expect(pages.map(page => page.pageNumber)).toEqual([2, 1001]);
    expect(pages.map(photobookPageFileName).sort()).toEqual(pages.map(photobookPageFileName));
    for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => orderPhotobookPages([{ ...originals[0], pageNumber: invalid }])).toThrow('non valida');
    }
    expect(() => orderPhotobookPages([originals[0], { ...originals[1], pageNumber: 1 }])).toThrow('duplicata');
  });

  it('un proprietario scaduto non avvia upload né registra il risultato', async () => {
    await expect(copy(originals[0], async () => { throw new Error('ownership changed'); })).rejects.toThrow('ownership changed');
    expect(remote.size).toBe(0);
    expect(http.stats.chunks).toHaveLength(0);
  });

  it('carica grandi originali a chunk di massimo 8 MiB senza cambiare i byte', async () => {
    const bytes = Buffer.alloc(19 * 1024 * 1024 + 1, 0xab);
    objects.set(originals[0].storagePath, bytes);
    await copy();
    expect(http.stats.chunks).toEqual([8 * 1024 * 1024, 8 * 1024 * 1024, 3 * 1024 * 1024 + 1]);
    expect([...remote.values()][0].bytes.equals(bytes)).toBe(true);
  });

  it('consuma un originale senza MD5 oltre il limite dello stream, lo verifica e recupera un commit non registrato', async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 13, 0x3e);
    let reads = 0;
    const source = {
      getMetadata: async () => [{ size: String(bytes.length), contentType: 'image/jpeg' }],
      createReadStream: () => {
        reads++;
        return Readable.from((function* () {
          for (let offset = 0; offset < bytes.length; offset += 32 * 1024) {
            yield bytes.subarray(offset, offset + 32 * 1024);
          }
        })(), { highWaterMark: 16 * 1024, objectMode: false });
      },
    };
    const copyWithoutMetadataChecksum = () => copyPhotobookPage({
      folderId: 'folder', page: originals[0], source,
      reservedId: reservations.get(originals[0].id),
      reserve: async id => { reservations.set(originals[0].id, id); },
      assertActive: async () => {},
    });
    afterCommit = async () => { throw new TypeError('lost completion response'); };
    await copyWithoutMetadataChecksum();
    expect(remote.size).toBe(1);
    expect([...remote.values()][0].bytes.equals(bytes)).toBe(true);
    const verified = await verifyPhotobookDrivePages('folder', [originals[0]], { file: () => source });
    expect(verified).toHaveLength(1);
    // Simulate missing Firestore registration after a successful remote commit.
    reservations.clear();
    expect((await copyWithoutMetadataChecksum()).skipped).toBe(true);
    expect(remote.size).toBe(1);
    expect(reads).toBe(4); // initial hash + disk spool + verification + recovery hash
    expect(http.stats.committed).toHaveLength(0); // response-lost hook threw after storing bytes
  });

  it('verifica l’inventario completo e non accetta ricerche Drive parziali', async () => {
    state.request = async () => Response.json({ incompleteSearch: true, files: [] });
    await expect(listPhotobookDriveFiles('folder')).rejects.toThrow('incompleto');
    expect(remote.size).toBe(0);
  });

  it('non accetta dimensione/checksum validi con una provenienza esplicitamente diversa', () => {
    const bytes = objects.get(originals[0].storagePath)!;
    const file = drivePageMetadata('wrong-source', photobookPageFileName(originals[0]), bytes, { pbSource: 'different-source' });
    expect(() => matchDrivePage([file], originals[0], {
      size: bytes.length, md5: file.md5Checksum!,
    })).toThrow('diverso');
  });
});
