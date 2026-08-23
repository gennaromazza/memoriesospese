import express, { type NextFunction, type Request, type Response } from 'express';
import { db, FieldValue } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';
import type {
  PublicWeddingStory,
  WeddingSeoStory,
  WeddingStoryPhoto,
  WeddingStorySource,
  WeddingStoryStatus,
  WeddingStoryVendor,
} from '../shared/wedding-seo-types.js';
import type { InfoFormField } from '../shared/info-form-types.js';

const router = express.Router();
const STORIES_COL = 'weddingSeoStories';
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];
const MAX_PHOTOS = 24;
const MAX_SOURCES = 40;

function requireAdmin(req: any, res: Response, next: NextFunction) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

export function slugifyWeddingStory(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function isWeddingGallery(data: Record<string, any>): boolean {
  const kind = String(data.jobType || '').trim().toLowerCase();
  return kind === 'matrimonio' || kind === 'wedding';
}

function jsonTimestamp(value: any): string | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function storyFromDocument(id: string, data: Record<string, any>): WeddingSeoStory {
  return {
    id,
    galleryId: data.galleryId || id,
    jobId: data.jobId || '',
    status: data.status === 'published' ? 'published' : 'draft',
    slug: data.slug || '',
    title: data.title || '',
    excerpt: data.excerpt || '',
    story: data.story || '',
    seoTitle: data.seoTitle || '',
    seoDescription: data.seoDescription || '',
    selectedPhotoIds: Array.isArray(data.selectedPhotoIds) ? data.selectedPhotoIds : [],
    approvedSourceIds: Array.isArray(data.approvedSourceIds) ? data.approvedSourceIds : [],
    createdAt: jsonTimestamp(data.createdAt),
    updatedAt: jsonTimestamp(data.updatedAt),
    publishedAt: jsonTimestamp(data.publishedAt),
  };
}

function sourceValueIsPresent(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(sourceValueIsPresent);
  return true;
}

export function buildAuthorizedSources(submissions: Array<{ id: string; data: Record<string, any> }>): WeddingStorySource[] {
  const sources: WeddingStorySource[] = [];
  for (const submission of submissions) {
    const fields: InfoFormField[] = Array.isArray(submission.data.templateFields)
      ? submission.data.templateFields
      : [];
    const answers = submission.data.answers && typeof submission.data.answers === 'object'
      ? submission.data.answers
      : {};
    const consentGranted = submission.data.editorialConsent === true;
    for (const field of fields) {
      if (!field?.editorialUse) continue;
      const value = answers[field.id];
      if (!sourceValueIsPresent(value)) continue;
      sources.push({
        id: `${submission.id}:${field.id}`,
        submissionId: submission.id,
        fieldId: field.id,
        label: field.label,
        value: consentGranted ? value : undefined,
        clientName: submission.data.clientName || 'Cliente',
        category: field.editorialCategory === 'vendor' || field.type === 'vendor' ? 'vendor' : 'story',
        consentGranted,
      });
    }
  }
  return sources;
}

async function loadGallery(galleryId: string) {
  const snapshot = await db.collection('galleries').doc(galleryId).get();
  if (!snapshot.exists) return null;
  return { id: snapshot.id, ...snapshot.data()! } as Record<string, any> & { id: string };
}

async function loadSourcesForJob(jobId?: string): Promise<WeddingStorySource[]> {
  if (!jobId) return [];
  const snapshot = await db.collection('infoFormSubmissions').where('jobId', '==', jobId).get();
  const completed = snapshot.docs
    .map(document => ({ id: document.id, data: document.data() }))
    .filter(item => item.data.status === 'completed');
  return buildAuthorizedSources(completed);
}

async function uniqueSlug(requested: string, galleryId: string): Promise<string> {
  const base = slugifyWeddingStory(requested) || `matrimonio-${galleryId.slice(0, 8)}`;
  const snap = await db.collection(STORIES_COL).where('slug', '==', base).limit(2).get();
  const conflict = snap.docs.some(document => document.id !== galleryId);
  return conflict ? `${base}-${galleryId.slice(0, 6).toLowerCase()}` : base;
}

function safeString(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

export function validateWeddingStoryInput(body: Record<string, any>, publish: boolean) {
  const title = safeString(body.title, 140);
  const story = safeString(body.story, 30_000);
  const excerpt = safeString(body.excerpt, 500);
  const seoTitle = safeString(body.seoTitle, 70);
  const seoDescription = safeString(body.seoDescription, 170);
  const selectedPhotoIds = [...new Set(Array.isArray(body.selectedPhotoIds) ? body.selectedPhotoIds.map(String) : [])]
    .slice(0, MAX_PHOTOS);
  const approvedSourceIds = [...new Set(Array.isArray(body.approvedSourceIds) ? body.approvedSourceIds.map(String) : [])]
    .slice(0, MAX_SOURCES);

  if (!title) throw new Error('Inserisci un titolo per la storia.');
  if (!story) throw new Error('Il campo Racconto non può essere vuoto.');
  if (publish && story.length < 250) throw new Error('Il racconto è troppo breve per la pubblicazione.');
  if (publish && selectedPhotoIds.length === 0) throw new Error('Seleziona almeno una fotografia prima di pubblicare.');

  return { title, story, excerpt, seoTitle, seoDescription, selectedPhotoIds, approvedSourceIds };
}

export function buildGroqPrompt(params: {
  gallery: Record<string, any>;
  sources: WeddingStorySource[];
  photos: Array<Record<string, any>>;
}): string {
  const sourcePayload = params.sources.map(source => ({
    label: source.label,
    category: source.category,
    value: source.value,
  }));
  const photoPayload = params.photos.map(photo => ({
    chapter: photo.chapterTitle || '',
  }));
  const facts = {
    coupleOrGalleryName: params.gallery.name || '',
    date: params.gallery.date || '',
    location: params.gallery.location || '',
  };

  return `Sei un editor italiano specializzato in reportage di matrimonio.\n` +
    `Scrivi esclusivamente usando i FATTI, le RISPOSTE AUTORIZZATE e le SEZIONI FOTOGRAFICHE qui sotto.\n` +
    `Non inventare nomi, luoghi, emozioni, eventi, rapporti, fornitori o citazioni. ` +
    `Non citare note interne, ID, nomi file o il processo di generazione. ` +
    `Evita frasi generiche, superlativi non verificabili e keyword stuffing. ` +
    `Se un dettaglio manca, omettilo. Il testo resta una bozza privata e non deve dichiararsi pubblicato.\n\n` +
    `FATTI: ${JSON.stringify(facts)}\n` +
    `RISPOSTE AUTORIZZATE: ${JSON.stringify(sourcePayload)}\n` +
    `SEZIONI FOTOGRAFICHE: ${JSON.stringify(photoPayload)}\n\n` +
    `Restituisci solo JSON valido con: title (max 140), excerpt (max 300), ` +
    `story (900-1500 parole, 4-6 sezioni con titoli Markdown ##), seoTitle (max 60), ` +
    `seoDescription (max 155). Mantieni un tono specifico, sobrio e leggibile.`;
}

function parseGroqJson(raw: string): Record<string, any> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object') throw new Error('Risposta IA non valida');
  return parsed;
}

async function loadSelectedPhotos(gallery: Record<string, any>, photoIds: string[]): Promise<Array<Record<string, any>>> {
  const chapters = new Map<string, string>(
    (Array.isArray(gallery.chapters) ? gallery.chapters : []).map((chapter: any) => [chapter.id, chapter.titolo || '']),
  );
  const photos = await Promise.all(photoIds.slice(0, MAX_PHOTOS).map(async id => {
    const isLegacy = id.startsWith('legacy-');
    const document = isLegacy
      ? await db.collection('galleries').doc(gallery.id).collection('photos').doc(id.slice('legacy-'.length)).get()
      : await db.collection('photos').doc(id).get();
    if (!document.exists) return null;
    const data = document.data()!;
    if (!isLegacy && data.galleryId !== gallery.id) return null;
    return { id, ...data, galleryId: gallery.id, chapterTitle: chapters.get(data.chapterId) || '' };
  }));
  return photos.filter(Boolean) as Array<Record<string, any>>;
}

export function toPublicWeddingStory(
  story: WeddingSeoStory,
  photos: WeddingStoryPhoto[],
  vendors: WeddingStoryVendor[] = [],
): PublicWeddingStory {
  return {
    slug: story.slug,
    title: story.title,
    excerpt: story.excerpt,
    story: story.story,
    seoTitle: story.seoTitle,
    seoDescription: story.seoDescription,
    publishedAt: story.publishedAt,
    photos,
    vendors,
  };
}

router.get('/public/:slug', async (req: Request, res: Response) => {
  try {
    const slug = slugifyWeddingStory(req.params.slug || '');
    const snap = await db.collection(STORIES_COL)
      .where('slug', '==', slug)
      .get();
    const document = snap.docs.find(item => item.data().status === 'published');
    if (!document) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.status(404).json({ error: 'Storia non trovata' });
    }
    const story = storyFromDocument(document.id, document.data());
    const gallery = await loadGallery(story.galleryId);
    if (!gallery) return res.status(404).json({ error: 'Galleria non trovata' });
    const photos = await loadSelectedPhotos(gallery, story.selectedPhotoIds);
    const publicPhotos: WeddingStoryPhoto[] = photos.map(photo => ({
      id: photo.id,
      name: photo.name || '',
      url: photo.url || '',
      thumbnailUrl: photo.thumbnailUrl || undefined,
      chapterId: photo.chapterId || null,
      chapterTitle: photo.chapterTitle || undefined,
    }));
    const approvedIds = new Set(story.approvedSourceIds);
    const authorizedSources = await loadSourcesForJob(story.jobId);
    const vendors: WeddingStoryVendor[] = authorizedSources
      .filter(source => approvedIds.has(source.id) && source.consentGranted && source.category === 'vendor')
      .map(source => {
        const value = source.value && typeof source.value === 'object' ? source.value as Record<string, unknown> : {};
        const rawUrl = safeString(value.url, 500);
        let url: string | undefined;
        try {
          const parsed = new URL(rawUrl);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed.toString();
        } catch { /* link facoltativo non valido: viene omesso */ }
        return { name: safeString(value.name, 120), role: safeString(value.role, 120), url };
      })
      .filter(vendor => vendor.name && vendor.role);
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return res.json(toPublicWeddingStory(story, publicPhotos, vendors));
  } catch (error) {
    console.error('[wedding-seo] public story:', error);
    return res.status(500).json({ error: 'Impossibile caricare la storia' });
  }
});

