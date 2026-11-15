/**
 * Area Cliente — modello condiviso tra api-server e sito.
 *
 * Il server legge i documenti Firestore con firebase-admin e li trasforma con
 * le funzioni di questo file: al cliente arrivano SOLO i campi elencati nei
 * tipi `ClientArea*`. Note interne, costi, collaboratori, firme e dati fiscali
 * non vengono mai copiati.
 *
 * Due parti indipendenti:
 *  - Lavori (job): tre tappe (contratto, visione delle foto, ritiro) e pagamenti.
 *  - Gallerie: collegate direttamente ai clienti; selezione e fotolibri vivono qui.
 *  - Appuntamenti: consulenze prenotate, inviti a prenotare, prenotazioni campagne.
 */

// ─── Tipi esposti al cliente ────────────────────────────────────────────────

/**
 * Tappa del lavoro. `state`:
 *  - todo:    non ancora iniziata (nessuna azione per il cliente)
 *  - action:  serve un'azione del cliente (firmare, prenotare)
 *  - waiting: in corso, si attende lo studio o la data
 *  - done:    completata
 *  - closed:  chiusa senza esito (es. preventivo rifiutato o scaduto)
 */
export interface ClientAreaJobStep {
  id: 'contratto' | 'visione' | 'ritiro';
  label: string;
  state: 'todo' | 'action' | 'waiting' | 'done' | 'closed';
  status: string;
  date?: string;
  actionUrl?: string;
  actionLabel?: string;
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

/** Consulenza o appuntamento che il cliente può prenotare da solo per un lavoro. */
export interface ClientAreaBookable {
  templateId: string;
  title: string;
  durataMinuti?: number;
  descrizione?: string;
  /** Pagina pubblica di prenotazione, già collegata al lavoro (`jobId`). */
  url: string;
}

export interface ClientAreaJob {
  id: string;
  nomeEvento: string;
  jobType?: string;
  eventDate?: string;
  eventLocation?: string;
  steps: ClientAreaJobStep[];
  quotes: ClientAreaQuote[];
  paymentPlans: ClientAreaPaymentPlan[];
  bookable: ClientAreaBookable[];
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
  photobooks: ClientAreaPhotobook[];
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

/** Consulenza o appuntamento prenotato (raccolta `consultations`). */
export interface ClientAreaAppointment {
  id: string;
  title: string;
  start?: string;
  orarioInizio?: string;
  orarioFine?: string;
  stato: 'in_attesa' | 'confermata' | 'completata';
  jobId?: string;
  nomeEvento?: string;
}

/** Invito a prenotare inviato dallo studio e non ancora usato. */
export interface ClientAreaInvite {
  id: string;
  templateId: string;
  title: string;
  jobId: string;
  nomeEvento: string;
  sentAt?: string;
  url: string;
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
  appointments: ClientAreaAppointment[];
  invites: ClientAreaInvite[];
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
    photobooks: [],
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

// ─── Consulenze e inviti ───────────────────────────────────────────────────

const ACTIVE_CONSULTATION_STATES = new Set(['in_attesa', 'confermata', 'completata']);

/**
 * Una consulenza prenotata dal link d'invito di un lavoro porta `linkedJobId`
 * (il `jobId` della consulenza indica invece il lavoro *creato* da una
 * consulenza conoscitiva).
 */
export function consultationJobId(data: AnyRecord): string | undefined {
  return str(data.linkedJobId);
}

export function toClientAppointment(
  id: string,
  data: AnyRecord,
  jobNames: Record<string, string>,
): ClientAreaAppointment | null {
  const stato = data.stato;
  if (!ACTIVE_CONSULTATION_STATES.has(stato)) return null;
  const appointment: ClientAreaAppointment = { id, title: str(data.templateNome) || 'Appuntamento', stato };
  const start = toIso(data.dataConsulenza);
  if (start) appointment.start = start;
  if (str(data.orarioInizio)) appointment.orarioInizio = str(data.orarioInizio);
  if (str(data.orarioFine)) appointment.orarioFine = str(data.orarioFine);
  const jobId = consultationJobId(data);
  if (jobId) {
    appointment.jobId = jobId;
    if (jobNames[jobId]) appointment.nomeEvento = jobNames[jobId];
  }
  return appointment;
}

/** Trasforma un link assoluto d'invito in percorso del sito (nessun dominio esterno). */
export function invitePath(link: unknown): string | undefined {
  const value = str(link);
  if (!value) return undefined;
  try {
    const url = new URL(value, 'https://placeholder.invalid');
    if (!/^\/consulenze\/[^/]+\/[^/]+\/prenota$/.test(url.pathname)) return undefined;
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}

/**
 * Inviti a prenotare ancora aperti per un lavoro: eventi `consulenza_inviata`
 * per i quali non c'è ancora una consulenza attiva dello stesso modello.
 */
export function openInvitesForJob(
  jobId: string,
  job: AnyRecord,
  jobConsultations: AnyRecord[],
): ClientAreaInvite[] {
  const events = (Array.isArray(job.workflowEvents) ? job.workflowEvents : [])
    .filter((e: AnyRecord) => e?.tipo === 'consulenza_inviata' && invitePath(e?.metadata?.consultationLink));
  const usedTemplates = new Set(jobConsultations
    .filter(c => ACTIVE_CONSULTATION_STATES.has(c.stato))
    .map(c => str(c.templateId))
    .filter(Boolean));
  const latestByTemplate = new Map<string, AnyRecord>();
  for (const event of events) {
    const templateId = str(event.metadata?.templateId) || invitePath(event.metadata?.consultationLink)!;
    const current = latestByTemplate.get(templateId);
    if (!current || (toIso(event.data) || '') > (toIso(current.data) || '')) latestByTemplate.set(templateId, event);
  }
  return [...latestByTemplate.entries()]
    .filter(([templateId]) => !usedTemplates.has(templateId))
    .map(([templateId, event]) => {
      const invite: ClientAreaInvite = {
        id: `${jobId}-${templateId}`,
        templateId,
        title: str(event.metadata?.templateNome) || 'Appuntamento',
        jobId,
        nomeEvento: str(job.nomeEvento) || 'Il tuo lavoro',
        url: invitePath(event.metadata?.consultationLink)!,
      };
      const sentAt = toIso(event.data);
      if (sentAt) invite.sentAt = sentAt;
      return invite;
    });
}

/**
 * Modelli di consulenza/appuntamento prenotabili in autonomia per un lavoro:
 * gli stessi del sito pubblico (`/consulenze/:tipo`), cioè attivi e dello
 * stesso tipo di lavoro. Il link porta `jobId`, così la prenotazione resta
 * collegata al lavoro (`linkedJobId`). Si nasconde un modello quando c'è già
 * una prenotazione in attesa o confermata per quel lavoro.
 */
export function bookableTemplatesForJob(
  jobId: string,
  job: AnyRecord,
  templates: { id: string; data: AnyRecord }[],
  jobConsultations: AnyRecord[],
): ClientAreaBookable[] {
  const jobType = str(job.jobType);
  if (!jobType || job.status === 'archiviato' || job.deletedAt) return [];
  const pending = new Set(jobConsultations
    .filter(c => c.stato === 'in_attesa' || c.stato === 'confermata')
    .map(c => str(c.templateId))
    .filter(Boolean));
  return templates
    .filter(t => t.data.attiva === true && str(t.data.jobType) === jobType && !pending.has(t.id))
    .sort((a, b) => (num(a.data.ordine) ?? 0) - (num(b.data.ordine) ?? 0))
    .map(t => {
      const bookable: ClientAreaBookable = {
        templateId: t.id,
        title: str(t.data.nome) || 'Appuntamento',
        url: `/consulenze/${encodeURIComponent(jobType)}/${encodeURIComponent(t.id)}/prenota?jobId=${encodeURIComponent(jobId)}`,
      };
      if (num(t.data.durataMinuti)) bookable.durataMinuti = num(t.data.durataMinuti);
      if (str(t.data.descrizione)) bookable.descrizione = str(t.data.descrizione)!.slice(0, 280);
      return bookable;
    });
}

// ─── Tappe del lavoro: contratto → visione → ritiro ────────────────────────

export interface JobStepInputs {
  job: AnyRecord;
  quotes: ClientAreaQuote[];
  /** Consulenze collegate al lavoro (`linkedJobId`). */
  consultations: AnyRecord[];
  invites: ClientAreaInvite[];
  /** Modelli prenotabili in autonomia: quello di visione apre la tappa anche senza invito. */
  bookable?: ClientAreaBookable[];
}

function contractStep(quotes: ClientAreaQuote[]): ClientAreaJobStep {
  const base = { id: 'contratto' as const, label: 'Contratto' };
  const signed = quotes.filter(q => q.status === 'firmato');
  if (signed.length > 0) {
    const date = signed.map(q => q.signedAt).filter(Boolean).sort()[0];
    return { ...base, state: 'done', status: 'Firmato', ...(date ? { date } : {}) };
  }
  const toSign = quotes.find(q => q.status === 'inviato' || q.status === 'visionato');
  if (toSign) return { ...base, state: 'action', status: 'Da firmare', actionUrl: toSign.url, actionLabel: 'Leggi e firma' };
  if (quotes.some(q => q.status === 'rifiutato')) return { ...base, state: 'closed', status: 'Rifiutato' };
  if (quotes.some(q => q.status === 'scaduto')) return { ...base, state: 'closed', status: 'Scaduto' };
  return { ...base, state: 'todo', status: 'Non ancora inviato' };
}

function visionStep(consultations: AnyRecord[], invites: ClientAreaInvite[], bookable: ClientAreaBookable[]): ClientAreaJobStep {
  const base = { id: 'visione' as const, label: 'Visione delle foto' };
  const byDateDesc = (list: AnyRecord[]) =>
    [...list].sort((a, b) => (toIso(b.dataConsulenza) || '').localeCompare(toIso(a.dataConsulenza) || ''));
  const done = byDateDesc(consultations.filter(c => c.stato === 'completata'))[0];
  if (done) return { ...base, state: 'done', status: 'Svolta', ...dateField(toIso(done.dataConsulenza)) };
  const confirmed = byDateDesc(consultations.filter(c => c.stato === 'confermata'))[0];
  if (confirmed) return { ...base, state: 'waiting', status: 'Programmata', ...dateField(toIso(confirmed.dataConsulenza)) };
  const requested = byDateDesc(consultations.filter(c => c.stato === 'in_attesa'))[0];
  if (requested) {
    return { ...base, state: 'waiting', status: 'Richiesta inviata, in attesa di conferma', ...dateField(toIso(requested.dataConsulenza)) };
  }
  const invite = invites[0];
  if (invite) return { ...base, state: 'action', status: 'Da prenotare', actionUrl: invite.url, actionLabel: 'Prenota la visione' };
  const visionTemplate = bookable.find(b => /vision/i.test(b.title));
  if (visionTemplate) {
    return { ...base, state: 'todo', status: 'Puoi prenotarla quando vuoi', actionUrl: visionTemplate.url, actionLabel: 'Prenota la visione' };
  }
  return { ...base, state: 'todo', status: 'Riceverai l’invito a prenotarla quando le foto saranno pronte' };
}

function pickupStep(job: AnyRecord): ClientAreaJobStep {
  const base = { id: 'ritiro' as const, label: 'Ritiro' };
  if (job.status === 'consegnato' || job.status === 'archiviato') {
    const event = (Array.isArray(job.workflowEvents) ? job.workflowEvents : [])
      .filter((e: AnyRecord) => e?.tipo === 'status_change' && /consegnato/i.test(String(e?.descrizione || '')))
      .map((e: AnyRecord) => toIso(e.data))
      .filter(Boolean)
      .sort()
      .pop();
    return { ...base, state: 'done', status: 'Ritirato', ...dateField(event) };
  }
  return { ...base, state: 'todo', status: 'Ti avviseremo quando sarà pronto' };
}

export function computeJobSteps({ job, quotes, consultations, invites, bookable = [] }: JobStepInputs): ClientAreaJobStep[] {
  return [contractStep(quotes), visionStep(consultations, invites, bookable), pickupStep(job)];
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
    consultations: AnyRecord[];
    invites: ClientAreaInvite[];
    bookable?: ClientAreaBookable[];
  },
): ClientAreaJob {
  const result: ClientAreaJob = {
    id,
    nomeEvento: str(job.nomeEvento) || 'Il tuo lavoro',
    steps: computeJobSteps({
      job, quotes: related.quotes, consultations: related.consultations, invites: related.invites, bookable: related.bookable,
    }),
    quotes: related.quotes,
    paymentPlans: related.paymentPlans,
    bookable: related.bookable ?? [],
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
