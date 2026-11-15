const harnessKey = 'booking-deposit-browser-harness';

function readHarnessState(): Record<string, any> {
  try { return JSON.parse(window.localStorage.getItem(harnessKey) || '{}'); }
  catch { return {}; }
}

function saveHarnessState(value: Record<string, any>) {
  window.localStorage.setItem(harnessKey, JSON.stringify(value));
}

function record(name: string, detail?: unknown) {
  const value = readHarnessState();
  value.calls = [...(value.calls || []), { name, detail }];
  saveHarnessState(value);
}

export async function getCampaignByCode(code: string) {
  return {
    id: "campaign-browser-test",
    code,
    nome: "Shooting di prova",
    descrizione: "Campagna fittizia per testare il checkout.",
    dataInizio: new Date("2030-12-01T00:00:00.000Z"),
    dataFine: new Date("2030-12-03T23:59:59.000Z"),
    durataShootingMinuti: 30,
    prodottiDisponibili: [],
    attiva: true,
    richiedeApprovazione: false,
    richiedeAcconto: true,
    accontoImportoCentesimi: 2500,
  };
}

export async function getAllProducts() {
  return [];
}

export async function getAvailableSlots() {
  return [{
    start: "2030-12-01T09:00:00.000Z",
    end: "2030-12-01T09:30:00.000Z",
    startTime: "10:00",
    endTime: "10:30",
  }];
}

export async function createBooking() {
  throw new Error("Il checkout con acconto non deve usare la creazione standard.");
}

export async function getBookingPaymentDetails(bookingId: string) {
  const value = readHarnessState();
  const data = value.adminPayments?.[bookingId] ?? value.adminPayment;
  if (!data || data.bookingId !== bookingId) {
    throw Object.assign(new Error('Pagamento di prova non trovato'), { status: 404 });
  }
  return data;
}

export async function resendBookingDeposit(bookingId: string, requestId: string) {
  record('resend-email', { bookingId, requestId });
  const value = readHarnessState();
  const data = value.adminPayments?.[bookingId] ?? value.adminPayment;
  if (!data || data.bookingId !== bookingId) {
    throw Object.assign(new Error('Richiesta di prova non trovata'), { status: 404 });
  }
  const updated = {
    ...data,
    canResend: false,
    resendReason: 'Attendi prima di effettuare un altro invio.',
  };
  if (value.adminPayments?.[bookingId]) value.adminPayments[bookingId] = updated;
  else value.adminPayment = updated;
  saveHarnessState(value);
  return updated;
}

export async function verifyBookingDeposit(bookingId: string) {
  record('verify-payment', { bookingId });
  const value = readHarnessState();
  const data = value.adminPayments?.[bookingId] ?? value.adminPayment;
  if (!data || data.bookingId !== bookingId) {
    throw Object.assign(new Error('Richiesta di prova non trovata'), { status: 404 });
  }
  return { ...data, providerStatus: data.providerStatus || 'APPROVED' };
}

export async function getBookingPaymentCheckouts() {
  record('list-checkouts');
  const value = readHarnessState();
  return { items: value.recoveryCheckouts || [], truncated: false };
}

export class BookingRequestError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = "BookingRequestError";
  }
}