router.use(authenticateFirebase, requireAdmin);

router.get('/gallery/:galleryId', async (req: Request, res: Response) => {
  try {
    const gallery = await loadGallery(req.params.galleryId);
    if (!gallery) return res.status(404).json({ error: 'Galleria non trovata' });
    if (!isWeddingGallery(gallery)) return res.status(400).json({ error: 'La Storia Real Wedding è disponibile solo per gallerie matrimonio.' });
    const storyDocument = await db.collection(STORIES_COL).doc(gallery.id).get();
    const story = storyDocument.exists ? storyFromDocument(storyDocument.id, storyDocument.data()!) : null;
    const sources = await loadSourcesForJob(gallery.jobId);
    return res.json({
      story,
      gallery: {
        id: gallery.id,
        name: gallery.name || '',
        date: gallery.date || '',
        location: gallery.location || '',
        jobId: gallery.jobId || undefined,
        jobType: gallery.jobType || undefined,
      },
      sources,
      warning: gallery.jobId ? undefined : 'Questa galleria non è associata a un Job: nessuna risposta dei Moduli Informativi verrà mostrata.',
    });
  } catch (error) {
    console.error('[wedding-seo] editor context:', error);
    return res.status(500).json({ error: 'Impossibile caricare l’editor Real Wedding.' });
  }
});

