import { Readable } from 'node:stream';

function clone<T>(value: T): T {
  if (value === undefined) return value;
  if (value && typeof (value as any).toDate === 'function') return value;
  if (value && typeof (value as any).toMillis === 'function') return value;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, clone(item)]),
    ) as T;
  }
  return value;
}

function getNested(value: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function setNested(target: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = target;
  parts.slice(0, -1).forEach(part => {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  });
  const last = parts[parts.length - 1];
  // FieldValue.delete() is intentionally approximated for the unit tests.
  if (value?.constructor?.name === 'DeleteTransform') delete current[last];
  else if (value?.constructor?.name === 'NumericIncrementTransform') {
    current[last] = Number(current[last] || 0) + value.operand;
  } else if (value?.constructor?.name === 'ArrayUnionTransform') {
    current[last] = [...new Set([...(current[last] || []), ...value.elements])];
  }
  else current[last] = clone(value);
}

class FakeSnapshot {
  constructor(readonly ref: FakeDocumentReference, private readonly value: any) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value === undefined ? undefined : clone(this.value); }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeSnapshot[]) {}
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
}

class FakeQuery {
  protected filters: Array<{ field: string; op: string; value: any }> = [];
  protected maximum?: number;

  constructor(protected readonly db: FakeFirestore, readonly path: string) {}

  where(field: string, op: string, value: any) {
    const query = new FakeQuery(this.db, this.path);
    query.filters = [...this.filters, { field, op, value }];
    query.maximum = this.maximum;
    return query;
  }

  limit(maximum: number) {
    const query = new FakeQuery(this.db, this.path);
    query.filters = [...this.filters];
    query.maximum = maximum;
    return query;
  }

  async get() {
    const prefix = `${this.path}/`;
    const docs = [...this.db.documents.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => new FakeSnapshot(new FakeDocumentReference(this.db, path), value))
      .filter(snapshot => this.filters.every(filter => {
        const actual = getNested(snapshot.data(), filter.field);
        if (filter.op === '==') return actual === filter.value;
        if (filter.op === '<=') return Number(actual?.toMillis?.() ?? actual) <= Number(filter.value?.toMillis?.() ?? filter.value);
        throw new Error(`Unsupported fake query operator ${filter.op}`);
      }));
    return new FakeQuerySnapshot(this.maximum ? docs.slice(0, this.maximum) : docs);
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id?: string) {
    return new FakeDocumentReference(this.db, `${this.path}/${id || this.db.autoId()}`);
  }
}

class FakeCollectionGroupQuery {
  private filters: Array<{ field: string; op: string; value: any }> = [];
  private maximum?: number;

  constructor(private readonly db: FakeFirestore, private readonly name: string) {}

  where(field: string, op: string, value: any) {
    const query = new FakeCollectionGroupQuery(this.db, this.name);
    query.filters = [...this.filters, { field, op, value }];
    query.maximum = this.maximum;
    return query;
  }

  limit(maximum: number) {
    const query = new FakeCollectionGroupQuery(this.db, this.name);
    query.filters = [...this.filters];
    query.maximum = maximum;
    return query;
  }

  async get() {
    const docs = [...this.db.documents.entries()]
      .filter(([path]) => {
        const parts = path.split('/');
        return parts.length >= 2 && parts[parts.length - 2] === this.name;
      })
      .map(([path, value]) => new FakeSnapshot(new FakeDocumentReference(this.db, path), value))
      .filter(snapshot => this.filters.every(filter => {
        const actual = getNested(snapshot.data(), filter.field);
        if (filter.op === '==') return actual === filter.value;
        if (filter.op === '<=') {
          return Number(actual?.toMillis?.() ?? actual) <=
            Number(filter.value?.toMillis?.() ?? filter.value);
        }
        throw new Error(`Unsupported fake query operator ${filter.op}`);
      }));
    return new FakeQuerySnapshot(this.maximum ? docs.slice(0, this.maximum) : docs);
  }
}

export class FakeDocumentReference {
  constructor(readonly db: FakeFirestore, readonly path: string) {}
  get id() { return this.path.split('/').pop()!; }
  collection(name: string) { return new FakeCollectionReference(this.db, `${this.path}/${name}`); }
  async get() { return new FakeSnapshot(this, this.db.documents.get(this.path)); }
  async set(value: any, options?: { merge?: boolean }) {
    const existing = options?.merge ? clone(this.db.documents.get(this.path) || {}) : {};
    const next = { ...existing };
    Object.entries(value).forEach(([key, item]) => setNested(next, key, item));
    this.db.documents.set(this.path, next);
  }
  async update(value: any) {
    if (!this.db.documents.has(this.path)) throw new Error(`Missing document ${this.path}`);
    const next = clone(this.db.documents.get(this.path));
    Object.entries(value).forEach(([key, item]) => setNested(next, key, item));
    this.db.documents.set(this.path, next);
  }
  async delete() { this.db.documents.delete(this.path); }
}

