type DocumentData = Record<string, any>;
type CollectionRef = { collection: string };
type DocumentRef = { collection: string; id: string };
type FakeStore = {
  collections: Record<string, Map<string, DocumentData>>;
  writes: Array<{ operation: string; collection: string; id: string; data?: DocumentData }>;
};

const clone = <T,>(value: T): T => structuredClone(value);
const collections: FakeStore["collections"] = {};
const writes: FakeStore["writes"] = [];
let nextId = 0;

export const db = {};
export const getFirestore = () => db;
export const connectFirestoreEmulator = () => undefined;
export const Timestamp = { now: () => ({ seconds: 0, nanoseconds: 0 }) };
export const serverTimestamp = () => ({ __serverTimestamp: true });
export const orderBy = (...args: unknown[]) => ({ orderBy: args });
export const where = (...args: unknown[]) => ({ where: args });
export const query = (ref: CollectionRef, ...constraints: unknown[]) => ({ ...ref, constraints });

export function collection(_db: unknown, name: string): CollectionRef {
  return { collection: name };
}

export function doc(_dbOrCollection: unknown, collectionOrId: string, id?: string): DocumentRef {
  return id
    ? { collection: collectionOrId, id }
    : { collection: ( _dbOrCollection as CollectionRef).collection, id: collectionOrId || `fake-${++nextId}` };
}

function getCollection(name: string): Map<string, DocumentData> {
  collections[name] ??= new Map();
  return collections[name];
}

function createSnapshot(id: string, data: DocumentData) {
  return { id, data: () => clone(data), exists: () => true };
}

export async function getDocs(ref: CollectionRef) {
  const docs = [...getCollection(ref.collection)].map(([id, data]) => createSnapshot(id, data));
  return { docs, empty: docs.length === 0, size: docs.length };
}

export async function getDoc(ref: DocumentRef) {
  const data = getCollection(ref.collection).get(ref.id);
  return data ? createSnapshot(ref.id, data) : { id: ref.id, exists: () => false, data: () => undefined };
}

export async function addDoc(ref: CollectionRef, data: DocumentData) {
  const id = `fake-product-${++nextId}`;
  getCollection(ref.collection).set(id, clone(data));
  writes.push({ operation: "add", collection: ref.collection, id, data: clone(data) });
  return { id };
}

export async function setDoc(ref: DocumentRef, data: DocumentData) {
  getCollection(ref.collection).set(ref.id, clone(data));
  writes.push({ operation: "set", collection: ref.collection, id: ref.id, data: clone(data) });
}

export async function updateDoc(ref: DocumentRef, data: DocumentData) {
  const current = getCollection(ref.collection).get(ref.id) ?? {};
  const updated = { ...current, ...clone(data) };
  getCollection(ref.collection).set(ref.id, updated);
  writes.push({ operation: "update", collection: ref.collection, id: ref.id, data: clone(data) });
}

export async function deleteDoc(ref: DocumentRef) {
  getCollection(ref.collection).delete(ref.id);
  writes.push({ operation: "delete", collection: ref.collection, id: ref.id });
}

export function writeBatch() {
  return {
    update: () => undefined,
    set: () => undefined,
    delete: () => undefined,
    commit: async () => undefined,
  };
}

export function resetMockFirestore() {
  for (const collection of Object.values(collections)) collection.clear();
  writes.length = 0;
  nextId = 0;

  getCollection("products").set("source-shooting", {
    nome: "Shooting",
    descrizione: "Prodotto sorgente fixture",
    prezzo: 100,
    prezzoFinale: 100,
    sconto: 0,
    numeroFoto: 40,
    pesoGrammi: 0,
    categoria: "album",
    attivo: true,
    immagini: [],
    isBundle: false,
  });
  getCollection("products").set("component-album", {
    nome: "Album",
    descrizione: "Componente fixture",
    prezzo: 25,
    prezzoFinale: 25,
    sconto: 0,
    numeroFoto: 10,
    pesoGrammi: 0,
    categoria: "album",
    attivo: true,
    immagini: [],
    isBundle: false,
  });
  getCollection("products").set("bundle-shared-photos", {
    nome: "Bundle test",
    descrizione: "Bundle fixture",
    prezzo: 120,
    prezzoFinale: 120,
    sconto: 0,
    numeroFoto: 50,
    pesoGrammi: 0,
    categoria: "album",
    attivo: true,
    immagini: [],
    isBundle: true,
    fotoCondivise: false,
    prodottoSorgenteFotoId: "",
    bundleItems: [
      { prodottoId: "source-shooting", prodottoNome: "Shooting", prodottoCategoria: "album", quantita: 1, numeroFoto: 40 },
      { prodottoId: "component-album", prodottoNome: "Album", prodottoCategoria: "album", quantita: 1, numeroFoto: 10 },
    ],
  });
  getCollection("productCategories").set("category-album", {
    nome: "Album",
    value: "album",
    attivo: true,
    displayOrder: 1,
  });

  window.__bundlePhotoMock = { collections, writes };
}
