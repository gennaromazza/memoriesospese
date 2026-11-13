import { Timestamp, type Firestore } from 'firebase-admin/firestore';

/**
 * Optimistic document-version transactions. Queries deliberately do not lock
 * empty ranges: without the day guard, concurrent empty-query inserts BOTH win.
 */
export function reservationDb() {
  const rows = new Map<string, { value: any; version: number }>();
  let version = 0, sequence = 0;
  const read = (path: string) => {
    const row = rows.get(path);
    return {
      id: path.split('/')[1], ref: reference(path), exists: !!row,
      updateTime: row ? Timestamp.fromMillis(row.version) : undefined,
      data: () => row ? { ...row.value } : undefined,
    };
  };
  const seed = (path: string, value: any) => rows.set(path, { value: { ...value }, version: ++version });
  function reference(path: string): any {
    return { kind: 'ref', path, id: path.split('/')[1], get: async () => read(path),
      set: async (data: any) => seed(path, data),
      update: async (data: any) => seed(path, { ...rows.get(path)!.value, ...data }),
      delete: async () => rows.delete(path) };
  }
  function query(name: string, filters: any[] = []): any {
    return {
      kind: 'query', name,
      doc: (id?: string) => reference(`${name}/${id || `draft-${++sequence}`}`),
      where: (field: string, op: string, value: any) => query(name, [...filters, [field, op, value]]),
      get: async () => {
        const docs = [...rows].filter(([path, row]) => path.split('/')[0] === name && filters.every(([field, op, value]) => {
          const actual = row.value[field]?.toMillis?.() ?? row.value[field];
          const expected = value?.toMillis?.() ?? value;
          return op === '==' ? actual === expected : op === '>=' ? actual >= expected : actual <= expected;
        })).map(([path]) => read(path));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }
  let retries = 0;
  const db = {
    collection: (name: string) => query(name),
    runTransaction: async (fn: any) => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const reads = new Map<string, number>();
        const writes: (() => void)[] = [];
        const result = await fn({
          get: async (target: any) => {
            const result = await target.get();
            if (target.kind === 'ref') reads.set(target.path, result.updateTime?.toMillis() ?? 0);
            else for (const doc of result.docs) reads.set(doc.ref.path, doc.updateTime.toMillis());
            return result;
          },
          set: (ref: any, data: any) => writes.push(() => { seed(ref.path, data); }),
          update: (ref: any, data: any) => writes.push(() => { seed(ref.path, { ...rows.get(ref.path)!.value, ...data }); }),
        });
        if ([...reads].some(([path, v]) => (rows.get(path)?.version ?? 0) !== v)) { retries++; continue; }
        writes.forEach(write => write());
        return result;
      }
      throw new Error('Transaction retry limit');
    },
  } as unknown as Firestore;
  return { db, seed, value: (path: string) => rows.get(path)?.value, rows, retries: () => retries };
}
