/**
 * Backfill sicuro dei riferimenti Google Places dei Job.
 *
 * Popola esclusivamente i metadati verificati `eventPlace` e `ceremonyPlace`;
 * non modifica mai i testi originali delle location né altri dati del Job.
 * Per sicurezza parte sempre in DRY RUN: aggiungere `--apply` per scrivere.
 *
 * Comandi:
 *   npm run backfill:job-places                         # Anteprima, nessuna scrittura
 *   npm run backfill:job-places -- --apply               # Applica solo i campi mancanti/non validi
 *   npm run backfill:job-places -- --apply --refresh     # Ri-verifica anche i campi già presenti
 *   npm run backfill:job-places -- --job=ID --apply      # Un solo Job
 *
 * Richiede nell'ambiente (mai nella repository):
 *   FIREBASE_ADMIN_CREDENTIALS
 *   GOOGLE_PLACES_API_KEY
 */

import { db, FieldValue } from '../server/firebase-admin.js';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { isItalianPlace, parseAddressComponents, type PlaceAddressComponent, type VerifiedPlaceReference } from '../shared/places-utils.js';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const REQUEST_DELAY_MS = 125;
const BATCH_LIMIT = 400;

type JobData = Record<string, any>;
type PlaceField = 'eventPlace' | 'ceremonyPlace';

interface Options {
  apply: boolean;
  refresh: boolean;
  jobId?: string;
  limit?: number;
}

interface Stats {
  jobsRead: number;
  jobsEligible: number;
  jobsUpdated: number;
  eventPlacesResolved: number;
  ceremonyPlacesResolved: number;
  skippedExisting: number;
  skippedWithoutLocation: number;
  unmatched: number;
  errors: number;
}

