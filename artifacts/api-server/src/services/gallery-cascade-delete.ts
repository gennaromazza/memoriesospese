/**
 * Cascade-delete server-side di una galleria.
 *
 * Replica lato server (Firebase Admin SDK) la stessa cancellazione a cascata
 * fatta dal client (`client/src/pages/DeleteGalleryPage.tsx`): elimina TUTTE le
 * foto associate in ENTRAMBE le posizioni dati (collezione moderna `photos` con
 * `galleryId` + sottocollezione legacy `galleries/{id}/photos`), il secret in
 * `gallerySecrets/{id}` e infine il documento galleria. Centralizzando qui la
 * logica, sia i test e2e (seed/teardown della galleria fixture) sia eventuali
 * endpoint admin possono riusarla senza lasciare documenti orfani.
 *
 * NOTA: si occupa solo dei documenti Firestore. Non tocca i file in Firebase
 * Storage (la fixture e2e non carica file reali).
 */
import { db } from "../firebase-admin.js";

const BATCH_LIMIT = 400;

/** Elimina in batch tutti i documenti di una query snapshot. */
async function deleteDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(doc.ref);
      deleted++;
    }
    await batch.commit();
  }
  return deleted;
}

export interface CascadeDeleteResult {
  modernPhotosDeleted: number;
  legacyPhotosDeleted: number;
  galleryDeleted: boolean;
}

/**
 * Cancella a cascata la galleria `galleryId` e tutti i dati associati.
 * Idempotente: se la galleria non esiste, ripulisce comunque eventuali foto
 * orfane rimaste e non lancia.
 */
export async function cascadeDeleteGallery(
  galleryId: string,
): Promise<CascadeDeleteResult> {
  if (!galleryId) {
    throw new Error("cascadeDeleteGallery: galleryId mancante");
  }

  // 1. Foto nella collezione moderna `photos` (filtro per galleryId).
  const modernSnap = await db
    .collection("photos")
    .where("galleryId", "==", galleryId)
    .get();
  const modernPhotosDeleted = await deleteDocs(modernSnap.docs);

  // 2. Foto nella sottocollezione legacy `galleries/{id}/photos`.
  const legacySnap = await db
    .collection("galleries")
    .doc(galleryId)
    .collection("photos")
    .get();
  const legacyPhotosDeleted = await deleteDocs(legacySnap.docs);

  // 3. Secret della galleria (password/PIN) se presente.
  await db.collection("gallerySecrets").doc(galleryId).delete().catch(() => {});

  // 4. Documento galleria.
  const galleryRef = db.collection("galleries").doc(galleryId);
  const galleryDoc = await galleryRef.get();
  const galleryDeleted = galleryDoc.exists;
  if (galleryDeleted) {
    await galleryRef.delete();
  }

  return { modernPhotosDeleted, legacyPhotosDeleted, galleryDeleted };
}
