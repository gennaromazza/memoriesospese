/**
 * Area Cliente — modello condiviso tra api-server e sito.
 *
 * Il server legge i documenti Firestore con firebase-admin e li trasforma con
 * le funzioni di questo file: al cliente arrivano SOLO i campi elencati nei
 * tipi `ClientArea*`. Note interne, costi, collaboratori, firme e dati fiscali
 * non vengono mai copiati.
 *
 * Due parti indipendenti:
 *  - Lavori (job): preventivi/contratti, pagamenti, fotolibri, tappe automatiche.
 *  - Gallerie: collegate direttamente ai clienti; la selezione vive qui.
 */

// ─── Tipi esposti al cliente ────────────────────────────────────────────────

export interface ClientAreaMilestone {
  id: 'creato' | 'contratto' | 'servizio' | 'galleria' | 'selezione' | 'fotolibro' | 'consegnato';
  label: string;
  done: boolean;
  /** Data ISO della tappa, se nota (anche futura, es. data del servizio). */
  date?: string;
}

export interface ClientAreaQuote {
  id: string;
  status: 'inviato' | 'visionato' | 'firmato' | 'rifiutato' | 'scaduto';
  total: number | null;
  signedAt?: string;
  /** Link alla pagina esistente del preventivo o del contratto firmato. */
  url: string;
}

export interface ClientAreaPayment {
  id: string;
  tipo: 'acconto' | 'saldo' | 'rata';
  importo: number;
  dataScadenza?: string;
  stato: 'atteso' | 'pagato' | 'parziale' | 'scaduto';
  importoPagato?: number;
  dataPagamento?: string;
}

export interface ClientAreaPaymentPlan {
  id: string;
  totale: number;
  totalePagato: number;
  saldoResiduo: number;
  payments: ClientAreaPayment[];
}

export interface ClientAreaPhotobook {
  id: string;
  name: string;
  url: string;
  approved: boolean;
}

export interface ClientAreaJob {
  id: string;
  nomeEvento: string;
  jobType?: string;
  eventDate?: string;
  eventLocation?: string;
  milestones: ClientAreaMilestone[];
  quotes: ClientAreaQuote[];
  paymentPlans: ClientAreaPaymentPlan[];
  photobooks: ClientAreaPhotobook[];
  galleryIds: string[];
}

export interface ClientAreaGallery {
  id: string;
  /** Codice usato negli URL /view/:code (o id documento per le gallerie vecchie). */
  accessKey: string;
  name: string;
  date?: string;
  coverUrl?: string;
  photoCount: number;
  jobId?: string;
  selection: null | {
    status: 'pending' | 'completed';
    deadline?: string;
    requiredPhotoCount?: number;
    unlimited: boolean;
    selectedCount: number;
    completedAt?: string;
    notes?: string;
    photoNotesCount: number;
  };
}

export interface ClientAreaBooking {
  id: string;
  campaignName?: string;
  start?: string;
  end?: string;
  prodottoNome?: string;
  stato: string;
  totale?: number;
  acconto?: number;
  saldo?: number;
}

export interface ClientAreaBankDetails {
  iban: string;
  intestatario: string;
  banca?: string;
  causale?: string;
}

export interface ClientAreaOverview {
  cliente: { nome: string; cognome: string; email: string };
  jobs: ClientAreaJob[];
  galleries: ClientAreaGallery[];
  bookings: ClientAreaBooking[];
  bankDetails: ClientAreaBankDetails | null;
}

/** Documento Firestore `clientAreaSettings/main` (solo admin, letto dal server). */
export interface ClientAreaSettings {
  iban?: string;
  intestatario?: string;
  banca?: string;
  /** Causale suggerita; `{evento}` viene sostituito col nome del lavoro. */
  causale?: string;
}

// ─── Utilità ────────────────────────────────────────────────────────────────

type AnyRecord = Record<string, any>;

