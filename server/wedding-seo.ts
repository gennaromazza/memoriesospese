import express, { type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import { db, FieldValue } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';
import type {
  PublicWeddingStory,
  PublicWeddingStoryPreview,
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
const VENDOR_DIRECTORY_COL = 'weddingVendorDirectory';
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];
export const MAX_WEDDING_STORY_PHOTOS = 12;
const MIN_COMPACT_WEDDING_STORY_WORDS = 250;
export const MIN_ENRICHED_WEDDING_STORY_WORDS = 700;
export const MAX_WEDDING_DRAFT_ATTEMPTS = 3;
const TARGET_ENRICHED_WEDDING_STORY_WORDS = 900;
const MAX_SOURCES = 40;
const MAX_AI_IMAGE_BYTES = 12 * 1024 * 1024;
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const GEMINI_MODEL = 'gemini-3.5-flash';
const WEDDING_DRAFT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'wedding_story_draft',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'Titolo editoriale in italiano.' },
        excerpt: { type: 'string', description: 'Introduzione breve in italiano.' },
        story: { type: 'string', description: 'Articolo completo in italiano con titoli Markdown ##.' },
        seoTitle: { type: 'string', description: 'Titolo SEO in italiano.' },
        seoDescription: { type: 'string', description: 'Meta description SEO in italiano.' },
      },
      required: ['title', 'excerpt', 'story', 'seoTitle', 'seoDescription'],
    },
  },
} as const;

const WEDDING_VENDOR_TAXONOMY: Record<string, string> = {
  wedding_planner: 'wedding planner, event planner, organizzatore di matrimoni',
  wedding_coordinator: 'coordinatore del matrimonio, coordinatore del giorno, regia evento',
  destination_wedding_planner: 'destination wedding planner, travel wedding planner',
  event_designer: 'event designer, wedding designer, stylist, art director del matrimonio',
  celebrante: 'celebrante civile, simbolico o religioso, officiante, ministro di culto',
  consulenza_prematrimoniale: 'consulente prematrimoniale, wedding coach',
  location: 'villa, castello, dimora, tenuta, masseria, agriturismo, sala ricevimenti, beach club',
  ristorante_banchetti: 'ristorante, banqueting, sala banchetti',
  hotel_resort: 'hotel, resort, albergo, ospitalità per sposi e invitati',
  chiesa_luogo_cerimonia: 'chiesa, santuario, chiostro, comune, casa comunale, luogo della cerimonia',
  catering: 'catering, banqueting, chef, cucina per eventi',
  pasticceria_cake_designer: 'pasticceria, cake designer, torta nuziale, confettata, sweet table',
  beverage_open_bar: 'open bar, bartender, cocktail bar, beverage, cantina, vini, sommelier',
  food_experience: 'food truck, gelateria, caffetteria, live cooking, degustazioni',
  atelier_sposa: 'atelier sposa, abiti da sposa, bridal designer, bridal boutique',
  atelier_sposo: 'atelier sposo, abiti da sposo, sartoria uomo, formal wear',
  abiti_cerimonia: 'abiti da cerimonia, damigelle, paggetti, testimoni',
  sarta_modifiche: 'sarta, sarto, modifiche abito, personalizzazione abiti',
  scarpe_accessori: 'scarpe, velo, copricapo, lingerie, accessori sposa e sposo',
  gioielleria_fedi: 'gioielleria, oreficeria, fedi nuziali, accessori preziosi',
  makeup_artist: 'make-up artist, truccatore, trucco sposa',
  hair_stylist: 'parrucchiere, hair stylist, acconciatura sposa',
  barbiere_grooming: 'barbiere, grooming sposo',
  estetica_benessere: 'estetista, centro estetico, skincare, spa, benessere',
  nail_artist: 'onicotecnica, nail artist, manicure',
  fotografo: 'fotografo di matrimonio, studio fotografico',
  videomaker: 'videomaker, filmmaker, cinematografia di matrimonio',
  drone: 'operatore drone, riprese aeree',
  content_creator: 'wedding content creator, social content creator',
  live_artist: 'live painter, illustratore dal vivo, caricaturista, ritrattista',
  fiorista_floral_designer: 'fiorista, floral designer, bouquet, decorazioni floreali',
  allestimenti_scenografie: 'allestimenti, scenografie, decorazioni, backdrop, balloon artist',
  illuminazione_service: 'lighting designer, luminarie, service luci, audio e video',
  noleggio_arredi: 'noleggio arredi, tavoli, sedie, lounge, tovagliato, stoviglie',
  strutture_evento: 'tensostrutture, palchi, piste da ballo, coperture, generatori',
  segnaletica_wedding: 'segnaletica, tableau de mariage, seating chart, welcome sign',
  dj: 'dj, disc jockey, dj set',
  band_orchestra: 'band, orchestra, gruppo musicale',
  musicista_cantante: 'musicista, cantante, pianista, sassofonista, violinista, arpista',
  ensemble_coro: 'coro, quartetto d’archi, ensemble, musica per cerimonia',
  presentatore_intrattenitore: 'presentatore, master of ceremony, vocalist, intrattenitore',
  spettacolo_animazione: 'animazione, ballerini, performer, acrobati, mago, mentalista',
  effetti_speciali: 'fuochi d’artificio, fontane fredde, laser, spettacoli luminosi',
  photo_booth: 'photo booth, selfie mirror, selfie station, video booth, audio guestbook',
  animazione_bambini: 'animazione bambini, babysitter, tata, area kids',
  pet_care: 'dog sitter, pet sitter, wedding dog handler',
  partecipazioni_stationery: 'partecipazioni, inviti, save the date, wedding stationery',
  grafica_calligrafia: 'graphic designer, calligrafo, lettering, stampa coordinata',
  sito_web_matrimonio: 'sito web del matrimonio, inviti digitali, RSVP digitale',
  bomboniere_regali: 'bomboniere, cadeaux, regali invitati, welcome bag',
  noleggio_auto: 'auto sposi, limousine, auto d’epoca, supercar, conducente',
  carrozze_trasporti_speciali: 'carrozza, cavalli, moto, vespa, barca, yacht',
  navette_trasporti: 'navette, autobus, NCC, taxi, trasporto invitati',
  valet_parking: 'parcheggiatore, valet parking, gestione parcheggio',
  agenzia_viaggi: 'agenzia viaggi, viaggio di nozze, honeymoon planner',
  hospitality_concierge: 'concierge, accoglienza invitati, destination hospitality',
  hostess_steward: 'hostess, steward, personale di accoglienza',
  sicurezza_assistenza: 'sicurezza evento, assistenza sanitaria, primo soccorso',
  pulizie_logistica: 'pulizie, facchinaggio, montaggio, smontaggio, logistica evento',
  toilette_mobili: 'noleggio toilette mobili di lusso',
  meteo_evento: 'servizio meteorologico per eventi, meteorologo',
  assicurazione_evento: 'assicurazione matrimonio o evento',
  live_streaming: 'streaming della cerimonia, regia video live, proiezioni',
  altro_servizio_matrimonio: 'altro professionista o servizio con prove esplicite di attività nel settore matrimoniale',
};
const VENDOR_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const VENDOR_NEGATIVE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const VENDOR_LOOKUP_VERSION = 2;
const VENDOR_SEARCH_TIMEOUT_MS = 90_000;
const VENDOR_SEARCH_CONCURRENCY = 4;
const MAX_VENDOR_LOOKUPS_PER_STORY = 12;
const BLOCKED_VENDOR_HOSTS = [
  'google.com', 'matrimonio.com', 'zankyou.it', 'paginegialle.it',
  'tripadvisor.it', 'tripadvisor.com', 'yelp.com',
];