function parseOptions(args: string[]): Options {
  const option = (name: string) => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const limitRaw = option('--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  if (limitRaw && (!Number.isInteger(limit) || limit! <= 0)) {
    throw new Error('--limit deve essere un intero positivo');
  }

  return {
    apply: args.includes('--apply'),
    refresh: args.includes('--refresh'),
    jobId: option('--job'),
    limit,
  };
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isVerifiedPlace(value: unknown): value is VerifiedPlaceReference {
  if (!value || typeof value !== 'object') return false;
  const place = value as Partial<VerifiedPlaceReference>;
  return Boolean(place.placeId && place.name);
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function getLocation(job: JobData, field: PlaceField): string | undefined {
  const legacy = job.jobDataValues && typeof job.jobDataValues === 'object'
    ? job.jobDataValues as Record<string, unknown>
    : {};

  if (field === 'eventPlace') {
    return firstText(
      job.eventLocation,
      job.locationRicevimento,
      legacy.eventLocation,
      legacy.locationRicevimento,
    );
  }

  return firstText(
    job.rituLocation,
    job.locationCerimonia,
    job.ceremonyLocation,
    legacy.rituLocation,
    legacy.locationCerimonia,
    legacy.ceremonyLocation,
  );
}

/**
 * Evita di salvare il primo risultato Google quando è palesemente ambiguo.
 * Il nome del luogo deve coincidere o condividere almeno due parole rilevanti
 * con il testo conservato nel Job.
 */
function isConfidentMatch(locationText: string, candidateName: string): boolean {
  const query = normalize(locationText);
  const name = normalize(candidateName);
  if (query.length < 5 || name.length < 3) return false;
  if (query === name || query.includes(name) || (name.includes(query) && query.length >= 6)) return true;

  const queryTokens = new Set(query.split(' ').filter(token => token.length >= 3));
  const nameTokens = new Set(name.split(' ').filter(token => token.length >= 3));
  const sharedTokens = [...nameTokens].filter(token => queryTokens.has(token));
  return sharedTokens.length >= 2;
}

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function findPlace(locationText: string, apiKey: string): Promise<VerifiedPlaceReference | undefined> {
  const response = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({
      textQuery: `${locationText}, Italia`,
      languageCode: 'it',
      regionCode: 'IT',
      maxResultCount: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Places ha risposto con HTTP ${response.status}`);
  }

  const data = await response.json() as { places?: Array<Record<string, any>> };
  const candidate = data.places?.find(place => {
    const name = String(place.displayName?.text || '').trim();
    return Boolean(place.id && name && isItalianPlace(place.addressComponents as PlaceAddressComponent[] | undefined))
      && isConfidentMatch(locationText, name);
  });

  if (!candidate) return undefined;
  const address = parseAddressComponents(candidate.addressComponents as PlaceAddressComponent[] | undefined);
  return {
    placeId: String(candidate.id),
    name: String(candidate.displayName?.text || '').trim(),
    formattedAddress: candidate.formattedAddress || undefined,
    city: address.citta,
    province: address.provincia,
    websiteUri: candidate.websiteUri || undefined,
    googleMapsUri: candidate.googleMapsUri || undefined,
    primaryType: candidate.primaryTypeDisplayName?.text || undefined,
  };
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY non configurata');

  console.log(`🔎 Backfill Google Places Job — ${options.apply ? 'APPLY' : 'DRY RUN'}${options.refresh ? ' (refresh completo)' : ''}`);
  if (!options.apply) console.log('   Nessun documento Firestore verrà modificato. Usa --apply solo dopo aver verificato il report.');

  const jobsSnapshot: DocumentSnapshot[] = options.jobId
    ? await db.getAll(db.collection('jobs').doc(options.jobId))
    : (await db.collection('jobs').get()).docs;
  const jobs = (options.limit ? jobsSnapshot.slice(0, options.limit) : jobsSnapshot)
    .filter(job => job.exists);
  const stats: Stats = {
    jobsRead: jobs.length,
    jobsEligible: 0,
    jobsUpdated: 0,
    eventPlacesResolved: 0,
    ceremonyPlacesResolved: 0,
    skippedExisting: 0,
    skippedWithoutLocation: 0,
    unmatched: 0,
    errors: 0,
  };
  const lookupCache = new Map<string, Promise<VerifiedPlaceReference | undefined>>();
  const lookup = async (location: string) => {
    const cacheKey = normalize(location);
    const existing = lookupCache.get(cacheKey);
    if (existing) return existing;
    const request = (async () => {
      await wait(REQUEST_DELAY_MS);
      return findPlace(location, apiKey);
    })();
    lookupCache.set(cacheKey, request);
    return request;
  };

  let batch = db.batch();
  let pendingWrites = 0;
  for (const jobDoc of jobs) {
    const job = jobDoc.data() as JobData;
    if (job.deletedAt) continue;

    const updates: Partial<Record<PlaceField, VerifiedPlaceReference>> = {};
    for (const field of ['eventPlace', 'ceremonyPlace'] as const) {
      if (!options.refresh && isVerifiedPlace(job[field])) {
        stats.skippedExisting++;
        continue;
      }

      const location = getLocation(job, field);
      if (!location) {
        stats.skippedWithoutLocation++;
        continue;
      }

      stats.jobsEligible++;
      try {
        const place = await lookup(location);
        if (!place) {
          stats.unmatched++;
          continue;
        }
        updates[field] = place;
        if (field === 'eventPlace') stats.eventPlacesResolved++;
        else stats.ceremonyPlacesResolved++;
      } catch (error) {
        stats.errors++;
        console.warn(`⚠️ Job ${jobDoc.id}: ricerca ${field} non riuscita (${error instanceof Error ? error.message : 'errore sconosciuto'})`);
      }
    }

    if (Object.keys(updates).length === 0) continue;
    stats.jobsUpdated++;
    if (!options.apply) continue;

    batch.update(jobDoc.ref, {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
    pendingWrites++;
    if (pendingWrites >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (options.apply && pendingWrites > 0) await batch.commit();

  console.log('\n📊 Report Google Places Job');
  console.log(`   Job letti: ${stats.jobsRead}`);
  console.log(`   Campi analizzati: ${stats.jobsEligible}`);
  console.log(`   Job ${options.apply ? 'aggiornati' : 'aggiornabili'}: ${stats.jobsUpdated}`);
  console.log(`   eventPlace risolti: ${stats.eventPlacesResolved}`);
  console.log(`   ceremonyPlace risolti: ${stats.ceremonyPlacesResolved}`);
  console.log(`   Già verificati (saltati): ${stats.skippedExisting}`);
  console.log(`   Senza location (saltati): ${stats.skippedWithoutLocation}`);
  console.log(`   Non associati con confidenza: ${stats.unmatched}`);
  console.log(`   Errori: ${stats.errors}`);
}

run().catch(error => {
  console.error(`💥 Backfill Google Places non completato: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