/** Converte Timestamp Firestore (admin o client), Date, stringa o numero in ISO. */
export function toIso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (typeof value === 'object') {
    const v = value as AnyRecord;
    if (typeof v.toDate === 'function') date = v.toDate();
    else if (typeof v.seconds === 'number') date = new Date(v.seconds * 1000);
    else if (typeof v._seconds === 'number') date = new Date(v._seconds * 1000);
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function ids(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      const id = str(item);
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

export function normalizeClientEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── IBAN ───────────────────────────────────────────────────────────────────

export function normalizeIban(iban: unknown): string {
  return typeof iban === 'string' ? iban.replace(/\s+/g, '').toUpperCase() : '';
}

/** Controllo ISO 13616 (mod 97). */
export function isValidIban(iban: unknown): boolean {
  const value = normalizeIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  if (value.startsWith('IT') && value.length !== 27) return false;
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export function formatIban(iban: unknown): string {
  return normalizeIban(iban).replace(/(.{4})/g, '$1 ').trim();
}

export function bankDetailsFromSettings(
  settings: ClientAreaSettings | null | undefined,
): ClientAreaBankDetails | null {
  const iban = normalizeIban(settings?.iban);
  const intestatario = str(settings?.intestatario);
  if (!iban || !intestatario || !isValidIban(iban)) return null;
  return {
    iban: formatIban(iban),
    intestatario,
    ...(str(settings?.banca) ? { banca: str(settings?.banca) } : {}),
    ...(str(settings?.causale) ? { causale: str(settings?.causale) } : {}),
  };
}

// ─── Trasformazioni (solo campi consentiti) ────────────────────────────────

const VISIBLE_QUOTE_STATUSES = new Set(['inviato', 'visionato', 'firmato', 'rifiutato', 'scaduto']);

export function toClientQuote(id: string, data: AnyRecord): ClientAreaQuote | null {
  const status = data.status;
  if (!VISIBLE_QUOTE_STATUSES.has(status)) return null;
  const token = str(data.publicToken);
  if (!token) return null;
  const total = num(data.totaleSelezionato) ?? num(data.totalAfterDiscount) ?? num(data.totaleBase) ?? null;
  const signedAt = status === 'firmato' ? toIso(data.signature?.signedAt) : undefined;
  return {
    id,
    status,
    total,
    ...(signedAt ? { signedAt } : {}),
    url: `/quote/${encodeURIComponent(token)}`,
  };
}

export function toClientPaymentPlan(id: string, data: AnyRecord): ClientAreaPaymentPlan {
  const payments: ClientAreaPayment[] = (Array.isArray(data.payments) ? data.payments : [])
    .filter((p: AnyRecord) => p && typeof p === 'object')
    .map((p: AnyRecord, index: number) => {
      const stato = ['atteso', 'pagato', 'parziale', 'scaduto'].includes(p.stato) ? p.stato : 'atteso';
      const tipo = ['acconto', 'saldo', 'rata'].includes(p.tipo) ? p.tipo : 'rata';
      const payment: ClientAreaPayment = {
        id: str(p.id) || `${id}-${index}`,
        tipo,
        importo: num(p.importo) ?? 0,
        stato,
      };
      const due = toIso(p.dataScadenza);
      if (due) payment.dataScadenza = due;
      if (num(p.importoPagato) !== undefined) payment.importoPagato = num(p.importoPagato);
      const paidAt = toIso(p.dataPagamento);
      if (paidAt) payment.dataPagamento = paidAt;
      return payment;
    })
    .sort((a: ClientAreaPayment, b: ClientAreaPayment) =>
      (a.dataScadenza || '').localeCompare(b.dataScadenza || ''));

  const totale = num(data.totale) ?? payments.reduce((sum, p) => sum + p.importo, 0);
  const totalePagato = num(data.totalePagato)
    ?? payments.reduce((sum, p) => sum + (p.importoPagato ?? (p.stato === 'pagato' ? p.importo : 0)), 0);
  const saldoResiduo = num(data.saldoResiduo) ?? Math.max(0, totale - totalePagato);
  return { id, totale, totalePagato, saldoResiduo, payments };
}

export function toClientPhotobook(id: string, data: AnyRecord): ClientAreaPhotobook | null {
  const token = str(data.token);
  if (!token) return null;
  const approved = Boolean(data.approval && data.approval.version === data.currentVersion);
  return {
    id,
    name: str(data.name) || 'Fotolibro',
    url: `/fotolibro/${encodeURIComponent(token)}`,
    approved,
  };
}

/** Una galleria è visibile al cliente se non è in bozza né archiviata. */
export function isGalleryVisibleToClient(data: AnyRecord): boolean {
  if (data.active === false) return false;
  if (data.status === 'draft' || data.status === 'archived') return false;
  return true;
}

export function galleryClientIdsOf(data: AnyRecord): string[] {
  return ids(data.clientiIds, data.clientIds, data.clienteId);
}

export function jobClientIdsOf(data: AnyRecord): string[] {
  return ids(data.clientiIds, data.clienteId);
}

function lastSnapshotDate(data: AnyRecord): string | undefined {
  const snapshots = Array.isArray(data.selectionSnapshots) ? data.selectionSnapshots : [];
  return snapshots
    .map((s: AnyRecord) => toIso(s?.timestamp ?? s?.confirmedAt ?? s?.createdAt))
    .filter((d: string | undefined): d is string => Boolean(d))
    .sort()
    .pop();
}

export function toClientGallery(id: string, data: AnyRecord): ClientAreaGallery {
  const selectionEnabled = data.selectionEnabled === true;
  const photoNotes = data.photoNotes && typeof data.photoNotes === 'object' ? data.photoNotes : {};
  const gallery: ClientAreaGallery = {
    id,
    accessKey: str(data.code) || id,
    name: str(data.name) || 'Galleria',
    photoCount: num(data.photoCount) ?? 0,
    selection: null,
  };
  const date = toIso(data.date ?? data.eventDate);
  if (date) gallery.date = date;
  const cover = str(data.coverImageMobile) || str(data.mobileCoverUrl) || str(data.coverImageDesktop)
    || str(data.coverUrl) || str(data.coverImageUrl);
  if (cover) gallery.coverUrl = cover;
  const jobId = str(data.jobId);
  if (jobId) gallery.jobId = jobId;

  if (selectionEnabled) {
    const status = data.selectionStatus === 'completed' ? 'completed' : 'pending';
    gallery.selection = {
      status,
      unlimited: data.unlimitedSelection === true,
      selectedCount: Array.isArray(data.selectedPhotoIds) ? data.selectedPhotoIds.length : 0,
      photoNotesCount: Object.values(photoNotes).filter(n => typeof n === 'string' && n.trim()).length,
    };
    const deadline = toIso(data.selectionDeadline);
    if (deadline) gallery.selection.deadline = deadline;
    if (num(data.requiredPhotoCount)) gallery.selection.requiredPhotoCount = num(data.requiredPhotoCount);
    const completedAt = status === 'completed' ? lastSnapshotDate(data) : undefined;
    if (completedAt) gallery.selection.completedAt = completedAt;
    if (str(data.selectionNotes)) gallery.selection.notes = str(data.selectionNotes);
  }
  return gallery;
}

const HIDDEN_BOOKING_STATES = new Set(['annullata', 'cancellata', 'cancellation_pending']);

export function toClientBooking(
  id: string,
  data: AnyRecord,
  campaignNames: Record<string, string>,
): ClientAreaBooking | null {
  const stato = str(data.stato) || 'in_attesa';
  if (HIDDEN_BOOKING_STATES.has(stato)) return null;
  const booking: ClientAreaBooking = { id, stato };
  const campaignName = campaignNames[str(data.campaignId) || ''];
  if (campaignName) booking.campaignName = campaignName;
  const start = toIso(data.dataShootingInizio);
  if (start) booking.start = start;
  const end = toIso(data.dataShootingFine);
  if (end) booking.end = end;
  if (str(data.prodottoNome)) booking.prodottoNome = str(data.prodottoNome);
  if (num(data.totale) !== undefined) booking.totale = num(data.totale);
  if (num(data.acconto) !== undefined) booking.acconto = num(data.acconto);
  if (num(data.saldo) !== undefined) booking.saldo = num(data.saldo);
  return booking;
}

// ─── Tappe automatiche del lavoro ──────────────────────────────────────────

export interface MilestoneInputs {
  job: AnyRecord;
  quotes: ClientAreaQuote[];
  galleries: AnyRecord[];
  photobooks: AnyRecord[];
  now?: Date;
}

/**
 * Calcola le tappe del lavoro dai dati esistenti (nessun inserimento a mano):
 * lavoro registrato → contratto firmato → servizio → galleria → selezione →
 * fotolibro → consegnato. Le tappe che non riguardano il lavoro (es. nessun
 * fotolibro) non vengono mostrate.
 */
export function computeMilestones({ job, quotes, galleries, photobooks, now = new Date() }: MilestoneInputs): ClientAreaMilestone[] {
  const milestones: ClientAreaMilestone[] = [];
  const earliest = (dates: (string | undefined)[]) =>
    dates.filter((d): d is string => Boolean(d)).sort()[0];

  milestones.push({ id: 'creato', label: 'Lavoro registrato', done: true, ...dateField(toIso(job.createdAt)) });

  const signedDates = quotes.filter(q => q.status === 'firmato').map(q => q.signedAt);
  const signed = quotes.some(q => q.status === 'firmato');
  milestones.push({ id: 'contratto', label: 'Contratto firmato', done: signed, ...dateField(earliest(signedDates)) });

  const eventDate = job.dataNonDefinita === true ? undefined : toIso(job.eventDate);
  if (eventDate) {
    milestones.push({ id: 'servizio', label: 'Servizio fotografico', done: new Date(eventDate) <= now, date: eventDate });
  }

  const visibleGalleries = galleries.filter(isGalleryVisibleToClient);
  if (visibleGalleries.length > 0) {
    milestones.push({
      id: 'galleria',
      label: 'Galleria pronta',
      done: true,
      ...dateField(earliest(visibleGalleries.map(g => toIso(g.createdAt)))),
    });
    const withSelection = visibleGalleries.filter(g => g.selectionEnabled === true);
    if (withSelection.length > 0) {
      const completed = withSelection.every(g => g.selectionStatus === 'completed');
      const completedDates = withSelection.map(lastSnapshotDate).filter(Boolean) as string[];
      milestones.push({
        id: 'selezione',
        label: 'Selezione foto completata',
        done: completed,
        ...dateField(completed ? completedDates.sort().pop() : undefined),
      });
    }
  }

  if (photobooks.length > 0) {
    const approved = photobooks.every(p => p.approval && p.approval.version === p.currentVersion);
    const approvedDates = photobooks.map(p => toIso(p.approval?.approvedAt)).filter(Boolean) as string[];
    milestones.push({
      id: 'fotolibro',
      label: 'Fotolibro approvato',
      done: approved,
      ...dateField(approved ? approvedDates.sort().pop() : undefined),
    });
  }

  const delivered = job.status === 'consegnato' || job.status === 'archiviato';
  milestones.push({ id: 'consegnato', label: 'Lavoro consegnato', done: delivered });
  return milestones;
}

function dateField(date: string | undefined): { date?: string } {
  return date ? { date } : {};
}

/** Un job è visibile se non è eliminato e non è un semplice contatto senza preventivi inviati. */
export function isJobVisibleToClient(job: AnyRecord, visibleQuotes: ClientAreaQuote[]): boolean {
  if (job.deletedAt) return false;
  if (job.status === 'lead' && visibleQuotes.length === 0) return false;
  return true;
}

export function toClientJob(
  id: string,
  job: AnyRecord,
  related: {
    quotes: ClientAreaQuote[];
    paymentPlans: ClientAreaPaymentPlan[];
    galleries: AnyRecord[];
    photobooks: { id: string; data: AnyRecord }[];
    now?: Date;
  },
): ClientAreaJob {
  const photobooks = related.photobooks
    .map(p => toClientPhotobook(p.id, p.data))
    .filter((p): p is ClientAreaPhotobook => Boolean(p));
  const result: ClientAreaJob = {
    id,
    nomeEvento: str(job.nomeEvento) || 'Il tuo lavoro',
    milestones: computeMilestones({
      job,
      quotes: related.quotes,
      galleries: related.galleries,
      photobooks: related.photobooks.map(p => p.data),
      now: related.now,
    }),
    quotes: related.quotes,
    paymentPlans: related.paymentPlans,
    photobooks,
    galleryIds: ids(job.galleryIds),
  };
  if (str(job.jobType)) result.jobType = str(job.jobType);
  const eventDate = job.dataNonDefinita === true ? undefined : toIso(job.eventDate);
  if (eventDate) result.eventDate = eventDate;
  if (str(job.eventLocation)) result.eventLocation = str(job.eventLocation);
  return result;
}

/** Sostituisce `{evento}` nella causale suggerita. */
export function causaleFor(template: string | undefined, nomeEvento: string): string | undefined {
  if (!template) return undefined;
  return template.replace(/\{evento\}/gi, nomeEvento).trim();
}
