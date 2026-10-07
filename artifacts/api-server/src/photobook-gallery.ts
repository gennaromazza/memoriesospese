/**
 * Accesso alle foto della galleria collegata a un fotolibro.
 * L'Admin SDK bypassa le Security Rules (pattern moduli informativi).
 */

import { db } from './firebase-admin.js';
import type { PhotobookGalleryPhoto, PhotobookGalleryChapter } from '../shared/photobook-types.js';

export interface GalleryPhotoDoc {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  chapterId?: string | null;
}

/** Carica le foto della galleria (collezione moderna `photos` + legacy subcollection). */
export async function loadGalleryPhotoDocs(galleryId: string): Promise<GalleryPhotoDoc[]> {
  const result: GalleryPhotoDoc[] = [];

  const modern = await db.collection('photos').where('galleryId', '==', galleryId).get();
  modern.forEach((doc) => {
    const d = doc.data();
    if (d.url) {
      result.push({
        id: doc.id,
        name: d.name || d.fileName || doc.id,
        url: d.url,
        thumbnailUrl: d.thumbnailUrl || null,
        chapterId: d.chapterId || null,
      });
    }
  });

  try {
    const legacy = await db.collection('galleries').doc(galleryId).collection('photos').get();
    const seen = new Set(result.map((p) => p.id));
    legacy.forEach((doc) => {
      if (seen.has(doc.id)) return;
      const d = doc.data();
      if (d.url) {
        result.push({
          id: doc.id,
          name: d.name || d.fileName || doc.id,
          url: d.url,
          thumbnailUrl: d.thumbnailUrl || null,
          chapterId: d.chapterId || null,
        });
      }
    });
  } catch {
    // subcollection legacy assente
  }

  return result;
}

/** Capitoli della galleria (array `chapters` sul documento galleria). */
export async function loadGalleryChapters(galleryId: string): Promise<PhotobookGalleryChapter[]> {
  try {
    const doc = await db.collection('galleries').doc(galleryId).get();
    if (!doc.exists) return [];
    const raw = doc.data()?.chapters;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c: any) => c && typeof c.id === 'string' && typeof c.titolo === 'string')
      .map((c: any) => ({
        id: c.id,
        titolo: c.titolo,
        ordine: typeof c.ordine === 'number' ? c.ordine : 0,
      }))
      .sort((a, b) => a.ordine - b.ordine);
  } catch {
    return [];
  }
}

/** Subset sicuro delle foto galleria per il client fotolibro. */
export async function listGalleryPhotosPublic(galleryId: string): Promise<PhotobookGalleryPhoto[]> {
  const docs = await loadGalleryPhotoDocs(galleryId);
  return docs.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    thumbnailUrl: p.thumbnailUrl || null,
    chapterId: p.chapterId || null,
  }));
}
