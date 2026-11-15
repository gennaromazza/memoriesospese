/**
 * Raccolta dei dati dell'Area Cliente da Firestore (firebase-admin).
 *
 * Collegamento automatico:
 *  1. schede `clienti` con l'email verificata dal codice, o già collegate all'uid;
 *  2. job con quei clienti in `clientiIds` (o `clienteId` legacy);
 *  3. gallerie collegate ai clienti (`clientiIds`/`clientIds`/`clienteId`)
 *     oppure elencate in `galleryIds` di uno dei loro job;
 *  4. preventivi, piani di pagamento e fotolibri dei job;
 *  5. prenotazioni con `clienteId` o con la stessa email.
 *
 * Tutto passa dalle funzioni `toClient*` di @shared/client-area, che
 * copiano solo i campi consentiti.
 */
import type { DocumentData, DocumentSnapshot, Firestore, Query } from 'firebase-admin/firestore';
import {
  bankDetailsFromSettings, galleryClientIdsOf, isGalleryVisibleToClient, isJobVisibleToClient,
  toClientBooking, toClientGallery, toClientJob, toClientPaymentPlan, toClientQuote,
  type ClientAreaOverview, type ClientAreaQuote, type ClientAreaSettings,
} from '@shared/client-area';

const IN_LIMIT = 30;

type Doc = { id: string; data: DocumentData };

function chunks<T>(values: T[], size = IN_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function unique(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))];
}

async function runQueries(queries: Query[]): Promise<Doc[]> {
  const snaps = await Promise.all(queries.map(q => q.get()));
  const byId = new Map<string, Doc>();
  for (const snap of snaps) for (const d of snap.docs) byId.set(d.id, { id: d.id, data: d.data() });
  return [...byId.values()];
}

async function getByIds(db: Firestore, collection: string, ids: string[]): Promise<Doc[]> {
  if (ids.length === 0) return [];
  const snaps: DocumentSnapshot[] = [];
  for (const group of chunks(ids, 100)) {
    snaps.push(...await db.getAll(...group.map(id => db.collection(collection).doc(id))));
  }
  return snaps.filter(s => s.exists).map(s => ({ id: s.id, data: s.data() || {} }));
}

function inQueries(db: Firestore, collection: string, field: string, values: string[], op: 'in' | 'array-contains-any' = 'in'): Query[] {
  return chunks(values).map(group => db.collection(collection).where(field, op, group));
}

/** Schede cliente che appartengono a chi ha fatto l'accesso. */
export async function findClientRecords(db: Firestore, email: string, uid?: string): Promise<Doc[]> {
  const queries: Query[] = [db.collection('clienti').where('email', '==', email)];
  if (uid) queries.push(db.collection('clienti').where('sourceRefs.userIds', 'array-contains', uid));
  return runQueries(queries);
}

