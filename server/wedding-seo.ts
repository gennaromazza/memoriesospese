import express, { type NextFunction, type Request, type Response } from 'express';
import { db, FieldValue } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';
import type {
  PublicWeddingStory,
  WeddingEditorialJobFacts,
  WeddingSeoStory,
  WeddingStoryPhoto,
  WeddingStorySource,
  WeddingStoryStatus,
  WeddingStoryVendor,
} from '../shared/wedding-seo-types.js';
import { WEDDING_STORY_LIMITS } from '../shared/wedding-seo-types.js';
import type { InfoFormField } from '../shared/info-form-types.js';

const router = express.Router();
const STORIES_COL = 'weddingSeoStories';
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];
const MAX_PHOTOS = 24;
const MAX_SOURCES = 40;
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_MODELS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'dots-studio/dots-3-note-preview:free',
  'stealth/ox-alpha',
  'openrouter/free',
] as const;
export const OPENROUTER_MODEL = OPENROUTER_MODELS[0];
const OPENROUTER_TITLE = 'Image Studio Real Wedding';

type OpenRouterMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

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

export function buildAuthorizedSources(
  submissions: Array<{ id: string; data: Record<string, any> }>,
  options: { includeLegacy?: boolean } = {},
): WeddingStorySource[] {
  const sources: WeddingStorySource[] = [];
  for (const submission of submissions) {
    const fields: InfoFormField[] = Array.isArray(submission.data.templateFields)
      ? submission.data.templateFields
      : [];
    const answers = submission.data.answers && typeof submission.data.answers === 'object'
      ? submission.data.answers
      : {};
    const explicitEditorialMetadata = fields.some(field => (
      typeof field?.editorialUse === 'boolean' || typeof field?.editorialCategory === 'string'
    ));
    const legacyImported = options.includeLegacy === true && !explicitEditorialMetadata;
    const consentGranted = submission.data.editorialConsent === true || legacyImported;
    const candidateFields = legacyImported ? fields : fields.filter(field => field?.editorialUse);
    for (const field of candidateFields) {
      const value = answers[field.id];
      if (!sourceValueIsPresent(value)) continue;
      sources.push({
        id: `${submission.id}:${field.id}`,
        submissionId: submission.id,
        fieldId: field.id,
        label: field.label,
        value: consentGranted ? value : undefined,
        clientName: submission.data.clientName || 'Cliente',
        category: field.editorialCategory === 'vendor' || field.type === 'vendor' || /\bfornitor[ei]\b/i.test(field.label || '') ? 'vendor' : 'story',
        consentGranted,
        legacyImported: legacyImported || undefined,
      });
    }
  }
  return sources;
}

export async function loadGallery(galleryIdOrCode: string) {
  const galleries = db.collection('galleries');
  const snapshot = await galleries.doc(galleryIdOrCode).get();
  if (snapshot.exists) {
    return { id: snapshot.id, ...snapshot.data()! } as Record<string, any> & { id: string };
  }
  const codes = [...new Set([galleryIdOrCode, galleryIdOrCode.toUpperCase()])];
  for (const code of codes) {
    const byCode = await galleries.where('code', '==', code).limit(1).get();
    const document = byCode.docs[0];
    if (document) {
      return { id: document.id, ...document.data() } as Record<string, any> & { id: string };
    }
  }
  return null;
}

export async function loadSourcesForJob(jobId?: string, options: { includeLegacy?: boolean } = {}): Promise<WeddingStorySource[]> {
  if (!jobId) return [];
  const snapshot = await db.collection('infoFormSubmissions').where('jobId', '==', jobId).get();
  const completed = snapshot.docs
    .map(document => ({ id: document.id, data: document.data() }))
    .filter(item => item.data.status === 'completed');
  return buildAuthorizedSources(completed, options);
}

function uniqueNonEmpty(values: unknown[]): string[] {
  return [...new Set(values.map(value => safeString(value, 120)).filter(Boolean))];
}