type WeddingVendorLookup = WeddingStoryVendor & {
  matched: boolean;
  confidence: number;
  sourceUrl?: string;
  checkedAt?: any;
};

type WeddingVendorSearchOutcome = {
  status: 'matched' | 'not_found' | 'technical_error';
  match?: WeddingVendorLookup;
};

type GeminiMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type WeddingDraftQualityContext = {
  allowedText?: string;
  unverifiedVendorNames?: string[];
  minimumWords?: number;
  requiredBrand?: string;
  privateCoupleNames?: string[];
  privateCoupleSurnames?: string[];
  hasChurchPhotoEvidence?: boolean;
};

type WeddingDraftRevisionOptions = {
  minimumWords?: number;
  targetWords?: number;
  unverifiedVendorNames?: string[];
  attempt?: number;
};

type PreparedGeminiPhoto = {
  content: Extract<GeminiMessageContent, { type: 'image_url' }>;
  photo: Record<string, any>;
};

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
    selectedPhotoIds: Array.isArray(data.selectedPhotoIds)
      ? [...new Set(data.selectedPhotoIds.map(String))].slice(0, MAX_WEDDING_STORY_PHOTOS)
      : [],
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

function italianList(values: string[]): string {
  if (values.length <= 1) return values[0] || '';
  return `${values.slice(0, -1).join(', ')} e ${values.at(-1)}`;
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
    coupleSurnames: uniqueNonEmpty(clients.map(client => client.cognome)),
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
        payload.push({ label: 'Nomi di fornitori selezionati; ruolo non dichiarato', category: source.category, value: { names: vendorNamesFromSource(source), rolesVerified: false } });
      }
      continue;
    }
    payload.push({ label: source.label, category: source.category, value: source.value });
  }
  return payload;
}