router.put('/gallery/:galleryId', async (req: Request, res: Response) => {
  try {
    const gallery = await loadGallery(req.params.galleryId);
    if (!gallery) return res.status(404).json({ error: 'Galleria non trovata' });
    if (!isWeddingGallery(gallery)) return res.status(400).json({ error: 'Questa non è una galleria matrimonio.' });
    const status: WeddingStoryStatus = req.body?.status === 'published' ? 'published' : 'draft';
    const input = validateWeddingStoryInput(req.body || {}, status === 'published');
    const availableSources = await loadSourcesForJob(gallery.jobId);
    const allowedIds = new Set(availableSources.filter(source => source.consentGranted).map(source => source.id));
    const unauthorized = input.approvedSourceIds.filter(id => !allowedIds.has(id));
    if (unauthorized.length > 0) {
      return res.status(400).json({ error: 'Una o più risposte non hanno il consenso editoriale necessario.' });
    }
    const photos = await loadSelectedPhotos(gallery, input.selectedPhotoIds);
    if (photos.length !== input.selectedPhotoIds.length) {
      return res.status(400).json({ error: 'Una o più fotografie selezionate non appartengono alla galleria.' });
    }
    const slug = await uniqueSlug(req.body?.slug || input.title, gallery.id);
    const ref = db.collection(STORIES_COL).doc(gallery.id);
    const previous = await ref.get();
    const payload: Record<string, any> = {
      galleryId: gallery.id,
      jobId: gallery.jobId || '',
      status,
      slug,
      ...input,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: (req as any).user?.email || '',
    };
    if (!previous.exists) payload.createdAt = FieldValue.serverTimestamp();
    if (status === 'published') {
      payload.publishedAt = previous.data()?.publishedAt || FieldValue.serverTimestamp();
    } else if (previous.data()?.status === 'published') {
      payload.unpublishedAt = FieldValue.serverTimestamp();
      payload.publishedAt = FieldValue.delete();
    }
    await ref.set(payload, { merge: true });
    const saved = await ref.get();
    return res.json({ ok: true, story: storyFromDocument(saved.id, saved.data()!) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Salvataggio non riuscito.';
    console.error('[wedding-seo] save:', error);
    return res.status(400).json({ error: message });
  }
});

router.post('/gallery/:galleryId/generate', async (req: Request, res: Response) => {
  try {
    const gallery = await loadGallery(req.params.galleryId);
    if (!gallery) return res.status(404).json({ error: 'Galleria non trovata' });
    if (!isWeddingGallery(gallery)) return res.status(400).json({ error: 'Questa non è una galleria matrimonio.' });
    const selectedSourceIds: string[] = Array.from(new Set<string>(
      Array.isArray(req.body?.selectedSourceIds) ? req.body.selectedSourceIds.map((value: unknown) => String(value)) : [],
    )).slice(0, MAX_SOURCES);
    const selectedPhotoIds: string[] = Array.from(new Set<string>(
      Array.isArray(req.body?.selectedPhotoIds) ? req.body.selectedPhotoIds.map((value: unknown) => String(value)) : [],
    )).slice(0, MAX_PHOTOS);
    const availableSources = await loadSourcesForJob(gallery.jobId);
    const sourceMap = new Map(availableSources.filter(source => source.consentGranted).map(source => [source.id, source]));
    const sources = selectedSourceIds.map(id => sourceMap.get(id)).filter(Boolean) as WeddingStorySource[];
    if (sources.length !== selectedSourceIds.length) {
      return res.status(400).json({ error: 'Sono state selezionate risposte prive di consenso editoriale.' });
    }
    const photos = await loadSelectedPhotos(gallery, selectedPhotoIds);
    if (photos.length !== selectedPhotoIds.length) {
      return res.status(400).json({ error: 'La selezione contiene fotografie non valide.' });
    }
    if (sources.length === 0 && photos.length === 0) {
      return res.status(400).json({ error: 'Seleziona almeno una risposta autorizzata o una fotografia.' });
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'GROQ_API_KEY non configurata: puoi comunque scrivere e salvare la bozza manualmente.' });
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: buildGroqPrompt({ gallery, sources, photos }) }],
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('[wedding-seo] Groq:', response.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'La generazione IA non è riuscita. La bozza corrente è rimasta invariata.' });
    }
    const completion: any = await response.json();
    const generated = parseGroqJson(completion?.choices?.[0]?.message?.content || '');
    return res.json({
      draft: {
        title: safeString(generated.title, 140),
        excerpt: safeString(generated.excerpt, 500),
        story: safeString(generated.story, 30_000),
        seoTitle: safeString(generated.seoTitle, 70),
        seoDescription: safeString(generated.seoDescription, 170),
      },
    });
  } catch (error) {
    console.error('[wedding-seo] generate:', error);
    return res.status(500).json({ error: 'La generazione IA non è riuscita. La bozza corrente è rimasta invariata.' });
  }
});

export default router;