export async function loadClientAreaOverview(
  db: Firestore,
  { email, uid, now = new Date() }: { email: string; uid: string; now?: Date },
): Promise<ClientAreaOverview> {
  const clienti = await findClientRecords(db, email, uid);
  const clienteIds = clienti.map(c => c.id);
  const first = clienti[0]?.data || {};

  const settingsSnap = await db.collection('clientAreaSettings').doc('main').get();
  const bankDetails = bankDetailsFromSettings(settingsSnap.exists ? settingsSnap.data() as ClientAreaSettings : null);

  // Prenotazioni: per cliente collegato o per email (prenotazioni vecchie senza clienteId).
  const bookingDocs = await runQueries([
    ...inQueries(db, 'bookings', 'clienteId', clienteIds),
    db.collection('bookings').where('cliente.email', '==', email),
  ]);

  if (clienteIds.length === 0) {
    return {
      cliente: { nome: '', cognome: '', email },
      jobs: [],
      galleries: [],
      bookings: await bookingsFor(db, bookingDocs),
      bankDetails,
    };
  }

  const jobDocs = (await runQueries([
    ...inQueries(db, 'jobs', 'clientiIds', clienteIds, 'array-contains-any'),
    ...inQueries(db, 'jobs', 'clienteId', clienteIds),
  ])).filter(j => !j.data.deletedAt);
  const jobIds = jobDocs.map(j => j.id);

  const directGalleries = await runQueries([
    ...inQueries(db, 'galleries', 'clientiIds', clienteIds, 'array-contains-any'),
    ...inQueries(db, 'galleries', 'clientIds', clienteIds, 'array-contains-any'),
    ...inQueries(db, 'galleries', 'clienteId', clienteIds),
  ]);
  const knownGalleryIds = new Set(directGalleries.map(g => g.id));
  const jobGalleryIds = unique(jobDocs.flatMap(j => (Array.isArray(j.data.galleryIds) ? j.data.galleryIds : [])))
    .filter(id => !knownGalleryIds.has(id));
  const allGalleries = [...directGalleries, ...await getByIds(db, 'galleries', jobGalleryIds)];

  const quoteIdsFromJobs = unique(jobDocs.flatMap(j => (Array.isArray(j.data.quoteIds) ? j.data.quoteIds : [])));
  const [quoteDocsByClient, quoteDocsByJob, scheduleDocs, photobookDocs] = await Promise.all([
    runQueries(inQueries(db, 'quotes', 'clienteId', clienteIds)),
    getByIds(db, 'quotes', quoteIdsFromJobs),
    runQueries(inQueries(db, 'paymentSchedules', 'jobId', jobIds)),
    runQueries([
      ...inQueries(db, 'photobooks', 'jobId', jobIds),
      ...inQueries(db, 'photobooks', 'galleryId', allGalleries.map(g => g.id)),
    ]),
  ]);
  const quoteDocs = new Map<string, Doc>();
  for (const q of [...quoteDocsByClient, ...quoteDocsByJob]) quoteDocs.set(q.id, q);

  const galleriesById = new Map(allGalleries.map(g => [g.id, g]));
  const jobs = jobDocs.map(job => {
    const jobGalleries = allGalleries.filter(g =>
      g.data.jobId === job.id || (Array.isArray(job.data.galleryIds) && job.data.galleryIds.includes(g.id)));
    const jobGalleryIdSet = new Set(jobGalleries.map(g => g.id));
    const quotes: ClientAreaQuote[] = [...quoteDocs.values()]
      .filter(q => q.data.jobId === job.id || (Array.isArray(job.data.quoteIds) && job.data.quoteIds.includes(q.id)))
      .map(q => toClientQuote(q.id, q.data))
      .filter((q): q is ClientAreaQuote => Boolean(q));
    const paymentPlans = scheduleDocs
      .filter(s => s.data.jobId === job.id)
      .map(s => toClientPaymentPlan(s.id, s.data))
      .filter(plan => plan.payments.length > 0);
    const photobooks = photobookDocs
      .filter(p => p.data.jobId === job.id || jobGalleryIdSet.has(p.data.galleryId))
      .map(p => ({ id: p.id, data: p.data }));
    return {
      visible: isJobVisibleToClient(job.data, quotes),
      job: toClientJob(job.id, job.data, {
        quotes, paymentPlans, photobooks, now,
        galleries: jobGalleries.map(g => g.data),
      }),
    };
  }).filter(j => j.visible).map(j => j.job);

  // Ogni galleria visibile una sola volta. Le gallerie dei job nascosti (lead
  // senza preventivo) restano visibili solo se collegate direttamente al cliente.
  const visibleJobIds = new Set(jobs.map(j => j.id));
  const clienteIdSet = new Set(clienteIds);
  const galleries = [...galleriesById.values()]
    .filter(g => isGalleryVisibleToClient(g.data))
    .filter(g => galleryClientIdsOf(g.data).some(id => clienteIdSet.has(id))
      || jobs.some(j => j.galleryIds.includes(g.id)) || visibleJobIds.has(g.data.jobId))
    .map(g => toClientGallery(g.id, g.data))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    cliente: {
      nome: typeof first.nome === 'string' ? first.nome : '',
      cognome: typeof first.cognome === 'string' ? first.cognome : '',
      email,
    },
    jobs: jobs.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || '')),
    galleries,
    bookings: await bookingsFor(db, bookingDocs),
    bankDetails,
  };
}

async function bookingsFor(db: Firestore, bookingDocs: Doc[]) {
  const campaignIds = unique(bookingDocs.map(b => b.data.campaignId));
  const campaigns = await getByIds(db, 'booking_campaigns', campaignIds);
  const names: Record<string, string> = {};
  for (const c of campaigns) if (typeof c.data.nome === 'string') names[c.id] = c.data.nome;
  return bookingDocs
    .map(b => toClientBooking(b.id, b.data, names))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .sort((a, b) => (b.start || '').localeCompare(a.start || ''));
}