function editorialDate(value: any): string | undefined {
  const date = typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null;
  if (date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return safeString(value, 30) || undefined;
}

export function sanitizeEditorialPlace(value: unknown): { venue?: string; city?: string } {
  const raw = safeString(value, 220).replace(/\s+/g, ' ');
  if (!raw) return {};
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
  const street = /\b(?:via|viale|corso|piazza|strada|contrada|vicolo|largo|civico)\b/i;
  const cleanParts = parts.filter(part => !street.test(part) && !/\b\d{5}\b/.test(part) && !/\b\d{1,4}\s*[a-z]?\b/i.test(part));
  const suffix = raw.match(/\b(?:ad|a|di)\s+([A-ZÀ-ÖØ-Ý][\p{L}' -]{1,60})$/u)?.[1]?.trim();
  const lastClean = cleanParts.at(-1);
  const city = suffix || (parts.length > 1 && lastClean && !/\d/.test(lastClean) ? lastClean : undefined);
  const venue = cleanParts[0] && cleanParts[0] !== city ? cleanParts[0] : undefined;
  return { venue: venue || undefined, city: city || undefined };
}

export function buildWeddingEditorialJobFacts(job: Record<string, any>, clients: Array<Record<string, any>>): WeddingEditorialJobFacts {
  const reception = sanitizeEditorialPlace(job.eventLocation);
  const ceremony = sanitizeEditorialPlace(job.rituLocation || job.locationCerimonia);
  const eventPlace = job.eventPlace && typeof job.eventPlace === 'object' ? job.eventPlace : {};
  const ceremonyPlace = job.ceremonyPlace && typeof job.ceremonyPlace === 'object' ? job.ceremonyPlace : {};
  return {
    coupleNames: uniqueNonEmpty(clients.map(client => `${safeString(client.nome, 60)} ${safeString(client.cognome, 60)}`)),
    eventName: safeString(job.nomeEvento, 140) || undefined,
    eventDate: editorialDate(job.eventDate),
    receptionVenue: safeString(eventPlace.name, 160) || reception.venue,
    receptionCity: safeString(eventPlace.city, 100) || reception.city,
    receptionProvince: safeString(eventPlace.province, 80) || undefined,
    receptionPlaceType: safeString(eventPlace.primaryType, 120) || undefined,
    ceremonyVenue: safeString(ceremonyPlace.name, 160) || ceremony.venue,
    ceremonyCity: safeString(ceremonyPlace.city, 100) || ceremony.city,
    ceremonyProvince: safeString(ceremonyPlace.province, 80) || undefined,
    ceremonyPlaceType: safeString(ceremonyPlace.primaryType, 120) || undefined,
    clientCities: uniqueNonEmpty(clients.map(client => client.citta)),
  };
}

export async function loadWeddingEditorialJobFacts(jobId?: string): Promise<WeddingEditorialJobFacts | null> {
  if (!jobId) return null;
  const snapshot = await db.collection('jobs').doc(jobId).get();
  if (!snapshot.exists) return null;
  const job = snapshot.data() || {};
  const ids = uniqueNonEmpty([...(Array.isArray(job.clientiIds) ? job.clientiIds : []), job.clienteId]);
  const clients = await Promise.all(ids.map(async id => {
    const client = await db.collection('clienti').doc(id).get();
    return client.exists ? client.data() || {} : {};
  }));
  return buildWeddingEditorialJobFacts(job, clients);
}

function promptSourcePayload(sources: WeddingStorySource[]): Array<{
  label: string;
  category: 'story' | 'vendor';
  value: unknown;
}> {
  const sensitive = /\b(?:indirizzo|via|viale|corso|civico|telefono|cellulare|whatsapp|e-?mail|codice fiscale|partita iva|saldo|pagamento)\b/i;
  const payload: Array<{ label: string; category: 'story' | 'vendor'; value: unknown }> = [];
  for (const source of sources) {
    const serialized = JSON.stringify(source.value ?? '');
    if (sensitive.test(source.label) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized) || /\b(?:via|viale|corso|strada)\b[^\n,]{0,80}\d/i.test(serialized)) continue;
    if (source.category === 'vendor') {
      if (source.value && typeof source.value === 'object') {
        const vendor = source.value as Record<string, unknown>;
        payload.push({ label: 'Fornitore verificato', category: source.category, value: { name: safeString(vendor.name, 120), role: safeString(vendor.role, 120) } });
      } else {
        payload.push({ label: 'Elenco storico di fornitori; ruoli non verificati', category: source.category, value: { names: vendorNamesFromSource(source), rolesVerified: false } });
      }
      continue;
    }
    payload.push({ label: source.label, category: source.category, value: source.value });
  }
  return payload;
}

function vendorNamesFromSource(source: WeddingStorySource): string[] {
  if (source.category !== 'vendor') return [];
  if (source.value && typeof source.value === 'object' && !Array.isArray(source.value)) {
    return uniqueNonEmpty([(source.value as Record<string, unknown>).name]);
  }
  const raw = safeString(source.value, 600);
  if (!raw) return [];
  return uniqueNonEmpty(raw.split(/[,;\n]+/).map(name => name.replace(/^[-–•]\s*/, '').trim()));
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
  const title = safeString(body.title, WEDDING_STORY_LIMITS.title);
  const story = safeString(body.story, WEDDING_STORY_LIMITS.story);
  const excerpt = safeString(body.excerpt, WEDDING_STORY_LIMITS.excerpt);
  const seoTitle = safeString(body.seoTitle, WEDDING_STORY_LIMITS.seoTitle);
  const seoDescription = safeString(body.seoDescription, WEDDING_STORY_LIMITS.seoDescription);
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

export function buildWeddingStoryPrompt(params: {
  gallery: Record<string, any>;
  sources: WeddingStorySource[];
  photos: Array<Record<string, any>>;
  jobFacts?: WeddingEditorialJobFacts | null;
}): string {
  const sourcePayload = promptSourcePayload(params.sources);
  const photoPayload = params.photos.map(photo => ({
    chapter: photo.chapterTitle || '',
  }));
  const facts = params.jobFacts || {
    coupleOrGalleryName: params.gallery.name || '',
    date: params.gallery.date || '',
    location: params.gallery.location || '',
  };

  const vendors = sourcePayload.filter(source => source.category === 'vendor');
  const hasAuthorizedSources = sourcePayload.length > 0;
  const storyLength = hasAuthorizedSources ? '800-1200 parole, 4-6 sezioni' : '300-450 parole, 2-3 sezioni';

  return `Sei un editor italiano specializzato in reportage fotografici di matrimonio per il sito di un fotografo professionista.\n` +
    `Il committente è Image Studio, studio fotografico di Gennaro Mazzacane con sede ad Aversa e attivo nella fotografia di matrimonio in Campania. ` +
    `Queste informazioni di identità sono verificate e possono essere usate.\n` +
    `Scrivi esclusivamente usando i FATTI, le RISPOSTE AUTORIZZATE e le IMMAGINI REALI selezionate qui sotto.\n` +
    `Le fotografie sono prova soltanto di ciò che è visivamente osservabile: non usarle per inventare identità, nomi, relazioni, luoghi, ruoli o fatti non visibili.\n` +
    `Non inventare nomi, luoghi, emozioni, eventi, rapporti, fornitori o citazioni. ` +
    `Non dedurre informazioni dalla reputazione, dalla storia o dalla geografia di un luogo. ` +
    `Non attribuire mai un ruolo a un fornitore se il ruolo non è scritto esplicitamente. ` +
    `Non citare note interne, ID, nomi file, questionari, risposte autorizzate o il processo di generazione.\n` +
    `Non usare espressioni amministrative come “elenco storico”, “registrato”, “dato acquisito” o “fornitore presente”.\n` +
    `Scrivi come racconto successivo all'evento, usando passato prossimo e imperfetto. ` +
    `Non usare il futuro né formule da programma come “è previsto”, “sono previsti” o “avrà inizio”.\n` +
    `Tratta orari, numero degli ospiti, composizione familiare, richieste di scatto e indicazioni logistiche come contesto operativo: ` +
    `non trasformarli in una checklist e non usarli come riempitivo. Inseriscili soltanto quando migliorano davvero il racconto.\n` +
    `Le risposte al modulo descrivono desideri e indicazioni raccolti prima dell'evento, non provano che un fatto sia avvenuto. ` +
    `Non affermare che una foto sia stata realizzata, che una persona fosse presente o abbia svolto un'attività, se questo non è dichiarato esplicitamente. ` +
    `Le città dei clienti indicano soltanto la loro residenza: non attribuirle agli invitati. ` +
    `Per i fornitori storici con ruoli non verificati cita i nomi senza assegnare attività, prodotti o responsabilità. ` +
    `Presentali con una formula editoriale naturale e prudente, per esempio “Tra le realtà scelte dalla coppia figurano…”, senza sostenere che fossero presenti o cosa abbiano realizzato. ` +
    `Non descrivere costa, mare, spiaggia, panorama, architettura o interni di una location se tali caratteristiche non compaiono espressamente nelle fonti.\n` +
    `Se un dettaglio manca, omettilo in silenzio. Non scrivere mai “non è indicato”, “non sono forniti dettagli”, ` +
    `“dati disponibili”, “probabilmente” o “presumibilmente”. ` +
    `Non commentare ciò che non sai e non spiegare i limiti delle fonti.\n` +
    `Crea titoli di sezione specifici per questa coppia e questo matrimonio: evita intestazioni da dossier come ` +
    `“Preparativi”, “Cerimonia”, “Famiglia e Ospiti”, “Fornitori” e “Ricevimento”. ` +
    `Scrivi prosa continua, naturale e grammaticalmente corretta, senza elenchi, keyword stuffing, frasi generiche o superlativi non verificabili.\n` +
    `L'approccio deve essere chiaramente fotografico: costruisci il racconto come una sequenza visiva, collegando i momenti alle immagini reali selezionate. ` +
    `Parla di ritmo del reportage, passaggi della giornata, ritratti, gesti e dettagli quando sono visivamente osservabili o sostenuti dalle fonti testuali. ` +
    `Non identificare persone, luoghi o ruoli soltanto dalla fotografia e non trasformare ciò che vedi in affermazioni non verificabili. ` +
    `Dedica spazio alle location usando nome, comune, provincia e tipologia verificati da Google Places, ma non inventare luce, architettura, panorama, storia o atmosfera. ` +
    `Se le informazioni verificate sul luogo sono poche, descrivi il suo ruolo nel percorso fotografico della giornata senza aggiungere caratteristiche fisiche. ` +
    `Inserisci Image Studio una volta nel corpo del racconto e dedica la parte finale al punto di vista del fotografo: spiega in modo concreto come il reportage segue la continuità tra persone, luoghi e momenti documentati. ` +
    `La voce può passare alla prima persona plurale soltanto in questo breve passaggio sul metodo fotografico. Non usare slogan, autoelogi o inviti commerciali aggressivi. ` +
    `Per la SEO locale, usa in modo naturale “fotografo di matrimonio” insieme alla città della cerimonia o del ricevimento quando disponibile, senza ripetizioni artificiali. ` +
    `Il titolo, seoTitle e seoDescription devono contenere i nomi della coppia o della location e almeno un riferimento pertinente a fotografia, matrimonio e località. ` +
    `Evita finali generici con brindisi, luci che si spengono, promesse, sorrisi o emozioni se questi fatti non sono nelle fonti.\n\n` +
    `I DATI STRUTTURATI DEL JOB sono la fonte primaria per coppia, data, luogo della cerimonia, location e città. ` +
    `Le altre risposte sono materiale secondario e facoltativo: usa soltanto quelle che migliorano davvero l'articolo, senza riassumerle tutte. ` +
    `Eccezione obbligatoria: cita nel testo tutti i FORNITORI SELEZIONATI, usando esclusivamente il nome e il ruolo dichiarati.\n\n` +
    `DATI STRUTTURATI DEL JOB: ${JSON.stringify(facts)}\n` +
    `RISPOSTE SELEZIONATE: ${JSON.stringify(sourcePayload)}\n` +
    `FORNITORI SELEZIONATI DA CITARE SEMPRE: ${JSON.stringify(vendors)}\n` +
    `SEZIONI FOTOGRAFICHE: ${JSON.stringify(photoPayload)}\n\n` +
    `Restituisci solo JSON valido con: title (massimo ${WEDDING_STORY_LIMITS.title} caratteri), excerpt (massimo ${WEDDING_STORY_LIMITS.excerpt} caratteri), ` +
    `story (${storyLength} con titoli Markdown ##, massimo ${WEDDING_STORY_LIMITS.story} caratteri), seoTitle (massimo ${WEDDING_STORY_LIMITS.seoTitle} caratteri), ` +
    `seoDescription (massimo ${WEDDING_STORY_LIMITS.seoDescription} caratteri). Rispetta tassativamente tutti i limiti di caratteri. ` +
    `Il racconto deve sembrare un articolo fotografico ampio e finito, non un riepilogo del modulo. ` +
    (hasAuthorizedSources
      ? 'Ogni affermazione deve essere riconducibile ai dati disponibili.'
      : 'Non ci sono risposte autorizzate: limita il testo ai dati espliciti e ai titoli delle sezioni fotografiche. Non descrivere cerimonie, promesse, emozioni o dettagli della giornata non documentati.');
}

function imageDataUrl(value: string, contentType: unknown): string | null {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(trimmed)) return trimmed;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;
  const mimeType = typeof contentType === 'string' && /^image\/(?:png|jpeg|webp|gif)$/i.test(contentType)
    ? contentType.toLowerCase()
    : 'image/jpeg';
  return `data:${mimeType};base64,${trimmed}`;
}

export function buildOpenRouterMessageContent(
  prompt: string,
  photos: Array<Record<string, any>>,
): OpenRouterMessageContent[] {
  const imageParts = photos
    .map(photo => imageDataUrl(
      typeof photo.url === 'string' ? photo.url : typeof photo.imageUrl === 'string' ? photo.imageUrl : typeof photo.base64 === 'string' ? photo.base64 : '',
      photo.contentType,
    ))
    .filter((url): url is string => Boolean(url))
    .map(url => ({ type: 'image_url' as const, image_url: { url } }));
  return [{ type: 'text', text: prompt }, ...imageParts];
}

export function inspectWeddingDraftQuality(
  draft: Record<string, any>,
  requiredVendors: string[] = [],
  context: { allowedText?: string; unverifiedVendorNames?: string[]; minimumWords?: number; requiredBrand?: string } = {},
): string[] {
  const text = [draft.title, draft.excerpt, draft.story].map(value => String(value || '')).join('\n');
  const issues: string[] = [];
  const wordCount = String(draft.story || '').trim().split(/\s+/u).filter(Boolean).length;
  if (context.minimumWords && wordCount < context.minimumWords) {
    issues.push(`racconto troppo breve: ${wordCount} parole, minimo ${context.minimumWords}`);
  }
  if (context.requiredBrand && !text.toLocaleLowerCase('it').includes(context.requiredBrand.toLocaleLowerCase('it'))) {
    issues.push(`non valorizza il brand fotografico: ${context.requiredBrand}`);
  }
  const generatedFields: Array<[keyof typeof WEDDING_STORY_LIMITS, unknown, string]> = [
    ['title', draft.title, 'titolo'],
    ['excerpt', draft.excerpt, 'introduzione'],
    ['story', draft.story, 'racconto'],
    ['seoTitle', draft.seoTitle, 'titolo SEO'],
    ['seoDescription', draft.seoDescription, 'descrizione SEO'],
  ];
  for (const [field, value, label] of generatedFields) {
    const length = String(value || '').trim().length;
    if (length > WEDDING_STORY_LIMITS[field]) {
      issues.push(`${label} troppo lungo: ${length} caratteri, massimo ${WEDDING_STORY_LIMITS[field]}`);
    }
  }
  if (/\b(?:non (?:è|sono|risultano) (?:indicat[oi]|fornit[ei]|disponibil[ei])|non (?:sono|vengono) descritt[ei]|dati disponibili|risposte autorizzate|questionario)\b/i.test(text)) {
    issues.push('commenta informazioni mancanti o il processo editoriale');
  }
  if (/\b(?:probabilmente|presumibilmente|verosimilmente)\b/i.test(text)) {
    issues.push('contiene inferenze non verificabili');
  }
  if (/\b(?:elenco storico|registrat[oaie]|dato acquisito|fornitor[ei] present[ei])\b/i.test(text)) {
    issues.push('espone linguaggio amministrativo o interno');
  }
  if (/\b(?:sarà|saranno|avrà inizio|si prepareranno|è previsto|sono previsti)\b/i.test(text)) {
    issues.push('usa il futuro o un tono da programma operativo');
  }
  const genericHeadings = String(draft.story || '').match(/^##\s+(?:Preparativi|Cerimonia|Famiglia e Ospiti|Fornitori|Ricevimento)\s*$/gim) || [];
  if (genericHeadings.length >= 2) issues.push('usa intestazioni generiche da dossier');
  const missingVendors = requiredVendors.filter(name => name && !text.toLocaleLowerCase('it').includes(name.toLocaleLowerCase('it')));
  if (missingVendors.length > 0) issues.push(`non cita i fornitori selezionati: ${missingVendors.join(', ')}`);
  if (/\b(?:ospiti|invitati)\b[^.!?]{0,100}\bprovenient[ei]\s+da\b/i.test(text)) {
    issues.push('deduce la provenienza degli invitati dalle città dei clienti');
  }
  const allowedText = String(context.allowedText || '').toLocaleLowerCase('it');
  const unsupportedSetting = ['sulla costa', 'sulla spiaggia', 'vista sul mare', 'navata'].filter(detail =>
    text.toLocaleLowerCase('it').includes(detail) && !allowedText.includes(detail),
  );
  if (unsupportedSetting.length > 0) issues.push(`attribuisce caratteristiche non documentate alle location: ${unsupportedSetting.join(', ')}`);
  const unsupportedScenes = [
    'scambio di promesse', 'brindisi condiviso', 'le luci si sono spente', 'ricordi condivisi',
  ].filter(detail => text.toLocaleLowerCase('it').includes(detail) && !allowedText.includes(detail));
  if (unsupportedScenes.length > 0) issues.push(`aggiunge scene o conclusioni non documentate: ${unsupportedScenes.join(', ')}`);
  const roleWords = '(?:wedding planner|fior(?:aio|ista)|floral designer|abiti?|atelier|musica|musicisti|colonna sonora|coordinat[oa]|decorat[oa])';
  const attributed = (context.unverifiedVendorNames || []).filter(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:${escaped}[^.!?]{0,80}${roleWords}|${roleWords}[^.!?]{0,80}${escaped})`, 'i').test(text);
  });
  if (attributed.length > 0) issues.push(`attribuisce ruoli non verificati ai fornitori: ${attributed.join(', ')}`);
  return issues;
}

export function buildWeddingDraftRevisionPrompt(issues: string[]): string {
  return `La prima bozza è stata respinta dal controllo editoriale per questi motivi: ${issues.join('; ')}.\n` +
    `Riscrivila integralmente, non limitarti ad aggiungere un paragrafo. Mantieni esclusivamente i fatti forniti nel messaggio iniziale, ` +
    `correggi tutti i problemi indicati e rispetta tassativamente i limiti di ogni campo. ` +
    `Conserva il formato JSON richiesto e restituisci soltanto JSON valido.`;
}

function parseOpenRouterJson(raw: string): Record<string, any> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object') throw new Error('Risposta IA non valida');
  return parsed;
}

export async function loadSelectedPhotos(gallery: Record<string, any>, photoIds: string[]): Promise<Array<Record<string, any>>> {
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

export type WeddingAiDraft = Pick<WeddingSeoStory, 'title' | 'excerpt' | 'story' | 'seoTitle' | 'seoDescription'>;

export class WeddingAiGenerationError extends Error {
  constructor(message: string, public readonly httpStatus = 502) {
    super(message);
    this.name = 'WeddingAiGenerationError';
  }
}

export async function generateWeddingDraftWithOpenRouter(params: {
  gallery: Record<string, any>;
  sources: WeddingStorySource[];
  photos: Array<Record<string, any>>;
  jobFacts: WeddingEditorialJobFacts | null;
  apiKey?: string;
}): Promise<WeddingAiDraft> {
  const { gallery, sources, photos, jobFacts } = params;
  const apiKey = params.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new WeddingAiGenerationError(
      'OPENROUTER_API_KEY non configurata: puoi comunque scrivere e salvare la bozza manualmente.',
      503,
    );
  }
  const requiredVendors = sources.flatMap(vendorNamesFromSource);
  const unverifiedVendorNames = sources
    .filter(source => source.category === 'vendor' && (typeof source.value !== 'object' || Array.isArray(source.value)))
    .flatMap(vendorNamesFromSource);
  const qualityContext = {
    allowedText: JSON.stringify({ jobFacts, sources: promptSourcePayload(sources) }),
    unverifiedVendorNames,
    minimumWords: sources.length > 0 ? 700 : undefined,
    requiredBrand: 'Image Studio',
  };
  const messages: Array<{ role: 'user' | 'assistant'; content: string | OpenRouterMessageContent[] }> = [
    {
      role: 'user',
      content: buildOpenRouterMessageContent(buildWeddingStoryPrompt({ gallery, sources, photos, jobFacts }), photos),
    },
  ];
  let generated: Record<string, any> | null = null;
  let qualityIssues: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let completion: any;
    let lastProviderStatus: number | undefined;
    for (const model of OPENROUTER_MODELS) {
      try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.SITE_URL || 'https://imagestudiofotografico.com',
            'X-OpenRouter-Title': OPENROUTER_TITLE,
          },
          body: JSON.stringify({
            model,
            temperature: attempt === 1 ? 0.35 : 0.25,
            max_tokens: 6000,
            response_format: { type: 'json_object' },
            messages,
          }),
        });
        if (response.ok) {
          completion = await response.json();
          console.log(`[wedding-seo] Modello OpenRouter selezionato: ${model}`);
          break;
        }
        lastProviderStatus = response.status;
        console.error('[wedding-seo] OpenRouter:', model, response.status, (await response.text()).slice(0, 500));
        if (![404, 408, 429, 500, 502, 503, 504].includes(response.status)) {
          throw new WeddingAiGenerationError(
            `OpenRouter ha rifiutato la richiesta (HTTP ${response.status}). La bozza corrente è rimasta invariata.`,
          );
        }
      } catch (error) {
        if (error instanceof WeddingAiGenerationError) throw error;
        console.error('[wedding-seo] OpenRouter: request failed', model, error);
      }
    }
    if (!completion) {
      throw new WeddingAiGenerationError(
        `Nessun modello gratuito per analisi immagini è disponibile su OpenRouter (ultimo HTTP ${lastProviderStatus || 'di rete'}). La bozza corrente è rimasta invariata.`,
      );
    }
    const raw = completion?.choices?.[0]?.message?.content || '';
    generated = null;
    try {
      generated = parseOpenRouterJson(raw);
      qualityIssues = inspectWeddingDraftQuality(generated, requiredVendors, qualityContext);
    } catch (error) {
      qualityIssues = ['la risposta del modello non contiene JSON valido'];
      console.warn(`[wedding-seo] Tentativo ${attempt} con risposta non valida:`, error);
    }
    if (qualityIssues.length === 0) break;
    console.warn(`[wedding-seo] Tentativo ${attempt} rifiutato dal controllo editoriale:`, qualityIssues);
    if (attempt === 1) {
      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: buildWeddingDraftRevisionPrompt(qualityIssues) });
    }
  }
  if (!generated || qualityIssues.length > 0) {
    throw new WeddingAiGenerationError(
      `La bozza IA non ha superato il controllo editoriale dopo la correzione automatica (${qualityIssues.join('; ')}). Il testo corrente è rimasto invariato.`,
    );
  }
  return {
    title: safeString(generated.title, WEDDING_STORY_LIMITS.title),
    excerpt: safeString(generated.excerpt, WEDDING_STORY_LIMITS.excerpt),
    story: safeString(generated.story, WEDDING_STORY_LIMITS.story),
    seoTitle: safeString(generated.seoTitle, WEDDING_STORY_LIMITS.seoTitle),
    seoDescription: safeString(generated.seoDescription, WEDDING_STORY_LIMITS.seoDescription),
  };
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
      .flatMap(source => {
        if (!source.value || typeof source.value !== 'object' || Array.isArray(source.value)) {
          return vendorNamesFromSource(source).map(name => ({ name, role: 'Fornitore del matrimonio' }));
        }
        const value = source.value && typeof source.value === 'object' ? source.value as Record<string, unknown> : {};
        const rawUrl = safeString(value.url, 500);
        let url: string | undefined;
        try {
          const parsed = new URL(rawUrl);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed.toString();
        } catch { /* link facoltativo non valido: viene omesso */ }
        return [{ name: safeString(value.name, 120), role: safeString(value.role, 120) || 'Fornitore del matrimonio', url }];
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
    const sources = await loadSourcesForJob(gallery.jobId, { includeLegacy: true });
    const jobFacts = await loadWeddingEditorialJobFacts(gallery.jobId);
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
      jobFacts,
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
    const availableSources = await loadSourcesForJob(gallery.jobId, { includeLegacy: true });
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
    const availableSources = await loadSourcesForJob(gallery.jobId, { includeLegacy: true });
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
    const jobFacts = await loadWeddingEditorialJobFacts(gallery.jobId);
    const draft = await generateWeddingDraftWithOpenRouter({ gallery, sources, photos, jobFacts });
    return res.json({ draft });
  } catch (error) {
    console.error('[wedding-seo] generate:', error);
    if (error instanceof WeddingAiGenerationError) {
      return res.status(error.httpStatus).json({ error: error.message });
    }
    return res.status(500).json({ error: 'La generazione IA non è riuscita. La bozza corrente è rimasta invariata.' });
  }
});

export default router;
