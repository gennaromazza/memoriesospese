import { randomUUID } from 'node:crypto';
import { db, FieldValue } from './firebase-admin.js';

export class PhotobookVersionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function createVersionDraft(id: string, label: string | null) {
  const ref = db.collection('photobooks').doc(id);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new PhotobookVersionError(404, 'Fotolibro non trovato');
    const book = snapshot.data()!;
    if (book.locked) throw new PhotobookVersionError(409, 'Fotolibro in stampa');
    const versions = book.versions || [];
    const version = Math.max(0, ...versions.map((v: { version: number }) => v.version)) + 1;
    if (version > 9999) throw new PhotobookVersionError(409, 'Limite versioni raggiunto');
    const updated = { ...book, versions: [...versions, { version, label, status: 'draft', pageCount: 0, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() };
    tx.update(ref, { versions: updated.versions, updatedAt: FieldValue.serverTimestamp() });
    return updated;
  });
}

/** Pubblica solo una bozza completa. Il mockup precedente resta intatto;
 * la nuova versione riceve copie dei metadati asset, non nuovi upload Storage. */
export async function publishVersion(id: string, version: number, expectedCurrentVersion: number, expectedPageCount: number) {
  if (![version, expectedCurrentVersion, expectedPageCount].every(Number.isInteger) || version < 1 || version > 9999 || expectedPageCount < 1) {
    throw new PhotobookVersionError(400, 'Versione e numero pagine non validi');
  }
  const ref = db.collection('photobooks').doc(id);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new PhotobookVersionError(404, 'Fotolibro non trovato');
    const book = snapshot.data()!;
    if (book.locked) throw new PhotobookVersionError(409, 'Fotolibro in stampa');
    const entry = book.versions?.find((v: { version: number }) => v.version === version);
    if (!entry) throw new PhotobookVersionError(400, 'Versione inesistente');
    if (entry.status !== 'draft' && book.currentVersion === version) return;
    if (entry.status !== 'draft' || book.currentVersion !== expectedCurrentVersion || version < book.currentVersion) throw new PhotobookVersionError(409, 'La versione attuale è cambiata. Ricarica prima di pubblicare.');
    const pages = await tx.get(db.collection('photobookPages').where('photobookId', '==', id).where('version', '==', version));
    const numbers = pages.docs.map(p => p.data().pageNumber).sort((a, b) => a - b);
    if (numbers.length !== expectedPageCount || entry.pageCount !== numbers.length || numbers.some((n, i) => n !== i + 1)) throw new PhotobookVersionError(409, 'Controlla le pagine: caricamento incompleto o numerazione duplicata/mancante.');
    const oldMockup = await tx.get(ref.collection('mockups').doc(`v${book.currentVersion}`));
    const oldOffer = await tx.get(ref.collection('mockupOffers').doc(`v${book.currentVersion}`));
    const target = await tx.get(ref.collection('mockups').doc(`v${version}`));
    const targetOffer = await tx.get(ref.collection('mockupOffers').doc(`v${version}`));
    if (target.exists || targetOffer.exists) throw new PhotobookVersionError(409, 'La bozza contiene già un mockup: serve verifica dello studio prima della pubblicazione.');
    const saved = oldMockup.data();
    const assets: { id: string; data: FirebaseFirestore.DocumentData }[] = [];
    const configuration = saved ? { ...saved.configuration } : null;
    for (const field of ['photoAssetId', 'backPhotoAssetId']) {
      if (!configuration?.[field]) continue;
      const asset = await tx.get(ref.collection('mockupAssets').doc(configuration[field]));
      if (!asset.exists || asset.data()!.version !== book.currentVersion) throw new PhotobookVersionError(409, 'Foto del mockup precedente non disponibile. Nessuna versione pubblicata.');
      const assetId = randomUUID();
      assets.push({ id: assetId, data: { ...asset.data(), version } });
      configuration[field] = assetId;
    }
    const now = new Date().toISOString();
    for (const asset of assets) tx.set(ref.collection('mockupAssets').doc(asset.id), asset.data);
    if (oldOffer.exists) tx.set(ref.collection('mockupOffers').doc(`v${version}`), oldOffer.data()!);
    if (saved) {
      const { confirmedAt, reportPath, note, ...previous } = saved;
      tx.set(ref.collection('mockups').doc(`v${version}`), { ...previous, version, revision: 1, configuration, status: 'draft', updatedBy: 'studio', updatedAt: now });
    }
    tx.update(ref, { currentVersion: version, versions: book.versions.map((v: { version: number }) => v.version === version ? { ...v, status: 'published', publishedAt: now } : v), updatedAt: FieldValue.serverTimestamp() });
  });
}
