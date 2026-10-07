type Ref = { collection: string; id: string; path: string };
type Write = { kind: string; ref: Ref; data: any; options?: any };
const maps: Record<string, Map<string, any>> = { galleries: new Map(), gallerySecrets: new Map(), jobs: new Map() };
const writes: Write[] = [];
const clone = (x: any) => x === undefined ? undefined : structuredClone(x);
export const db = {};
export const getFirestore = () => db;
export const connectFirestoreEmulator = () => {};
export const orderBy = (...args: any[]) => ({ orderBy: args });
export const deleteField = () => ({ __deleteField: true });
export const doc = (_db: any, collection: string, id: string) => ({ collection, id, path: `${collection}/${id}` } as Ref);
export const collection = (_db: any, name: string, ...segments: string[]) => ({ collection: name, path: [name, ...segments].join("/") });
export const where = (...args: any[]) => ({ where: args });
export const query = (ref: any, ...constraints: any[]) => ({ ...ref, constraints });
export const serverTimestamp = () => ({ __serverTimestamp: true });
export const Timestamp = { fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000) }) };
export const arrayRemove = (...values: any[]) => ({ __arrayRemove: values });
export const arrayUnion = (...values: any[]) => ({ __arrayUnion: values });
export function resetFakeStore(gallery: any, jobs: any[]) {
  for (const m of Object.values(maps)) m.clear();
  writes.length = 0;
  maps.galleries.set(gallery.id, clone(gallery));
  for (const j of jobs) maps.jobs.set(j.id, clone(j));
  window.__fakeStore = { maps, writes, failNextBatch: false, resetFakeStore };
}
function rejectUndefined(value: any, at = "data") {
  if (value === undefined) throw new Error(`Firestore rejects undefined at ${at}`);
  if (value && typeof value === "object" && !Array.isArray(value))
    for (const [k, v] of Object.entries(value)) rejectUndefined(v, `${at}.${k}`);
  if (Array.isArray(value)) value.forEach((v, i) => rejectUndefined(v, `${at}[${i}]`));
}
function apply(ref: Ref, data: any, merge = true) {
  rejectUndefined(data);
  const target = clone(maps[ref.collection].get(ref.id) || {});
  for (const [key, value] of Object.entries(data)) {
    const old = target[key];
    if (value && typeof value === "object" && "__arrayRemove" in value)
      target[key] = (old || []).filter((v: any) => !value.__arrayRemove.some((x: any) => x === v));
    else if (value && typeof value === "object" && "__arrayUnion" in value)
      target[key] = [...new Set([...(old || []), ...value.__arrayUnion])];
    else target[key] = value;
  }
  maps[ref.collection].set(ref.id, merge ? target : clone(data));
}
export async function updateDoc(ref: Ref, data: any) { apply(ref, data); writes.push({ kind: "update", ref, data: clone(data) }); }
export async function setDoc(ref: Ref, data: any, options?: any) { apply(ref, data, !!options?.merge); writes.push({ kind: "set", ref, data: clone(data), options }); }
export async function getDoc(ref: Ref) {
  const value = maps[ref.collection]?.get(ref.id);
  return { id: ref.id, exists: () => value !== undefined, data: () => clone(value) };
}
export async function getDocs(ref: any) {
  const entries = [...(maps[ref.collection] || new Map()).entries()];
  const docs = entries.map(([id, value]) => ({ id, data: () => clone(value) }));
  return { docs, empty: docs.length === 0, size: docs.length };
}
export async function deleteDoc(ref: Ref) { maps[ref.collection]?.delete(ref.id); writes.push({ kind: "delete", ref, data: null }); }
export async function addDoc(ref: any, data: any) { const result = doc(db, ref.collection, `created-${Date.now()}`); await setDoc(result, data); return result; }
export function writeBatch() {
  const pending: Write[] = [];
  return {
    update(ref: Ref, data: any) { pending.push({ kind: "update", ref, data }); },
    set(ref: Ref, data: any, options?: any) { pending.push({ kind: "set", ref, data, options }); },
    delete(ref: Ref) { pending.push({ kind: "delete", ref, data: null }); },
    async commit() {
      if (window.__fakeStore?.failNextBatch) { window.__fakeStore.failNextBatch = false; throw new Error("Injected fake batch failure"); }
      for (const w of pending) if (w.kind !== "delete") rejectUndefined(w.data);
      for (const w of pending) {
        if (w.kind === "delete") maps[w.ref.collection].delete(w.ref.id);
        else apply(w.ref, w.data, w.kind === "update" || !!w.options?.merge);
      }
      writes.push(...pending.map(w => ({ ...w, data: clone(w.data) })));
    }
  };
}