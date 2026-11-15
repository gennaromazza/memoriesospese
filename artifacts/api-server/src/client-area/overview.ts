/**
 * Raccolta dei dati dell'Area Cliente da Firestore (firebase-admin).
 *
 * Collegamento automatico:
 *  1. schede `clienti` con l'email verificata dal codice, o già collegate all'uid;
 *  2. job con quei clienti in `clientiIds` (o `clienteId` legacy);
 *  3. gallerie collegate ai clienti (`clientiIds`/`clientIds`/`clienteId`)
 *     oppure elencate in `galleryIds` di uno dei loro job;
 *  4. preventivi e piani di pagamento dei job;
 *  5. consulenze/appuntamenti del cliente (per `clienteId`, email o
 *     `linkedJobId` di un suo lavoro) e inviti a prenotare ancora aperti;
 *  6. fotolibri delle gallerie;
 *  7. prenotazioni delle campagne con `clienteId` o con la stessa email.
 *
 * Tutto passa dalle funzioni `toClient*` di @shared/client-area, che
 * copiano solo i campi consentiti.
 */
import type { DocumentData, DocumentSnapshot, Firestore, Query } from 'firebase-admin/firestore';
import {
  bankDetailsFromSettings, bookableTemplatesForJob, consultationJobId, galleryClientIdsOf, isGalleryVisibleToClient, isJobVisibleToClient,
  openInvitesForJob, toClientAppointment, toClientBooking, toClientGallery, toClientJob, toClientPaymentPlan,
  toClientPhotobook, toClientQuote,
  type ClientAreaAppointment, type ClientAreaInvite, type ClientAreaOverview, type ClientAreaPhotobook,
  type ClientAreaQuote, type ClientAreaSettings,
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
  { email, uid }: { email: string; uid: string },
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

  const consultationsByClient = await runQueries([
    ...inQueries(db, 'consultations', 'clienteId', clienteIds),
    db.collection('consultations').where('cliente.email', '==', email),
  ]);

  if (clienteIds.length === 0) {
    return {
      cliente: { nome: '', cognome: '', email },
      jobs: [],
      galleries: [],
      appointments: appointmentsFor(consultationsByClient, {}),
      invites: [],
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
  const [quoteDocsByClient, quoteDocsByJob, scheduleDocs, photobookDocs, consultationsByJob] = await Promise.all([
    runQueries(inQueries(db, 'quotes', 'clienteId', clienteIds)),
    getByIds(db, 'quotes', quoteIdsFromJobs),
    runQueries(inQueries(db, 'paymentSchedules', 'jobId', jobIds)),
    runQueries(inQueries(db, 'photobooks', 'galleryId', allGalleries.map(g => g.id))),
    runQueries(inQueries(db, 'consultations', 'linkedJobId', jobIds)),
  ]);
  // Modelli prenotabili: gli stessi del sito pubblico (attivi), filtrati per tipo di lavoro.
  const jobTypes = unique(jobDocs.map(j => j.data.jobType));
  const templateDocs = (await runQueries(inQueries(db, 'consultationTemplates', 'jobType', jobTypes)))
    .filter(t => t.data.attiva === true);
  const consultations = new Map<string, Doc>();
  for (const c of [...consultationsByClient, ...consultationsByJob]) consultations.set(c.id, c);
  const quoteDocs = new Map<string, Doc>();
  for (const q of [...quoteDocsByClient, ...quoteDocsByJob]) quoteDocs.set(q.id, q);

  const galleriesById = new Map(allGalleries.map(g => [g.id, g]));
  const invites: ClientAreaInvite[] = [];
  const jobs = jobDocs.map(job => {
    const quotes: ClientAreaQuote[] = [...quoteDocs.values()]
      .filter(q => q.data.jobId === job.id || (Array.isArray(job.data.quoteIds) && job.data.quoteIds.includes(q.id)))
      .map(q => toClientQuote(q.id, q.data))
      .filter((q): q is ClientAreaQuote => Boolean(q));
    const paymentPlans = scheduleDocs
      .filter(s => s.data.jobId === job.id)
      .map(s => toClientPaymentPlan(s.id, s.data))
      .filter(plan => plan.payments.length > 0);
    const jobConsultations = [...consultations.values()]
      .filter(c => consultationJobId(c.data) === job.id)
      .map(c => c.data);
    const jobInvites = openInvitesForJob(job.id, job.data, jobConsultations);
    const visible = isJobVisibleToClient(job.data, quotes);
    if (visible) invites.push(...jobInvites);
    return {
      visible,
      job: toClientJob(job.id, job.data, {
        quotes, paymentPlans, consultations: jobConsultations, invites: jobInvites,
        // Se c'è un invito aperto per un modello, vale l'invito (rispetta le date scelte dallo studio).
        bookable: bookableTemplatesForJob(job.id, job.data, templateDocs, jobConsultations)
          .filter(b => !jobInvites.some(i => i.templateId === b.templateId)),
      }),
    };
  }).filter(j => j.visible).map(j => j.job);

  // Ogni galleria visibile una sola volta. Le gallerie dei job nascosti (lead
  // senza preventivo) restano visibili solo se collegate direttamente al cliente.
  const visibleJobIds = new Set(jobs.map(j => j.id));
  const clienteIdSet = new Set(clienteIds);
  const visibleJobGalleryIds = new Set(jobDocs
    .filter(j => visibleJobIds.has(j.id))
    .flatMap(j => (Array.isArray(j.data.galleryIds) ? j.data.galleryIds : [])));
  const galleries = [...galleriesById.values()]
    .filter(g => isGalleryVisibleToClient(g.data))
    .filter(g => galleryClientIdsOf(g.data).some(id => clienteIdSet.has(id))
      || visibleJobGalleryIds.has(g.id) || visibleJobIds.has(g.data.jobId))
    .map(g => {
      const gallery = toClientGallery(g.id, g.data);
      gallery.photobooks = photobookDocs
        .filter(p => p.data.galleryId === g.id)
        .map(p => toClientPhotobook(p.id, p.data))
        .filter((p): p is ClientAreaPhotobook => Boolean(p));
      return gallery;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const jobNames: Record<string, string> = {};
  for (const job of jobs) jobNames[job.id] = job.nomeEvento;

  return {
    cliente: {
      nome: typeof first.nome === 'string' ? first.nome : '',
      cognome: typeof first.cognome === 'string' ? first.cognome : '',
      email,
    },
    jobs: jobs.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || '')),
    galleries,
    appointments: appointmentsFor([...consultations.values()], jobNames),
    invites,
    bookings: await bookingsFor(db, bookingDocs),
    bankDetails,
  };
}

function appointmentsFor(docs: Doc[], jobNames: Record<string, string>): ClientAreaAppointment[] {
  return docs
    .map(c => toClientAppointment(c.id, c.data, jobNames))
    .filter((a): a is ClientAreaAppointment => Boolean(a))
    .sort((a, b) => (b.start || '').localeCompare(a.start || ''));
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
