import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  BOOKING_CONDITIONS_TEXT, BOOKING_CONDITIONS_VERSION, BOOKING_CONDITIONS_NATALE_2026_TEXT, BOOKING_CONDITIONS_NATALE_2026_VERSION,
  bookingConditionsFor, bookingConditionsSnapshot, isKnownBookingConditions,
} from '@shared/booking-conditions';
import { rescheduleNoticeFor } from '@shared/seasonal-vademecum';
import { rescheduleView } from './reschedule-policy.js';
import { cancellationView } from './cancellation-policy.js';

// Natale 2026: il cambio autonomo dell'appuntamento e' possibile fino a 4 giorni prima (come dice il vademecum),
// per le altre campagne resta 24 ore.
const DAY = 86_400_000;
const now = Date.parse('2026-12-01T09:00:00Z');
const natale = { nome: 'Natale 2026', temaStagionale: 'natale' };
const altra = { nome: 'Ritratti', temaStagionale: null };

describe('rescheduleNoticeFor', () => {
  it('4 giorni per Natale 2026, 24 ore per le altre campagne', () => {
    expect(rescheduleNoticeFor(natale)).toEqual({ ms: 4 * DAY, label: '4 giorni' });
    expect(rescheduleNoticeFor(altra)).toEqual({ ms: DAY, label: '24 ore' });
    expect(rescheduleNoticeFor(undefined)).toEqual({ ms: DAY, label: '24 ore' });
    expect(rescheduleNoticeFor({ nome: 'Natale 2025', temaStagionale: 'natale' })).toEqual({ ms: DAY, label: '24 ore' });
  });
});

describe('condizioni di prenotazione per campagna', () => {
  it('Natale 2026 ha la sua versione, con 4 giorni e il vademecum; le altre restano invariate', () => {
    expect(bookingConditionsFor(natale)).toEqual({ version: BOOKING_CONDITIONS_NATALE_2026_VERSION, text: BOOKING_CONDITIONS_NATALE_2026_TEXT });
    expect(BOOKING_CONDITIONS_NATALE_2026_TEXT).toContain('4 giorni');
    expect(BOOKING_CONDITIONS_NATALE_2026_TEXT).not.toContain('24 ore');
    expect(bookingConditionsFor(altra)).toEqual({ version: BOOKING_CONDITIONS_VERSION, text: BOOKING_CONDITIONS_TEXT });
    expect(BOOKING_CONDITIONS_TEXT).toContain('24 ore'); // testo storico: non cambia, le prenotazioni gia' fatte restano valide
  });

  it('lo snapshot salvato segue la campagna, anche se il client invia la versione generica', () => {
    expect(bookingConditionsSnapshot(BOOKING_CONDITIONS_VERSION, natale)).toEqual(bookingConditionsFor(natale));
    expect(bookingConditionsSnapshot(BOOKING_CONDITIONS_NATALE_2026_VERSION, altra)).toEqual(bookingConditionsFor(altra));
    expect(bookingConditionsSnapshot(BOOKING_CONDITIONS_VERSION)).toEqual({ version: BOOKING_CONDITIONS_VERSION, text: BOOKING_CONDITIONS_TEXT });
    expect(bookingConditionsSnapshot(BOOKING_CONDITIONS_NATALE_2026_VERSION)).toEqual(bookingConditionsFor(natale));
  });

  it('una versione sconosciuta o mancante non produce uno snapshot', () => {
    for (const version of ['vecchia', '', undefined, null, 42]) expect(bookingConditionsSnapshot(version, natale)).toBeNull();
  });

  it('isKnownBookingConditions riconosce solo versione e testo corrispondenti', () => {
    expect(isKnownBookingConditions(bookingConditionsFor(natale))).toBe(true);
    expect(isKnownBookingConditions(bookingConditionsFor(altra))).toBe(true);
    expect(isKnownBookingConditions({ version: BOOKING_CONDITIONS_NATALE_2026_VERSION, text: BOOKING_CONDITIONS_TEXT })).toBe(false);
    expect(isKnownBookingConditions({ version: 'x', text: 'y' })).toBe(false);
    expect(isKnownBookingConditions(undefined)).toBe(false);
  });
});

describe('cambio appuntamento: preavviso per campagna', () => {
  const campaign = (extra: Record<string, unknown> = {}) => ({ attiva: true, nome: 'Natale 2026', temaStagionale: 'natale',
    dataInizio: Timestamp.fromMillis(now - 30 * DAY), dataFine: Timestamp.fromMillis(now + 60 * DAY), ...extra });
  const booking = (daysBefore: number) => ({ stato: 'confermata', calendarSyncPending: false,
    dataShootingInizio: Timestamp.fromMillis(now + daysBefore * DAY), dataShootingFine: Timestamp.fromMillis(now + daysBefore * DAY + 2_700_000) });

  it('Natale 2026: 3 giorni prima non e\' piu\' consentito, con messaggio sui 4 giorni', () => {
    const view = rescheduleView(booking(3), campaign(), now);
    expect(view).toMatchObject({ canChange: false, status: 'unavailable' });
    expect(view.reason).toContain('4 giorni');
  });

  it('Natale 2026: esattamente 4 giorni prima e oltre e\' consentito; un attimo prima no', () => {
    expect(rescheduleView(booking(4), campaign(), now).canChange).toBe(true);
    expect(rescheduleView(booking(10), campaign(), now).canChange).toBe(true);
    const almost = { ...booking(4), dataShootingInizio: Timestamp.fromMillis(now + 4 * DAY - 1) };
    expect(rescheduleView(almost, campaign(), now).canChange).toBe(false);
  });

  it('altre campagne: resta 24 ore (a 2 giorni si puo\', sotto le 24 ore no, con il messaggio storico)', () => {
    const other = campaign({ nome: 'Ritratti', temaStagionale: null });
    expect(rescheduleView(booking(2), other, now).canChange).toBe(true);
    const view = rescheduleView(booking(0.5), other, now);
    expect(view.canChange).toBe(false);
    expect(view.reason).toBe('Mancano meno di 24 ore allo shooting: per cambiare appuntamento contatta lo studio.');
  });

  it('senza campagna caricata applica il limite storico di 24 ore', () => {
    expect(rescheduleView(booking(2), undefined, now).reason).not.toContain('4 giorni');
  });
});

describe('annullamento con le condizioni di Natale 2026', () => {
  it('le condizioni di Natale sono riconosciute, quindi l\'annullamento online resta disponibile', () => {
    const view = cancellationView({ stato: 'confermata', bookingConditions: bookingConditionsFor(natale),
      dataShootingInizio: Timestamp.fromMillis(Date.now() + 10 * DAY) });
    expect(view.canCancel).toBe(true);
    expect(view.conditions).toBe(BOOKING_CONDITIONS_NATALE_2026_TEXT);
  });
  it('le condizioni storiche continuano a funzionare', () => {
    const view = cancellationView({ stato: 'confermata', bookingConditions: bookingConditionsFor(altra),
      dataShootingInizio: Timestamp.fromMillis(Date.now() + 10 * DAY) });
    expect(view.canCancel).toBe(true);
    expect(view.conditions).toBe(BOOKING_CONDITIONS_TEXT);
  });
});