function buildWeddingEditorialPlan(sources: WeddingStorySource[], photoCount = 0) {
  const sourcePayload = promptSourcePayload(sources);
  const narrativeCharacters = sourcePayload
    .filter(source => source.category === 'story')
    .reduce((total, source) => total + JSON.stringify(source.value ?? '').length, 0);
  const enriched = photoCount >= 4
    || narrativeCharacters >= 300
    || (photoCount >= 2 && narrativeCharacters >= 120);
  return {
    sourcePayload,
    enriched,
    minimumWords: enriched ? MIN_ENRICHED_WEDDING_STORY_WORDS : MIN_COMPACT_WEDDING_STORY_WORDS,
    targetWords: enriched ? TARGET_ENRICHED_WEDDING_STORY_WORDS : 350,
    storyLength: enriched
      ? `${TARGET_ENRICHED_WEDDING_STORY_WORDS}-1200 parole (mai meno di 800), 5-7 sezioni`
      : '300-450 parole, 2-3 sezioni',
  };
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

function normalizedVendorName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function vendorCacheId(name: string): string {
  return normalizedVendorName(name).replace(/\s+/g, '-').slice(0, 120) || 'fornitore-senza-nome';
}

function validExternalVendorUrl(value: unknown): string | undefined {
  try {
    const parsed = new URL(safeString(value, 500));
    if (!['https:', 'http:'].includes(parsed.protocol)) return undefined;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (BLOCKED_VENDOR_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`))) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function sameCitedVendorDestination(candidate: string, citation: string): boolean {
  try {
    const left = new URL(candidate);
    const right = new URL(citation);
    const leftHost = left.hostname.toLowerCase().replace(/^www\./, '');
    const rightHost = right.hostname.toLowerCase().replace(/^www\./, '');
    if (leftHost !== rightHost) return false;
    const socialHosts = ['instagram.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'linkedin.com'];
    if (!socialHosts.includes(leftHost)) return true;
    const firstPathPart = (url: URL) => url.pathname.split('/').filter(Boolean)[0]?.toLowerCase() || '';
    return Boolean(firstPathPart(left)) && firstPathPart(left) === firstPathPart(right);
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<globalThis.Response> {
  const controller = new AbortController();
  // Un timer esplicito mantiene vivo anche lo script CLI mentre una richiesta è in attesa.
  const timer = setTimeout(() => controller.abort(new DOMException('Tempo massimo superato', 'TimeoutError')), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function validateWeddingVendorSearchResult(
  requestedName: string,
  result: Record<string, any>,
  citationUrls: string[],
): WeddingVendorLookup | null {
  if (result.matched !== true) return null;
  const category = safeString(result.category, 80);
  if (!Object.prototype.hasOwnProperty.call(WEDDING_VENDOR_TAXONOMY, category)) return null;
  const requestedTokens = normalizedVendorName(requestedName).split(' ').filter(token => token.length >= 3);
  const canonicalName = safeString(result.canonicalName, 120);
  const matchedNameEvidence = safeString(result.matchedNameEvidence, 240);
  const identityEvidence = normalizedVendorName(`${canonicalName} ${matchedNameEvidence}`);
  const minimumConfidence = requestedTokens.length <= 1 ? 0.92 : 0.84;
  if (Number(result.confidence) < minimumConfidence) return null;
  if (requestedTokens.length === 0 || !requestedTokens.every(token => identityEvidence.includes(token))) return null;
  const candidates = [result.officialUrl, result.socialUrl].map(validExternalVendorUrl).filter(Boolean) as string[];
  const url = candidates.find(candidate => citationUrls.some(citation => sameCitedVendorDestination(candidate, citation)));
  if (!url) return null;
  return {
    name: canonicalName || requestedName,
    role: safeString(result.role, 120) || WEDDING_VENDOR_TAXONOMY[category].split(',')[0],
    url,
    sourceUrl: citationUrls.find(citation => sameCitedVendorDestination(url, citation)),
    matched: true,
    confidence: Number(result.confidence),
  };
}

function cachedVendorIsFresh(data: Record<string, any>): boolean {
  if (Number(data.lookupVersion) !== VENDOR_LOOKUP_VERSION) return false;
  const checkedAt = typeof data.checkedAt?.toMillis === 'function'
    ? data.checkedAt.toMillis()
    : Date.parse(String(data.checkedAt || ''));
  if (!Number.isFinite(checkedAt)) return false;
  const ttl = data.matched ? VENDOR_CACHE_TTL_MS : VENDOR_NEGATIVE_CACHE_TTL_MS;
  return Date.now() - checkedAt < ttl;
}

async function loadCachedWeddingVendor(name: string): Promise<WeddingVendorLookup | null | undefined> {
  const snapshot = await db.collection(VENDOR_DIRECTORY_COL).doc(vendorCacheId(name)).get();
  if (!snapshot.exists) return undefined;
  const data = snapshot.data() || {};
  if (!cachedVendorIsFresh(data)) return undefined;
  if (!data.matched) return null;
  const url = validExternalVendorUrl(data.url);
  if (!url) return null;
  return {
    name: safeString(data.name, 120) || name,
    role: safeString(data.role, 120) || 'Fornitore del matrimonio',
    url,
    sourceUrl: validExternalVendorUrl(data.sourceUrl),
    matched: true,
    confidence: Number(data.confidence) || 0,
    checkedAt: data.checkedAt,
  };
}

async function searchWeddingVendor(
  name: string,
  jobFacts: WeddingEditorialJobFacts | null,
  apiKey: string,
): Promise<WeddingVendorSearchOutcome> {
  const locations = uniqueNonEmpty([
    jobFacts?.ceremonyCity, jobFacts?.receptionCity, ...(jobFacts?.clientCities || []),
  ]);
  const taxonomy = Object.entries(WEDDING_VENDOR_TAXONOMY)
    .map(([category, examples]) => `${category}: ${examples}`)
    .join('\n');
  const locationContext = locations.join(', ') || 'Campania, Italia';
  const prompt = `Verifica tramite Google Search se “${name}” identifica con alta certezza un'attività o professionista realmente operante nel settore dei matrimoni.\n` +
    `Contesto geografico prioritario: ${locationContext}. Prova ricerche con il nome esatto tra virgolette, le località e termini pertinenti come matrimonio, wedding, sposi e fornitori.\n` +
    `Il testo degli sposi può contenere il nome anagrafico del titolare mentre sito e social usano il nome commerciale. Verifica anche questa relazione e descrivila in matchedNameEvidence citando una fonte che colleghi esplicitamente persona e attività.\n` +
    `Cerca il sito ufficiale e, in alternativa, un profilo social ufficiale. Non usare directory, portali di recensioni o aggregatori come destinazione.\n` +
    `Non confondere omonimi. Per nomi brevi o generici richiedi prove esplicite dell'attività matrimoniale. Se il match non è univoco restituisci matched=false.\n` +
    `Categorie ammesse:\n${taxonomy}\n` +
    `Restituisci canonicalName, matchedNameEvidence, category, role, officialUrl, socialUrl, confidence tra 0 e 1 e matched. Gli URL devono appartenere all'attività verificata.`;
  let response: globalThis.Response;
  try {
    response = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: prompt,
      tools: [{ type: 'google_search' }],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            matched: { type: 'boolean' },
            canonicalName: { type: 'string' },
            matchedNameEvidence: { type: 'string' },
            category: { type: 'string', enum: Object.keys(WEDDING_VENDOR_TAXONOMY) },
            role: { type: 'string' },
            officialUrl: { type: 'string' },
            socialUrl: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['matched', 'canonicalName', 'matchedNameEvidence', 'category', 'role', 'officialUrl', 'socialUrl', 'confidence'],
        },
      },
    }),
    }, VENDOR_SEARCH_TIMEOUT_MS);
  } catch (error) {
    console.warn(`[wedding-seo] Ricerca fornitore “${name}” non completata; verrà riprovata alla prossima generazione:`, error);
    return { status: 'technical_error' };
  }
  if (!response.ok) {
    console.warn(`[wedding-seo] Ricerca fornitore “${name}” non riuscita (HTTP ${response.status}); nessuna cache negativa salvata.`);
    return { status: 'technical_error' };
  }
  const interaction: any = await response.json();
  const outputBlocks = (Array.isArray(interaction?.steps) ? interaction.steps : [])
    .filter((step: any) => step?.type === 'model_output')
    .flatMap((step: any) => Array.isArray(step.content) ? step.content : [])
    .filter((block: any) => block?.type === 'text');
  const block = outputBlocks.at(-1);
  const citationUrls = (Array.isArray(block?.annotations) ? block.annotations : [])
    .filter((annotation: any) => annotation?.type === 'url_citation')
    .map((annotation: any) => safeString(annotation.url, 500))
    .filter(Boolean);
  try {
    const parsed = parseGeminiJson(String(block?.text || ''));
    const match = validateWeddingVendorSearchResult(name, parsed, citationUrls);
    if (match) return { status: 'matched', match };
    if (parsed.matched === false) return { status: 'not_found' };
    console.warn(`[wedding-seo] Match proposto per “${name}” rifiutato perché non sufficientemente verificabile; verrà riprovato.`);
    return { status: 'technical_error' };
  } catch (error) {
    console.warn(`[wedding-seo] Risposta di ricerca non valida per “${name}”:`, error);
    return { status: 'technical_error' };
  }
}

