/**
 * Fixture per il test e2e della "galleria grande" (gallery-render-window.spec.ts).
 *
 * Crea via Firebase Admin SDK una galleria pubblica (senza password, senza
 * capitoli) con centinaia di foto FITTIZIE — solo metadati Firestore nella
 * collezione moderna `photos`. Il test e2e aborta comunque il download delle
 * immagini, quindi gli URL non devono puntare a file reali: serve solo che
 * ogni documento foto sia paginabile (`orderBy('createdAt')`) e montabile come
 * `.gallery-image`.
 *
 * Il teardown riusa il cascade-delete server-side condiviso
 * (`server/services/gallery-cascade-delete`) così non restano dati orfani:
 * foto nella collezione moderna `photos`, eventuali foto nella sottocollezione
 * legacy `galleries/{id}/photos`, il secret in `gallerySecrets/{id}` e il
 * documento galleria stesso.
 *
 * NOTA: importa direttamente `server/firebase-admin`, che si inizializza al
 * primo import leggendo `FIREBASE_ADMIN_CREDENTIALS` dall'ambiente (lo stesso
 * usato dal dev server). Eseguire il test nello stesso ambiente del workflow.
 */
import { db, Timestamp } from "../../server/firebase-admin";
import { cascadeDeleteGallery } from "../../server/services/gallery-cascade-delete";

/** Marca le foto/gallerie fixture per riconoscerle e ripulirle facilmente. */
export const E2E_FIXTURE_TAG = "e2e-render-window-fixture";

export interface SeededGallery {
  galleryId: string;
  photoCount: number;
}

/**
 * Crea la galleria fixture con `photoCount` foto fittizie.
 * Ritorna l'id del documento galleria creato.
 */
export async function seedLargeGallery(photoCount: number): Promise<SeededGallery> {
  if (!Number.isInteger(photoCount) || photoCount <= 0) {
    throw new Error(`seedLargeGallery: photoCount non valido (${photoCount})`);
  }

  const now = Timestamp.now();
  const code = `${E2E_FIXTURE_TAG}-${Date.now()}`;

  // 1. Documento galleria: pubblica (hasPassword:false → hasValidAccess true),
  //    senza capitoli (la finestra di rendering è attiva solo in vista standard
  //    senza capitoli), attiva, con photoCount coerente.
  const galleryRef = await db.collection("galleries").add({
    name: "E2E Fixture – Galleria Grande",
    nome: "E2E Fixture – Galleria Grande",
    code,
    active: true,
    hasPassword: false,
    chaptersEnabled: false,
    chapters: [],
    photoCount,
    jobId: null,
    isFixture: true,
    fixtureTag: E2E_FIXTURE_TAG,
    createdAt: now,
    updatedAt: now,
  });

  const galleryId = galleryRef.id;

  // 2. Foto: scritte nella collezione moderna `photos`. `createdAt` OBBLIGATORIO
  //    (Firestore scarta dall'orderBy i doc che ne sono privi). Spaziamo i
  //    timestamp di 1s per indice così l'ordinamento è deterministico.
  const baseMs = now.toMillis();
  const BATCH_LIMIT = 400;
  for (let start = 0; start < photoCount; start += BATCH_LIMIT) {
    const batch = db.batch();
    const end = Math.min(start + BATCH_LIMIT, photoCount);
    for (let i = start; i < end; i++) {
      const padded = String(i + 1).padStart(4, "0");
      const photoRef = db.collection("photos").doc();
      batch.set(photoRef, {
        galleryId,
        name: `${E2E_FIXTURE_TAG}-${padded}.jpg`,
        // URL fittizio: le richieste immagine vengono abortite dal test.
        url: `https://e2e.invalid/${galleryId}/${padded}.jpg`,
        thumbnailUrl: null,
        contentType: "image/jpeg",
        size: 0,
        uploadedBy: "photographer",
        uploaderUid: E2E_FIXTURE_TAG,
        uploaderEmail: "e2e@fixture.local",
        uploaderName: "E2E Fixture",
        likeCount: 0,
        commentCount: 0,
        position: i,
        chapterId: null,
        isFixture: true,
        fixtureTag: E2E_FIXTURE_TAG,
        // createdAt crescente con l'indice (spaziato di 1s).
        createdAt: Timestamp.fromMillis(baseMs + i * 1000),
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  return { galleryId, photoCount };
}

/**
 * Elimina la galleria fixture e tutte le sue foto riusando il cascade-delete
 * server-side condiviso. Idempotente: non lancia se la galleria non esiste più.
 */
export async function deleteLargeGallery(galleryId: string): Promise<void> {
  if (!galleryId) return;
  await cascadeDeleteGallery(galleryId);
}
