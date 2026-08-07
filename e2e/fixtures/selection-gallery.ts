/**
 * Fixture per i test e2e sull'esclusione capitoli dalla selezione
 * (gallery-excluded-chapters.spec.ts).
 *
 * Crea via Firebase Admin SDK una galleria pubblica con capitoli abilitati:
 * - Capitolo "Cerimonia" (normale, selezionabile)
 * - Capitolo "Backstage" (excludeFromSelection: true)
 * e 3 foto fittizie per capitolo (solo metadati; gli URL sono finti perché il
 * test aborta il download delle immagini).
 *
 * La modalità di selezione (normale / dislike / multi-prodotto) e gli stati
 * pre-salvati (selectedPhotoIds / photoAssignments contenenti foto del
 * capitolo escluso, come se il cliente avesse selezionato PRIMA che l'admin
 * escludesse il capitolo) sono configurabili via `options`.
 *
 * Teardown: cascade-delete server-side condiviso (nessun dato orfano).
 */
// ⛔ GUARDIA ANTI-PRODUZIONE: questo fixture scrive su Firestore e DEVE girare
// solo contro l'emulatore. Il check avviene PRIMA di importare l'Admin SDK,
// così il test non può mai toccare il database di produzione.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "e2e/fixtures/selection-gallery.ts richiede l'emulatore Firestore: " +
      "imposta FIRESTORE_EMULATOR_HOST (es. 127.0.0.1:8080) e lancia i test " +
      "con playwright.emulator.config.ts. MAI contro la produzione.",
  );
}

import { db, Timestamp } from "../../server/firebase-admin";
import { cascadeDeleteGallery } from "../../server/services/gallery-cascade-delete";

export const E2E_SELECTION_FIXTURE_TAG = "e2e-excluded-chapters-fixture";

export interface SeededSelectionGallery {
  galleryId: string;
  /** id delle foto del capitolo selezionabile, in ordine */
  allowedPhotoIds: string[];
  /** id delle foto del capitolo escluso, in ordine */
  excludedPhotoIds: string[];
  allowedChapterId: string;
  excludedChapterId: string;
}

export interface SeedSelectionGalleryOptions {
  /** Campi extra del documento galleria (modalità selezione, stati pre-salvati…) */
  galleryFields?: Record<string, unknown>;
  /** Foto per capitolo (default 3) */
  photosPerChapter?: number;
}

export async function seedSelectionGallery(
  options: SeedSelectionGalleryOptions = {},
): Promise<SeededSelectionGallery> {
  const photosPerChapter = options.photosPerChapter ?? 3;
  const now = Timestamp.now();
  const code = `${E2E_SELECTION_FIXTURE_TAG}-${Date.now()}`;

  const allowedChapterId = "e2e-chap-allowed";
  const excludedChapterId = "e2e-chap-excluded";

  const chapters = [
    {
      id: allowedChapterId,
      titolo: "Cerimonia",
      descrizione: "",
      ordine: 1,
      excludeFromSelection: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: excludedChapterId,
      titolo: "Backstage",
      descrizione: "",
      ordine: 2,
      excludeFromSelection: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const galleryRef = db.collection("galleries").doc();
  const galleryId = galleryRef.id;

  // Foto: createdAt OBBLIGATORIO (la query paginata ordina per createdAt).
  const baseMs = now.toMillis();
  const batch = db.batch();
  const allowedPhotoIds: string[] = [];
  const excludedPhotoIds: string[] = [];
  const chapterDefs: Array<{ chapterId: string; sink: string[] }> = [
    { chapterId: allowedChapterId, sink: allowedPhotoIds },
    { chapterId: excludedChapterId, sink: excludedPhotoIds },
  ];
  let photoIdx = 0;
  for (const { chapterId, sink } of chapterDefs) {
    for (let i = 0; i < photosPerChapter; i++) {
      const padded = String(photoIdx + 1).padStart(3, "0");
      const photoRef = db.collection("photos").doc();
      sink.push(photoRef.id);
      batch.set(photoRef, {
        galleryId,
        name: `${E2E_SELECTION_FIXTURE_TAG}-${padded}.jpg`,
        url: `https://e2e.invalid/${galleryId}/${padded}.jpg`,
        thumbnailUrl: null,
        contentType: "image/jpeg",
        size: 0,
        uploadedBy: "photographer",
        uploaderUid: E2E_SELECTION_FIXTURE_TAG,
        uploaderEmail: "e2e@fixture.local",
        uploaderName: "E2E Fixture",
        likeCount: 0,
        commentCount: 0,
        position: photoIdx,
        chapterId,
        chapterPosition: i,
        isFixture: true,
        fixtureTag: E2E_SELECTION_FIXTURE_TAG,
        createdAt: Timestamp.fromMillis(baseMs + photoIdx * 1000),
        updatedAt: now,
      });
      photoIdx++;
    }
  }

  batch.set(galleryRef, {
    name: "E2E Fixture – Capitoli esclusi",
    nome: "E2E Fixture – Capitoli esclusi",
    code,
    active: true,
    hasPassword: false,
    chaptersEnabled: true,
    chapters,
    photoCount: photosPerChapter * 2,
    jobId: null,
    isFixture: true,
    fixtureTag: E2E_SELECTION_FIXTURE_TAG,
    selectionEnabled: true,
    selectionStatus: "pending",
    createdAt: now,
    updatedAt: now,
    ...(options.galleryFields || {}),
  });

  await batch.commit();

  return {
    galleryId,
    allowedPhotoIds,
    excludedPhotoIds,
    allowedChapterId,
    excludedChapterId,
  };
}

export async function deleteSelectionGallery(galleryId: string): Promise<void> {
  if (!galleryId) return;
  await cascadeDeleteGallery(galleryId);
}

/** Rilegge il documento galleria (per verificare cosa è stato salvato). */
export async function readGalleryDoc(
  galleryId: string,
): Promise<Record<string, any> | null> {
  const snap = await db.collection("galleries").doc(galleryId).get();
  return snap.exists ? (snap.data() as Record<string, any>) : null;
}

/**
 * Attende che la selezione risulti completata su Firestore (il salvataggio è
 * asincrono lato client) e ritorna il documento galleria.
 */
export async function waitForSelectionCompleted(
  galleryId: string,
  timeoutMs = 20_000,
): Promise<Record<string, any>> {
  const start = Date.now();
  for (;;) {
    const data = await readGalleryDoc(galleryId);
    if (data?.selectionStatus === "completed") return data;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timeout: selectionStatus non è diventato 'completed' per ${galleryId} ` +
          `(attuale: ${data?.selectionStatus ?? "documento mancante"})`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