async function resolveOneWeddingVendor(
  name: string,
  jobFacts: WeddingEditorialJobFacts | null,
  apiKey: string,
): Promise<WeddingStoryVendor | null> {
  try {
    const cached = await loadCachedWeddingVendor(name);
    if (cached !== undefined) return cached ? { name, role: cached.role, url: cached.url } : null;
    const outcome = await searchWeddingVendor(name, jobFacts, apiKey);
    if (outcome.status === 'technical_error') return null;
    const match = outcome.match;
    await db.collection(VENDOR_DIRECTORY_COL).doc(vendorCacheId(name)).set({
      lookupVersion: VENDOR_LOOKUP_VERSION,
      requestedName: name,
      matched: outcome.status === 'matched',
      name: match?.name || name,
      role: match?.role || '',
      url: match?.url || '',
      sourceUrl: match?.sourceUrl || '',
      confidence: match?.confidence || 0,
      checkedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return match ? { name, role: match.role, url: match.url } : null;
  } catch (error) {
    console.warn(`[wedding-seo] Ricerca fornitore “${name}” saltata senza interrompere l'articolo:`, error);
    return null;
  }
}

async function resolveWeddingVendors(
  sources: WeddingStorySource[],
  jobFacts: WeddingEditorialJobFacts | null,
  apiKey: string,
): Promise<WeddingStoryVendor[]> {
  const names = uniqueNonEmpty(sources.flatMap(vendorNamesFromSource)).slice(0, MAX_VENDOR_LOOKUPS_PER_STORY);
  const resolved: WeddingStoryVendor[] = [];
  for (let index = 0; index < names.length; index += VENDOR_SEARCH_CONCURRENCY) {
    const batch = names.slice(index, index + VENDOR_SEARCH_CONCURRENCY);
    const matches = await Promise.all(batch.map(name => resolveOneWeddingVendor(name, jobFacts, apiKey)));
    resolved.push(...matches.filter((match): match is WeddingStoryVendor => Boolean(match)));
  }
  if (names.length > 0) {
    console.log(`[wedding-seo] Fornitori verificati online: ${resolved.length}/${names.length}. I match incerti restano senza link.`);
  }
  return resolved;
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
    .slice(0, MAX_WEDDING_STORY_PHOTOS);
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
  verifiedVendors?: WeddingStoryVendor[];
  preparedPhotoCount?: number;
}): string {
  const editorialPlan = buildWeddingEditorialPlan(
    params.sources,
    params.preparedPhotoCount ?? params.photos.length,
  );
  const sourcePayload = editorialPlan.sourcePayload;
  const photoPayload = params.photos.map(photo => ({
    chapter: photo.chapterTitle || '',
  }));
  const facts = params.jobFacts || {
    coupleOrGalleryName: params.gallery.name || '',
    date: params.gallery.date || '',
    location: params.gallery.location || '',
  };

  const vendors = sourcePayload.filter(source => source.category === 'vendor');
  const isEnrichedStory = editorialPlan.enriched;
  const verifiedVendorNames = new Set((params.verifiedVendors || []).map(vendor => normalizedVendorName(vendor.name)));
  const unverifiedVendorNames = uniqueNonEmpty(params.sources
    .filter(source => source.category === 'vendor' && (typeof source.value !== 'object' || Array.isArray(source.value)))
    .flatMap(vendorNamesFromSource)
    .filter(name => !verifiedVendorNames.has(normalizedVendorName(name))));
  const unverifiedVendorSentence = unverifiedVendorNames.length > 0
    ? `Tra le realtà scelte dalla coppia figurano ${italianList(unverifiedVendorNames)}.`
    : '';
  const storyLength = editorialPlan.storyLength;

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
    `Usa nel testo pubblico soltanto i nomi propri degli sposi, senza ripetere i cognomi. ` +
    `I cognomi nei dati servono a distinguere le persone nel gestionale, non sono materiale narrativo.\n` +
    `Scrivi come racconto successivo all'evento, usando passato prossimo e imperfetto. ` +
    `Non usare il futuro né formule da programma come “è previsto”, “sono previsti” o “avrà inizio”.\n` +
    `Tratta orari, numero degli ospiti, composizione familiare, richieste di scatto e indicazioni logistiche come contesto operativo: ` +
    `non trasformarli in una checklist e non usarli come riempitivo. Ometti gli orari esatti, il numero degli invitati, l'orario di fine e la scaletta, salvo un dettaglio davvero indispensabile alla comprensione.\n` +
    `Le risposte al modulo descrivono desideri e indicazioni raccolti prima dell'evento, non provano che un fatto sia avvenuto. ` +
    `Non affermare che una foto sia stata realizzata, che una persona fosse presente o abbia svolto un'attività, se questo non è dichiarato esplicitamente. ` +
    `Le città dei clienti indicano soltanto la loro residenza: non attribuirle agli invitati. ` +
    `Per i fornitori con ruolo non verificato cita i nomi senza assegnare attività, prodotti o responsabilità. ` +
    (unverifiedVendorSentence
      ? `Usa esattamente una volta questa frase e non citare altrove gli stessi nomi: “${unverifiedVendorSentence}” `
      : '') +
    `Non accostare a questi nomi parole che suggeriscano fiori, abiti, musica, allestimenti, coordinamento o altri ruoli. ` +
    `Non dedurre costa, mare, spiaggia, panorama, architettura o interni dalla reputazione o dal nome di una location. ` +
    `Puoi invece raccontare con prudenza spazi, gesti, abiti, luce e dettagli concretamente visibili nelle fotografie selezionate, senza identificare persone o luoghi e senza trasformare ciò che è inquadrato in una caratteristica geografica, storica o permanente della location.\n` +
    `Se un dettaglio manca, omettilo in silenzio. Non scrivere mai “non è indicato”, “non sono forniti dettagli”, ` +
    `“dati disponibili”, “probabilmente” o “presumibilmente”. ` +
    `Non commentare ciò che non sai e non spiegare i limiti delle fonti.\n` +
    `Crea titoli di sezione specifici per questa coppia e questo matrimonio: evita intestazioni da dossier come ` +
    `“Preparativi”, “Cerimonia”, “Famiglia e Ospiti”, “Fornitori” e “Ricevimento”. ` +
    `Scrivi prosa continua, naturale e grammaticalmente corretta, senza elenchi, keyword stuffing, frasi generiche o superlativi non verificabili.\n` +
    `La voce deve essere calda, elegante e umana, con un ritmo da magazine fotografico: fai percepire la progressione della giornata attraverso gesti, passaggi e relazioni sostenuti dalle fonti. ` +
    `Evita il tono da verbale, cronaca tecnica o scheda di produzione e parole fredde come “attività”, “consenso formale”, “fasi concordate”, “conclusione programmata” e “documentazione”.\n` +
    `L'approccio deve essere chiaramente fotografico: costruisci il racconto come una sequenza visiva, collegando i momenti alle immagini reali selezionate. ` +
    `Parla di ritmo del reportage, passaggi della giornata, ritratti, gesti e dettagli quando sono visivamente osservabili o sostenuti dalle fonti testuali. ` +
    `Non catalogare le fotografie una per una e non ripetere formule come “una foto mostra”, “uno scatto ritrae” o descrizioni inventariali di arredi, abiti e oggetti. ` +
    `Trasforma ciò che è visibile in una narrazione fluida senza dichiarare continuamente che stai osservando una fotografia. ` +
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
    `Eccezione obbligatoria: cita nel testo tutti i FORNITORI SELEZIONATI. Usa un ruolo soltanto quando è dichiarato nel questionario oppure compare nei FORNITORI VERIFICATI ONLINE; negli altri casi cita esclusivamente il nome.\n\n` +
    `DATI STRUTTURATI DEL JOB: ${JSON.stringify(facts)}\n` +
    `RISPOSTE SELEZIONATE: ${JSON.stringify(sourcePayload)}\n` +
    `FORNITORI SELEZIONATI DA CITARE SEMPRE: ${JSON.stringify(vendors)}\n` +
    `FORNITORI VERIFICATI ONLINE (ruolo utilizzabile solo per questi record; non inserire URL nel racconto perché i link vengono mostrati nella sezione fornitori della pagina): ${JSON.stringify(params.verifiedVendors || [])}\n` +
    `FORNITORI CON RUOLO NON VERIFICATO (citare insieme nella sola formula neutra indicata, senza attribuzioni): ${JSON.stringify(unverifiedVendorNames)}\n` +
    `SEZIONI FOTOGRAFICHE: ${JSON.stringify(photoPayload)}\n\n` +
    `Restituisci solo JSON valido con: title (massimo ${WEDDING_STORY_LIMITS.title} caratteri), excerpt (massimo ${WEDDING_STORY_LIMITS.excerpt} caratteri), ` +
    `story (${storyLength} con titoli Markdown ##, massimo ${WEDDING_STORY_LIMITS.story} caratteri), seoTitle (massimo ${WEDDING_STORY_LIMITS.seoTitle} caratteri), ` +
    `seoDescription (massimo ${WEDDING_STORY_LIMITS.seoDescription} caratteri). Rispetta tassativamente tutti i limiti di caratteri. ` +
    `Il racconto deve sembrare un articolo fotografico ampio e finito, non un riepilogo del modulo. ` +
    (isEnrichedStory
      ? `Prima di restituire il JSON, conta le parole del solo campo story: punta ad almeno ${TARGET_ENRICHED_WEDDING_STORY_WORDS} parole per conservare margine rispetto al controllo editoriale. `
      : '') +
    (isEnrichedStory
      ? 'Ogni affermazione deve essere riconducibile ai dati disponibili.'
      : 'Le prove narrative e fotografiche sono limitate: mantieni il testo compatto e usa soltanto dati espliciti e titoli delle sezioni fotografiche. Non descrivere cerimonie, promesse, emozioni o dettagli della giornata non documentati.');
}

function imageDataUrl(value: string, contentType: unknown): string | null {
  const trimmed = value.trim();
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(trimmed)) return trimmed;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;
  const mimeType = typeof contentType === 'string' && /^image\/(?:png|jpeg|webp|gif)$/i.test(contentType)
    ? contentType.toLowerCase()
    : 'image/jpeg';
  return `data:${mimeType};base64,${trimmed}`;
}

