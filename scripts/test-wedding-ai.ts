import { deleteApp } from 'firebase-admin/app';
import { app, db } from '../server/firebase-admin.js';
import {
  generateWeddingDraftWithOpenRouter,
  loadGallery,
  loadSelectedPhotos,
  loadSourcesForJob,
  loadWeddingEditorialJobFacts,
} from '../server/wedding-seo.js';

const DEFAULT_PHOTO_SAMPLE = 12;

function galleryIdFromInput(raw: string): string {
  const input = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!input) throw new Error('Inserisci il link della galleria oppure il suo ID.');
  try {
    const url = new URL(input);
    const adminMatch = url.pathname.match(/\/admin\/gallery\/([^/]+)(?:\/manage)?/i);
    const galleryMatch = url.pathname.match(/\/gallery\/([^/]+)/i);
    const id = adminMatch?.[1] || galleryMatch?.[1] || url.searchParams.get('galleryId');
    if (id) return decodeURIComponent(id);
  } catch { /* l'argomento può essere direttamente un ID */ }
  if (/^[^/?#\s]+$/.test(input)) return decodeURIComponent(input);
  throw new Error('Link galleria non riconosciuto. Usa il link /admin/gallery/ID/manage oppure l’ID della galleria.');
}

function idsFromGallerySelection(gallery: Record<string, any>): string[] {
  const direct = Array.isArray(gallery.selectedPhotoIds) ? gallery.selectedPhotoIds.map(String) : [];
  const assigned = gallery.photoAssignments && typeof gallery.photoAssignments === 'object'
    ? Object.entries(gallery.photoAssignments)
      .filter(([, assignments]) => Array.isArray(assignments) && assignments.length > 0)
      .map(([photoId]) => photoId)
    : [];
  return [...new Set([...direct, ...assigned])];
}

async function automaticPhotoIds(gallery: Record<string, any>): Promise<{ ids: string[]; origin: string }> {
  const story = await db.collection('weddingSeoStories').doc(gallery.id).get();
  const storyIds = story.exists && Array.isArray(story.data()?.selectedPhotoIds)
    ? story.data()!.selectedPhotoIds.map(String)
    : [];
  if (storyIds.length > 0) return { ids: storyIds.slice(0, 24), origin: 'bozza Real Wedding' };

  const selectedIds = idsFromGallerySelection(gallery);
  if (selectedIds.length > 0) return { ids: selectedIds.slice(0, 24), origin: 'selezione cliente' };

  const modern = await db.collection('photos').where('galleryId', '==', gallery.id).limit(DEFAULT_PHOTO_SAMPLE).get();
  if (!modern.empty) return { ids: modern.docs.map(document => document.id), origin: 'campione automatico' };

  const legacy = await db.collection('galleries').doc(gallery.id).collection('photos').limit(DEFAULT_PHOTO_SAMPLE).get();
  return {
    ids: legacy.docs.map(document => `legacy-${document.id}`),
    origin: 'campione automatico legacy',
  };
}

function printDraft(draft: Awaited<ReturnType<typeof generateWeddingDraftWithOpenRouter>>) {
  console.log('\n=== TITOLO ===\n');
  console.log(draft.title);
  console.log('\n=== INTRODUZIONE ===\n');
  console.log(draft.excerpt);
  console.log('\n=== RACCONTO ===\n');
  console.log(draft.story);
  console.log('\n=== SEO TITLE ===\n');
  console.log(draft.seoTitle);
  console.log('\n=== SEO DESCRIPTION ===\n');
  console.log(draft.seoDescription);
}

async function main() {
  const galleryId = galleryIdFromInput(process.argv[2] || '');
  const gallery = await loadGallery(galleryId);
  if (!gallery) throw new Error(`Galleria non trovata: ${galleryId}`);
  const jobType = String(gallery.jobType || '').trim().toLowerCase();
  if (jobType !== 'matrimonio' && jobType !== 'wedding') {
    throw new Error('La generazione Real Wedding è disponibile solo per una galleria matrimonio.');
  }

  const allSources = await loadSourcesForJob(gallery.jobId, { includeLegacy: true });
  const sources = allSources.filter(source => source.consentGranted).slice(0, 40);
  const automaticPhotos = await automaticPhotoIds(gallery);
  const photos = await loadSelectedPhotos(gallery, automaticPhotos.ids);
  if (sources.length === 0 && photos.length === 0) {
    throw new Error('La galleria non contiene risposte autorizzate né fotografie utilizzabili.');
  }
  const jobFacts = await loadWeddingEditorialJobFacts(gallery.jobId);

  console.log(`Galleria: ${gallery.name || gallery.id} (${gallery.id})`);
  console.log(`Risposte autorizzate incluse automaticamente: ${sources.length}`);
  console.log(`Fotografie incluse: ${photos.length} (${automaticPhotos.origin})`);
  console.log('Modalità prova: nessun salvataggio e nessuna pubblicazione.');
  console.log('\nGenerazione in corso...');

  const draft = await generateWeddingDraftWithOpenRouter({ gallery, sources, photos, jobFacts });
  printDraft(draft);
}

main()
  .catch(error => {
    console.error('\nPROVA NON RIUSCITA:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await deleteApp(app).catch(() => undefined);
  });