export class FakeFirestore {
  readonly documents = new Map<string, any>();
  private counter = 0;
  private transactionTail: Promise<void> = Promise.resolve();

  collection(path: string) { return new FakeCollectionReference(this, path); }
  collectionGroup(name: string) { return new FakeCollectionGroupQuery(this, name); }
  autoId() { this.counter++; return `auto_${String(this.counter).padStart(6, '0')}`; }
  seed(path: string, value: any) { this.documents.set(path, clone(value)); }
  value(path: string) { return clone(this.documents.get(path)); }
  countCollection(path: string) {
    const prefix = `${path}/`;
    return [...this.documents.keys()].filter(
      key => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'),
    ).length;
  }

  async runTransaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const writes: Array<() => Promise<void> | void> = [];
    const transaction = {
      get: (ref: FakeDocumentReference | FakeQuery) => {
        if (writes.length) throw new Error('Firestore transaction reads must precede writes');
        return ref.get();
      },
      set: (ref: FakeDocumentReference, value: any, options?: any) => {
        writes.push(() => ref.set(value, options));
      },
      update: (ref: FakeDocumentReference, value: any) => {
        writes.push(() => ref.update(value));
      },
      delete: (ref: FakeDocumentReference) => writes.push(() => ref.delete()),
    };
    const before = new Map(this.documents);
    try {
      const result = await callback(transaction);
      for (const write of writes) await write();
      return result;
    } catch (error) {
      this.documents.clear();
      before.forEach((value, key) => this.documents.set(key, value));
      throw error;
    } finally {
      release();
    }
  }
}

export class FakeStorage {
  readonly files = new Map<string, {
    buffer: Buffer;
    contentType: string;
    metadata?: Record<string, unknown>;
  }>();
  readonly deleted: string[] = [];
  readonly metadataUpdates: Array<{ path: string; metadata: Record<string, unknown> }> = [];
  readonly failDeletePaths = new Set<string>();
  readonly failMetadataPaths = new Set<string>();
  readonly resumableUploads: Array<{ path: string; options: Record<string, unknown> }> = [];
  lifecycleRules: any[] = [];
  onDelete?: (path: string) => void | Promise<void>;
  onDownload?: (path: string) => void | Promise<void>;

  put(path: string, buffer: Buffer, contentType = 'image/jpeg') {
    this.files.set(path, { buffer, contentType });
  }

  bucket() {
    return {
      name: 'fake-bucket',
      getMetadata: async () => [{ lifecycle: { rule: clone(this.lifecycleRules) } }],
      setMetadata: async (metadata: any) => {
        this.lifecycleRules = clone(metadata?.lifecycle?.rule || []);
        return [{ lifecycle: { rule: clone(this.lifecycleRules) } }];
      },
      file: (path: string) => ({
        createResumableUpload: async (options: Record<string, unknown>) => {
          this.resumableUploads.push({ path, options: clone(options) });
          return [`https://storage.test/upload/${encodeURIComponent(path)}?upload_id=fake`];
        },
        exists: async () => [this.files.has(path)],
        getMetadata: async () => {
          const file = this.files.get(path);
          if (!file) throw new Error('not found');
          return [{
            size: String(file.buffer.length),
            contentType: file.contentType,
            ...(file.metadata || {}),
          }];
        },
        setMetadata: async (metadata: Record<string, unknown>) => {
          if (this.failMetadataPaths.has(path)) throw new Error('metadata update failed');
          const file = this.files.get(path);
          if (!file) throw new Error('not found');
          file.metadata = { ...(file.metadata || {}), ...clone(metadata) };
          this.metadataUpdates.push({ path, metadata: clone(metadata) });
          return [clone(file.metadata)];
        },
        download: async () => {
          const file = this.files.get(path);
          if (!file) throw new Error('not found');
          await this.onDownload?.(path);
          return [file.buffer];
        },
        createReadStream: () => {
          const file = this.files.get(path);
          if (!file) throw new Error('not found');
          return Readable.from([file.buffer]);
        },
        delete: async () => {
          if (this.failDeletePaths.has(path)) throw new Error('delete failed');
          await this.onDelete?.(path);
          this.deleted.push(path);
          this.files.delete(path);
        },
      }),
    };
  }
}