async function downloadGeminiImage(url: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(url, {}, 20_000);
    if (!response.ok) {
      console.warn(`[wedding-seo] Immagine non scaricabile per Gemini (HTTP ${response.status}).`);
      return null;
    }
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_AI_IMAGE_BYTES) {
      console.warn('[wedding-seo] Immagine esclusa da Gemini perché supera il limite di download.');
      return null;
    }
    const original = Buffer.from(await response.arrayBuffer());
    if (original.length === 0 || original.length > MAX_AI_IMAGE_BYTES) return null;
    const optimized = await sharp(original)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${optimized.toString('base64')}`;
  } catch (error) {
    console.warn('[wedding-seo] Immagine esclusa dalla richiesta Gemini:', error);
    return null;
  }
}

async function prepareGeminiPhotos(
  photos: Array<Record<string, any>>,
): Promise<PreparedGeminiPhoto[]> {
  const prepared = await Promise.all(photos.slice(0, MAX_WEDDING_STORY_PHOTOS).map(async photo => {
    const value = typeof photo.base64 === 'string'
      ? photo.base64
      : typeof photo.thumbnailUrl === 'string'
        ? photo.thumbnailUrl
        : typeof photo.url === 'string'
          ? photo.url
          : typeof photo.imageUrl === 'string'
            ? photo.imageUrl
            : '';
    const url = /^https?:\/\//i.test(value.trim())
      ? await downloadGeminiImage(value.trim())
      : imageDataUrl(value, photo.contentType);
    return url ? {
      content: { type: 'image_url' as const, image_url: { url } },
      photo,
    } : null;
  }));
  return prepared.filter((item): item is PreparedGeminiPhoto => Boolean(item));
}

export async function buildGeminiMessageContent(
  prompt: string,
  photos: Array<Record<string, any>>,
): Promise<GeminiMessageContent[]> {
  const prepared = await prepareGeminiPhotos(photos);
  return [{ type: 'text', text: prompt }, ...prepared.map(item => item.content)];
}

export function inspectWeddingDraftQuality(
  draft: Record<string, any>,
  requiredVendors: string[] = [],
  context: WeddingDraftQualityContext = {},
): string[] {
  const storyText = String(draft.story || '');
  const text = [draft.title, draft.excerpt, storyText, draft.seoTitle, draft.seoDescription]
    .map(value => String(value || ''))
    .join('\n');
  const issues: string[] = [];
  const wordCount = storyText.trim().split(/\s+/u).filter(Boolean).length;
  if (context.minimumWords && wordCount < context.minimumWords) {
    issues.push(`racconto troppo breve: ${wordCount} parole, minimo ${context.minimumWords}`);
  }
  if (context.requiredBrand && !storyText.toLocaleLowerCase('it').includes(context.requiredBrand.toLocaleLowerCase('it'))) {
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
  if (/\b(?:attività sono state scandite|orari precisi|consenso formale|fasi concordate|conclusione programmata|documentazione fotografica|rigorosa continuità narrativa|in qualità di fotografo)\b/i.test(text)) {
    issues.push('usa un tono tecnico o burocratico invece di uno storytelling umano');
  }
  const photoCataloguePhrases = text.match(/\b(?:una|un|questa|questo)\s+(?:foto(?:grafia)?|immagine|scatto)\s+(?:mostra|documenta|ritrae|immortala)|\b(?:un|una)\s+(?:second[oa]|altr[oa])\s+(?:foto(?:grafia)?|immagine|scatto)\b/gi) || [];
  if (photoCataloguePhrases.length >= 2) issues.push('descrive le fotografie come un inventario invece di costruire un racconto');
  const exactTimes = text.match(/\b(?:[01]?\d|2[0-3])[:.]\d{2}\b/g) || [];
  if (exactTimes.length >= 2) issues.push('usa troppi orari e dettagli operativi');
  const exposedFullNames = (context.privateCoupleNames || []).filter(name => {
    const normalized = name.trim();
    return normalized.includes(' ') && text.toLocaleLowerCase('it').includes(normalized.toLocaleLowerCase('it'));
  });
  const exposedSurnames = uniqueNonEmpty(context.privateCoupleSurnames || []).filter(surname => {
    const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text);
  });
  if (exposedFullNames.length > 0 || exposedSurnames.length > 0) {
    issues.push('ripete i cognomi degli sposi nel testo pubblico');
  }
  if (/\b(?:sarà|saranno|avrà inizio|si prepareranno|è previsto|sono previsti)\b/i.test(text)) {
    issues.push('usa il futuro o un tono da programma operativo');
  }
  const genericHeadings = storyText.match(/^##\s+(?:Preparativi|Cerimonia|Famiglia e Ospiti|Fornitori|Ricevimento)\s*$/gim) || [];
  if (genericHeadings.length >= 2) issues.push('usa intestazioni generiche da dossier');
  const missingVendors = requiredVendors.filter(name => name && !storyText.toLocaleLowerCase('it').includes(name.toLocaleLowerCase('it')));
  if (missingVendors.length > 0) issues.push(`non cita i fornitori selezionati: ${missingVendors.join(', ')}`);
  const unverifiedVendorNames = uniqueNonEmpty(context.unverifiedVendorNames || []);
  if (unverifiedVendorNames.length > 0) {
    const canonicalCredit = `Tra le realtà scelte dalla coppia figurano ${italianList(unverifiedVendorNames)}.`;
    const canonicalPattern = canonicalCredit
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    const canonicalRegex = new RegExp(canonicalPattern, 'giu');
    const normalizedStory = storyText.replace(/\s+/gu, ' ').trim();
    const canonicalCount = normalizedStory.match(canonicalRegex)?.length || 0;
    if (canonicalCount !== 1) {
      issues.push(`non usa una sola volta il credito neutro obbligatorio per i fornitori: ${canonicalCredit}`);
    }
    const storyWithoutCanonicalCredit = normalizedStory.replace(canonicalRegex, ' ');
    const publicTextWithoutCredit = [
      draft.title,
      draft.excerpt,
      storyWithoutCanonicalCredit,
      draft.seoTitle,
      draft.seoDescription,
    ].map(value => String(value || '').replace(/\s+/gu, ' ')).join(' ');
    const repeatedOutsideCredit = unverifiedVendorNames.filter(name => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(publicTextWithoutCredit);
    });
    if (repeatedOutsideCredit.length > 0) {
      issues.push(`cita fornitori non verificati fuori dal credito neutro: ${repeatedOutsideCredit.join(', ')}`);
    }
  }
  if (/\b(?:ospiti|invitati)\b[^.!?]{0,100}\bprovenient[ei]\s+da\b/i.test(text)) {
    issues.push('deduce la provenienza degli invitati dalle città dei clienti');
  }
  const allowedText = String(context.allowedText || '').toLocaleLowerCase('it');
  const unsupportedSetting = ['sulla costa', 'sulla spiaggia', 'vista sul mare'].filter(detail =>
    text.toLocaleLowerCase('it').includes(detail) && !allowedText.includes(detail),
  );
  if (
    text.toLocaleLowerCase('it').includes('navata')
    && !allowedText.includes('navata')
    && !context.hasChurchPhotoEvidence
  ) {
    unsupportedSetting.push('navata');
  }
  if (unsupportedSetting.length > 0) issues.push(`attribuisce caratteristiche non documentate alle location: ${unsupportedSetting.join(', ')}`);
  const unsupportedScenes = [
    'scambio di promesse', 'brindisi condiviso', 'le luci si sono spente', 'ricordi condivisi',
  ].filter(detail => text.toLocaleLowerCase('it').includes(detail) && !allowedText.includes(detail));
  if (unsupportedScenes.length > 0) issues.push(`aggiunge scene o conclusioni non documentate: ${unsupportedScenes.join(', ')}`);
  const roleWords = '(?:wedding planner|fior(?:aio|ista)|floral designer|atelier|musicist[ai]|coordinator[ea]|decorator[ea])';
  const suppliedElements = '(?:fior[ei]|allestimenti?|decorazioni?|abiti?|musica|colonna sonora|coordinamento)';
  const attributionVerbs = '(?:ha|hanno)\\s+(?:curato|realizzato|firmato|coordinato|fornito|creato|decorato|accompagnato)';
  const attributed = unverifiedVendorNames.filter(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundedName = `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
    const patterns = [
      `${roleWords}\\s+(?:di\\s+)?${boundedName}`,
      `${boundedName}\\s*(?:[,—–:-]\\s*|(?:è|era)(?:\\s+stat[oa])?\\s+(?:il|la|lo|un|una)?\\s+|come\\s+(?:il|la|lo|un|una)?\\s+)${roleWords}`,
      `${boundedName}[^.!?]{0,45}${attributionVerbs}`,
      `${suppliedElements}\\s+(?:di|da|firmat[io]\\s+da|a\\s+cura\\s+di)\\s+${boundedName}`,
      `${boundedName}[^.!?]{0,35}(?:per|con)\\s+(?:i|gli|le|la|il|l['’])?\\s*${suppliedElements}`,
    ];
    return patterns.some(pattern => new RegExp(pattern, 'iu').test(text));
  });
  if (attributed.length > 0) issues.push(`attribuisce ruoli non verificati ai fornitori: ${attributed.join(', ')}`);
  return issues;
}

