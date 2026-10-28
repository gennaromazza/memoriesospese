import { Readable } from 'node:stream';

// No SDKs or credentials here: this store lives only for the lifetime of a test.
export const services = {
  docs: new Map<string, any>(),
  objects: new Map<string, Buffer>(),
  drive: new Map<string, Buffer>(),
  uploads: [] as string[],
  emails: [] as unknown[][],
  failPage: 2,
  nextId: 1,
  queue: Promise.resolve(),
};

const clone = (value: any) => structuredClone(value);
function snapshot(path: string) {
  return {
    id: path.split('/').at(-1)!, ref: doc(path), exists: services.docs.has(path),
    data: () => clone(services.docs.get(path)),
  };
}
export function doc(path: string): any {
  return {
    id: path.split('/').at(-1)!, path,
    get: async () => snapshot(path),
    collection: (name: string) => collection(`${path}/${name}`),
    set: async (value: any) => { services.docs.set(path, clone(value)); },
    update: async (patch: any) => {
      if (!services.docs.has(path)) throw new Error(`Missing document: ${path}`);
      const value = clone(services.docs.get(path));
      for (const [key, entry] of Object.entries(patch)) {
        const parts = key.split('.');
        let target = value;
        for (const part of parts.slice(0, -1)) target = target[part] ||= {};
        target[parts.at(-1)!] = clone(entry);
      }
      services.docs.set(path, value);
    },
  };
}
export function collection(path: string, filters: [string, unknown][] = []): any {
  return {
    doc: (id = `fixture-${services.nextId++}`) => doc(`${path}/${id}`),
    add: async (value: any) => {
      const ref = doc(`${path}/fixture-${services.nextId++}`);
      await ref.set(value);
      return ref;
    },
    where: (key: string, op: string, value: unknown) => {
      if (op !== '==') throw new Error(`Unsupported fixture operator: ${op}`);
      return collection(path, [...filters, [key, value]]);
    },
    get: async () => {
      const docs = [...services.docs].filter(([key, value]) =>
        key.slice(0, key.lastIndexOf('/')) === path
        && filters.every(([field, expected]) => value[field] === expected),
      ).map(([key]) => snapshot(key));
      return { docs, empty: !docs.length, size: docs.length };
    },
  };
}
export const db = {
  collection,
  runTransaction: async (run: any) => {
    const previous = services.queue;
    let release!: () => void;
    services.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const writes: (() => Promise<unknown>)[] = [];
    try {
      const result = await run({
        get: (ref: any) => ref.get(),
        set: (ref: any, value: any) => writes.push(() => ref.set(value)),
        update: (ref: any, value: any) => writes.push(() => ref.update(value)),
      });
      for (const write of writes) await write();
      return result;
    } finally { release(); }
  },
};
const timestamp = (date = new Date()) => ({
  _seconds: Math.floor(date.getTime() / 1000), _nanoseconds: 0,
});
export const FieldValue = { serverTimestamp: () => timestamp() };
export const Timestamp = { now: () => timestamp(), fromDate: timestamp };
export const storage = {
  bucket: () => ({
    name: 'isolated.invalid',
    file: (path: string) => ({
      save: async (buffer: Buffer) => { services.objects.set(path, Buffer.from(buffer)); },
      getMetadata: async () => {
        const buffer = services.objects.get(path);
        if (!buffer) throw new Error(`Missing storage object: ${path}`);
        return [{ contentType: 'image/jpeg', size: String(buffer.length) }];
      },
      createReadStream: () => {
        const buffer = services.objects.get(path);
        if (!buffer) throw new Error(`Missing storage object: ${path}`);
        return Readable.from(buffer);
      },
    }),
  }),
};
async function consume(body: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
export const drive = {
  findOrCreateLabParentFolder: async () => 'isolated-parent',
  createShipmentFolder: async () => ({
    folderId: 'isolated-folder', webViewLink: 'https://drive.invalid/isolated-folder',
  }),
  uploadStreamToDriveFolder: async (_folder: string, name: string, _mime: string, body: AsyncIterable<Buffer>) => {
    services.uploads.push(name);
    const buffer = await consume(body);
    if (name.startsWith(`pagina-${String(services.failPage).padStart(3, '0')}-`)) {
      throw new Error('Trasferimento pagina simulato fallito');
    }
    services.drive.set(name, buffer);
    return { fileId: `drive-${name}`, size: buffer.length };
  },
  updateDriveFileContent: async (id: string, _mime: string, body: AsyncIterable<Buffer>) => {
    const buffer = await consume(body);
    services.drive.set(id.replace(/^drive-/, ''), buffer);
    return { fileId: id, size: buffer.length };
  },
  deleteDriveFile: async () => {},
  createResumableUploadSession: async () => { throw new Error('Unexpected resumable upload'); },
  revokeShipmentFolderPermission: async () => {},
};
export function authenticate(req: any, _res: any, next: () => void) {
  req.user = { email: 'gennaro.mazzacane@gmail.com' };
  next();
}
export const email = {
  authenticateFirebase: authenticate,
  sendGmailEmail: async (...args: unknown[]) => { services.emails.push(args); },
  getStudioContactInfo: async () => ({ name: 'Studio isolato', email: 'studio@example.test', phone: '' }),
  getSiteBaseUrl: () => 'https://studio.invalid',
};
