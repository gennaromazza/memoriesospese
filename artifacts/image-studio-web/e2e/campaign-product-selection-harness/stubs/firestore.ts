type DocumentData = Record<string, any>;
type CollectionRef = { collection: string; constraints?: unknown[] };
type DocumentRef = { collection: string; id: string };

const clone = <T,>(value: T): T => structuredClone(value);
const collections: Record<string, Map<string, DocumentData>> = {};
const writes: Array<{ operation: string; collection: string; id: string; data?: DocumentData }> = [];
let nextId = 0;
const deleteFieldMarker = { __campaignHarnessDeleteField: true };

export const db = {};
export const Timestamp = {
  now: () => new Date(),
  fromDate: (date: Date) => date,
};
export const serverTimestamp = () => new Date();
export const orderBy = (...args: unknown[]) => ({ orderBy: args });
export const where = (...args: unknown[]) => ({ where: args });
export const query = (ref: CollectionRef, ...constraints: unknown[]) => ({ ...ref, constraints });
export const deleteField = () => deleteFieldMarker;

export function collection(_db: unknown, name: string): CollectionRef {
  return { collection: name };
}

export function doc(dbOrCollection: unknown, collectionOrId: string, id?: string): DocumentRef {
  return id
    ? { collection: collectionOrId, id }
    : { collection: (dbOrCollection as CollectionRef).collection, id: collectionOrId || `fixture-${++nextId}` };
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
  return data
    ? createSnapshot(ref.id, data)
    : { id: ref.id, exists: () => false, data: () => undefined };
}

export async function addDoc(ref: CollectionRef, data: DocumentData) {
  const id = `fixture-${++nextId}`;
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
  const updated = { ...current };
  for (const [key, value] of Object.entries(data)) {
    if (value === deleteFieldMarker) delete updated[key];
    else updated[key] = clone(value);
  }
  getCollection(ref.collection).set(ref.id, updated);
  writes.push({ operation: "update", collection: ref.collection, id: ref.id, data: clone(data) });
}

export async function deleteDoc(ref: DocumentRef) {
  getCollection(ref.collection).delete(ref.id);
  writes.push({ operation: "delete", collection: ref.collection, id: ref.id });
}

export async function runTransaction<T>(
  _db: unknown,
  callback: (transaction: {
    get: (ref: DocumentRef) => Promise<Awaited<ReturnType<typeof getDoc>>>;
    set: typeof setDoc;
    update: typeof updateDoc;
  }) => Promise<T>,
): Promise<T> {
  return callback({
    get: getDoc,
    set: setDoc,
    update: updateDoc,
  });
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

  getCollection("productCategories").set("category-albums", {
    nome: "Album e fotolibri",
    value: "album",
    attivo: true,
    displayOrder: 1,
  });
  getCollection("productCategories").set("category-prints", {
    nome: "Stampe",
    value: "stampe",
    attivo: true,
    displayOrder: 2,
  });
  getCollection("productCategories").set("category-accessories", {
    nome: "Accessori",
    value: "accessori",
    attivo: true,
    displayOrder: 3,
  });
  for (let order = 4; order <= 12; order += 1) {
    getCollection("productCategories").set(`category-extra-${order}`, {
      nome: `Categoria fotografica con nome molto lungo ${order}`,
      value: `extra-${order}`,
      attivo: true,
      displayOrder: order,
    });
  }

  const products = [
    { id: "album-classic", nome: "Album Classico", categoria: "album", prezzoFinale: 120, numeroFoto: 30 },
    { id: "print-30", nome: "Stampa 30 x 45 cm", categoria: "stampe", prezzoFinale: 12, numeroFoto: 1 },
    { id: "print-40", nome: "Stampa 40 x 60 cm", categoria: "stampe", prezzoFinale: 18, numeroFoto: 1 },
    { id: "box-wood", nome: "Box in legno", categoria: "accessori", prezzoFinale: 35, numeroFoto: 0 },
    ...Array.from({ length: 9 }, (_, index) => {
      const order = index + 4;
      return {
        id: `product-extra-${order}`,
        nome: order === 12
          ? "Album ricordo con copertina fotografica personalizzata, confezione regalo e incisione del nome della famiglia"
          : `Prodotto fotografico categoria ${order}`,
        categoria: `extra-${order}`,
        prezzoFinale: 25 + order,
        numeroFoto: 10,
      };
    }),
  ];
  for (const product of products) {
    const { id, ...data } = product;
    getCollection("products").set(id, {
      ...data,
      attivo: true,
      prezzo: data.prezzoFinale,
      sconto: 0,
      immagini: [],
      pesoGrammi: 0,
      isBundle: false,
    });
  }

  getCollection("booking_campaigns").set("campaign-products", {
    nome: "Campagna test selezione",
    descrizione: "Dati fittizi",
    code: "TESTCAMP1",
    dataInizio: new Date("2027-01-10T10:00:00.000Z"),
    dataFine: new Date("2027-02-10T18:00:00.000Z"),
    giorniAnticipoSlider: 0,
    bloccaPrenotazioniPrimaInizio: false,
    temaStagionale: null,
    orarioApertura: "09:00",
    orarioPausaInizio: "13:00",
    orarioPausaFine: "14:30",
    orarioChiusura: "19:00",
    durataShootingMinuti: 120,
    prodottiDisponibili: ["album-classic"],
    excludedDays: [0],
    attiva: true,
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  (window as any).__campaignSelectionMock = { collections, writes };
}