export function buildWeddingDraftRevisionPrompt(
  issues: string[],
  options: WeddingDraftRevisionOptions = {},
): string {
  const minimumFromIssues = issues.reduce((highest, issue) => {
    const match = issue.match(/minimo\s+(\d+)/i);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  const minimumWords = options.minimumWords || minimumFromIssues || undefined;
  const targetWords = options.targetWords
    || (minimumWords ? Math.max(TARGET_ENRICHED_WEDDING_STORY_WORDS, minimumWords + 150) : undefined);
  const lowerIssues = issues.join(' ').toLocaleLowerCase('it');
  const instructions: string[] = [];

  if (minimumWords && targetWords) {
    const targetUpperWords = targetWords >= MIN_ENRICHED_WEDDING_STORY_WORDS
      ? targetWords + 200
      : targetWords + 100;
    const sectionPlan = targetWords >= MIN_ENRICHED_WEDDING_STORY_WORDS
      ? '5-7 sezioni sostanziose'
      : '2-3 sezioni ben sviluppate';
    instructions.push(
      `Il solo campo story deve contenere almeno ${minimumWords} parole: punta a ${targetWords}-${targetUpperWords} parole e conta le parole prima di rispondere. ` +
      `Distribuisci il contenuto in ${sectionPlan}, sviluppando soltanto la sequenza visiva, i passaggi documentati, i dettagli realmente osservabili e il metodo fotografico di Image Studio.`,
    );
  }
  if (
    lowerIssues.includes('ruoli non verificati')
    || lowerIssues.includes('credito neutro')
    || lowerIssues.includes('fuori dal credito')
  ) {
    const names = uniqueNonEmpty(options.unverifiedVendorNames || []);
    const neutralSentence = names.length > 0
      ? `“Tra le realtà scelte dalla coppia figurano ${italianList(names)}.”`
      : '“Tra le realtà scelte dalla coppia figurano [soli nomi].”';
    instructions.push(
      `Per i fornitori con ruolo non verificato usa una sola frase neutra, senza aggiungere mestieri, prodotti o azioni: ${neutralSentence} ` +
      `Non citare altrove gli stessi nomi e tieni questa frase separata da riferimenti a fiori, abiti, musica, allestimenti e coordinamento.`,
    );
  }
  if (lowerIssues.includes('caratteristiche non documentate')) {
    instructions.push(
      `Elimina le caratteristiche di location segnalate e non sostituirle con sinonimi o nuove deduzioni geografiche, architettoniche o storiche. ` +
      `Puoi usare soltanto dettagli concretamente visibili nelle fotografie come elementi dell'inquadratura, senza presentarli come proprietà permanenti del luogo.`,
    );
  }
  if (lowerIssues.includes('troppi orari')) {
    instructions.push('Rimuovi gli orari esatti e racconta i passaggi con transizioni narrative, senza scalette operative.');
  }
  if (lowerIssues.includes('json valido') || lowerIssues.includes('troncata')) {
    instructions.push('Ricrea tutti e cinque i campi da zero e verifica che il JSON sia completo e sintatticamente valido.');
  }

  return `La bozza precedente è stata respinta al controllo editoriale${options.attempt ? ` dopo il tentativo ${options.attempt}` : ''} per questi motivi: ${issues.join('; ')}.\n` +
    `Riscrivila integralmente, non limitarti ad aggiungere un paragrafo. Mantieni esclusivamente i fatti e le prove visive forniti nel messaggio iniziale.\n` +
    `${instructions.join('\n')}\n` +
    `Correggi tutti i problemi elencati senza reintrodurre quelli già risolti e rispetta tassativamente i limiti di ogni campo. ` +
    `Conserva il formato richiesto e restituisci soltanto JSON valido.`;
}

function parseGeminiJson(raw: string): Record<string, any> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object') throw new Error('Risposta IA non valida');
  return parsed;
}

export async function loadSelectedPhotos(gallery: Record<string, any>, photoIds: string[]): Promise<Array<Record<string, any>>> {
  const chapters = new Map<string, string>(
    (Array.isArray(gallery.chapters) ? gallery.chapters : []).map((chapter: any) => [chapter.id, chapter.titolo || '']),
  );
  const photos = await Promise.all(photoIds.slice(0, MAX_WEDDING_STORY_PHOTOS).map(async id => {
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

export async function generateWeddingDraftWithGemini(params: {
  gallery: Record<string, any>;
  sources: WeddingStorySource[];
  photos: Array<Record<string, any>>;
  jobFacts: WeddingEditorialJobFacts | null;
  apiKey?: string;
}): Promise<WeddingAiDraft> {
  const { gallery, sources, photos, jobFacts } = params;
  const apiKey = params.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new WeddingAiGenerationError(
      'GEMINI_API_KEY non configurata: puoi comunque scrivere e salvare la bozza manualmente.',
      503,
    );
  }
  const requiredVendors = sources.flatMap(vendorNamesFromSource);
  const verifiedVendors = await resolveWeddingVendors(sources, jobFacts, apiKey);
  console.log(`[wedding-seo] Preparazione di ${Math.min(photos.length, MAX_WEDDING_STORY_PHOTOS)} fotografie per Gemini...`);
  const verifiedVendorNames = new Set(verifiedVendors.map(vendor => normalizedVendorName(vendor.name)));
  const unverifiedVendorNames = uniqueNonEmpty(sources
    .filter(source => source.category === 'vendor' && (typeof source.value !== 'object' || Array.isArray(source.value)))
    .flatMap(vendorNamesFromSource)
    .filter(name => !verifiedVendorNames.has(normalizedVendorName(name))));
  const preparedPhotos = await prepareGeminiPhotos(photos);
  const preparedPhotoCount = preparedPhotos.length;
  const editorialPlan = buildWeddingEditorialPlan(sources, preparedPhotoCount);
  const initialContent: GeminiMessageContent[] = [{
    type: 'text',
    text: buildWeddingStoryPrompt({
      gallery,
      sources,
      photos,
      jobFacts,
      verifiedVendors,
      preparedPhotoCount,
    }),
  }, ...preparedPhotos.map(item => item.content)];
  const churchIndicators = /\b(?:chiesa|basilica|santuario|cattedrale|parrocchia|monastero|cappella|abbazia|duomo|church|place[_ ]of[_ ]worship|luogo di culto|rito religioso)\b/i;
  const verifiedChurchEvidence = [
    jobFacts?.ceremonyVenue,
    jobFacts?.ceremonyPlaceType,
  ].map(value => String(value || '')).join(' ');
  const hasChurchPhotoEvidence = preparedPhotos.some(({ photo }) => {
    const chapter = String(photo.chapterTitle || '');
    return churchIndicators.test(chapter)
      || (churchIndicators.test(verifiedChurchEvidence) && /\b(?:cerimonia|rito)\b/i.test(chapter));
  });
  const qualityContext: WeddingDraftQualityContext = {
    allowedText: JSON.stringify({ jobFacts, sources: promptSourcePayload(sources) }),
    unverifiedVendorNames,
    minimumWords: editorialPlan.minimumWords,
    requiredBrand: 'Image Studio',
    privateCoupleNames: jobFacts?.coupleNames || [],
    privateCoupleSurnames: jobFacts?.coupleSurnames || [],
    hasChurchPhotoEvidence,
  };
  console.log(`[wedding-seo] Fotografie preparate: ${preparedPhotoCount}. Invio richiesta articolo a Gemini...`);
  let messages: Array<{ role: 'user' | 'assistant'; content: string | GeminiMessageContent[] }> = [
    {
      role: 'user',
      content: initialContent,
    },
  ];
  let generated: Record<string, any> | null = null;
  let qualityIssues: string[] = [];
  const issueHistory = new Map<string, string>();
  for (let attempt = 1; attempt <= MAX_WEDDING_DRAFT_ATTEMPTS; attempt += 1) {
    let raw = '';
    generated = null;
    let response: globalThis.Response;
    try {
      response = await fetchWithTimeout(`${GEMINI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          max_tokens: 16_000,
          reasoning_effort: 'low',
          response_format: WEDDING_DRAFT_RESPONSE_FORMAT,
          messages,
        }),
      }, 120_000);
    } catch (error) {
      console.error('[wedding-seo] Gemini API: request failed', error);
      throw new WeddingAiGenerationError('La richiesta a Gemini API non è riuscita o ha superato 120 secondi. La bozza corrente è rimasta invariata.');
    }
    if (!response.ok) {
      const providerError = (await response.text()).slice(0, 500);
      console.error('[wedding-seo] Gemini API:', response.status, providerError);
      throw new WeddingAiGenerationError(
        `Gemini API ha rifiutato la richiesta (HTTP ${response.status}). La bozza corrente è rimasta invariata.`,
      );
    }
    const completion: any = await response.json();
    const choice = completion?.choices?.[0];
    const finishReason = choice?.finish_reason || 'sconosciuto';
    raw = choice?.message?.content || '';
    try {
      generated = parseGeminiJson(raw);
      qualityIssues = inspectWeddingDraftQuality(generated, requiredVendors, qualityContext);
    } catch (error) {
      qualityIssues = [finishReason === 'length'
        ? 'la risposta di Gemini è stata troncata per limite di output'
        : 'la risposta di Gemini non contiene JSON valido'];
      console.warn(`[wedding-seo] Gemini API: tentativo ${attempt} con risposta non valida (finish_reason: ${finishReason}, caratteri: ${raw.length}):`, error);
    }
    if (qualityIssues.length === 0) break;
    console.warn(`[wedding-seo] Tentativo ${attempt}/${MAX_WEDDING_DRAFT_ATTEMPTS} rifiutato dal controllo editoriale:`, qualityIssues);
    for (const issue of qualityIssues) {
      const category = issue.split(':', 1)[0].trim();
      issueHistory.set(category, issue);
    }
    if (attempt < MAX_WEDDING_DRAFT_ATTEMPTS) {
      const revisionPrompt = buildWeddingDraftRevisionPrompt([...issueHistory.values()], {
        minimumWords: editorialPlan.minimumWords,
        targetWords: editorialPlan.targetWords,
        unverifiedVendorNames,
        attempt,
      });
      if (generated) {
        messages = [
          { role: 'user', content: initialContent },
          { role: 'assistant', content: raw },
          { role: 'user', content: revisionPrompt },
        ];
      } else {
        messages = [{
          role: 'user',
          content: initialContent.map(part => part.type === 'text'
            ? { ...part, text: `${part.text}\n\n${revisionPrompt}` }
            : part),
        }];
      }
    }
  }
  if (!generated || qualityIssues.length > 0) {
    throw new WeddingAiGenerationError(
      `La bozza IA non ha superato il controllo editoriale dopo ${MAX_WEDDING_DRAFT_ATTEMPTS - 1} correzioni automatiche (${qualityIssues.join('; ')}). Il testo corrente è rimasto invariato.`,
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

router.get('/public', async (req: Request, res: Response) => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit || '24'), 10);
    const storyLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 24;
    // Ordiniamo in memoria: in questo modo la lista pubblica non dipende da
    // un indice composito Firebase e resta disponibile subito dopo il deploy.
    const snapshot = await db.collection(STORIES_COL)
      .where('status', '==', 'published')
      .get();
    const publishedDocuments = [...snapshot.docs]
      .sort((a, b) => (b.data().publishedAt?.seconds || 0) - (a.data().publishedAt?.seconds || 0))
      .slice(0, storyLimit);
    const stories = await Promise.all(publishedDocuments.map(async document => {
      const story = storyFromDocument(document.id, document.data());
      const gallery = await loadGallery(story.galleryId);
      const photos = gallery ? await loadSelectedPhotos(gallery, story.selectedPhotoIds.slice(0, 1)) : [];
      const preview: PublicWeddingStoryPreview = {
        slug: story.slug,
        title: story.title,
        excerpt: story.excerpt,
        publishedAt: story.publishedAt,
        coverImage: photos[0]?.url || undefined,
      };
      return preview;
    }));
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return res.json({ stories });
  } catch (error) {
    console.error('[wedding-seo] public stories:', error);
    return res.status(500).json({ error: 'Impossibile caricare le storie.' });
  }
});

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
    const authorizedSources = await loadSourcesForJob(story.jobId, { includeLegacy: true });
    const vendorGroups = await Promise.all(authorizedSources
      .filter(source => approvedIds.has(source.id) && source.consentGranted && source.category === 'vendor')
      .map(async source => {
        if (!source.value || typeof source.value !== 'object' || Array.isArray(source.value)) {
          return await Promise.all(vendorNamesFromSource(source).map(async name => {
            const cached = await loadCachedWeddingVendor(name);
            return cached
              ? { name, role: cached.role, url: cached.url }
              : { name, role: 'Fornitore del matrimonio' };
          }));
        }
        const value = source.value && typeof source.value === 'object' ? source.value as Record<string, unknown> : {};
        const url = validExternalVendorUrl(value.url);
        return [{ name: safeString(value.name, 120), role: safeString(value.role, 120) || 'Fornitore del matrimonio', url }];
      }));
    const vendors: WeddingStoryVendor[] = vendorGroups.flat().filter(vendor => vendor.name && vendor.role);
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
    )).slice(0, MAX_WEDDING_STORY_PHOTOS);
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
    const draft = await generateWeddingDraftWithGemini({ gallery, sources, photos, jobFacts });
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
