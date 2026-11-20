import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { inspectBookingCalendar, recoverBookingCalendar } from './calendar-recovery.js';
import type { RecoveryCalendar } from './calendar-recovery-google.js';

vi.mock('./calendar-recovery-google.js', () => ({ recoveryCalendar: {} }));
let store: ReturnType<typeof reservationDb>;
let events: Map<string, any>;
const start = Date.parse('2030-12-16T16:30:00Z'), end = start + 45 * 60_000;
const booking = () => ({
  stato: 'confermata', campaignId: 'campaign', cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.test' },
  dataShootingInizio: Timestamp.fromMillis(start), dataShootingFine: Timestamp.fromMillis(end),
  depositPayment: { status: 'paid', amountCents: 500, provider: 'paypal', paypalCaptureId: 'KEEP-CAPTURE' },
  emailConfermataInviata: true, statoWorkflow: 'shooting_da_svolgere',
});
const event = (id: string, patch: any = {}) => ({ id, status: 'confirmed', summary: 'Shooting: Cliente Test',
  description: 'Prenotazione confermata. [booking:one]',
  start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(end).toISOString() }, ...patch });
let api: RecoveryCalendar;
const root = () => store.value('bookings/one');
const inspect = () => inspectBookingCalendar(store.db, 'one', api);
const recover = async (key?: string) => recoverBookingCalendar(store.db, 'one',
  key || (await inspect()).inspectionKey!, 'admin', api);
beforeEach(() => {
  store = reservationDb(); store.seed('bookings/one', booking()); events = new Map();
  api = {
    target: vi.fn(async () => 'studio-calendar'),
    read: vi.fn(async (_calendar, id) => events.get(id) || null),
    scan: vi.fn(async () => [...events.values()]),
    create: vi.fn(async (_calendar, data) => {
      const result = event(data.id!, { description: data.description });
      events.set(result.id, result); return result;
    }),
    remove: vi.fn(async (_calendar, id) => events.delete(id)),
  };
});
describe('recupero amministrativo appuntamenti', () => {
  it('la verifica è di sola lettura e indica cosa verrà creato', async () => {
    const before = { ...root() };
    expect(await inspect()).toMatchObject({ action: 'create', canRecover: true, calendarId: 'studio-calendar' });
    expect(root()).toEqual(before);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('crea una volta sola e non tocca stato, incassi o email', async () => {
    const before = { ...root() }, firstPlan = await inspect();
    expect(await recover(firstPlan.inspectionKey)).toMatchObject({ action: 'already_linked', canRecover: false });
    expect(root()).toMatchObject(before);
    expect(root().googleCalendarId).toBe('studio-calendar');
    expect(root().googleCalendarEventId).toMatch(/^b[a-f0-9]{64}$/);
    expect(await recover(firstPlan.inspectionKey)).toMatchObject({ action: 'already_linked', canRecover: false });
    expect((await inspect()).action).toBe('already_linked');
    expect(api.create).toHaveBeenCalledOnce();
    expect([...store.rows.keys()]).toEqual(['bookings/one']); // no cash/outbox/confirmation writes
  });
  it('collega un vecchio evento con nome, email e orario senza crearne uno nuovo', async () => {
    events.set('legacy', event('legacy', { description: 'Cliente: Cliente Test\nEmail: cliente@example.test\nWhatsApp: 0000' }));
    expect((await inspect()).action).toBe('link_existing');
    await recover();
    expect(root().googleCalendarEventId).toBe('legacy');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('un nome uguale senza prova di identità non basta', async () => {
    events.set('ambiguous', event('ambiguous', { description: 'Foto di famiglia' }));
    expect(await inspect()).toMatchObject({ action: 'blocked', canRecover: false });
    expect(api.create).not.toHaveBeenCalled();
  });
  it('blocca più appuntamenti compatibili', async () => {
    events.set('a', event('a')); events.set('b', event('b'));
    expect((await inspect()).action).toBe('blocked');
  });
  it('non assorbe un errore di lettura Google come calendario vuoto', async () => {
    vi.mocked(api.scan).mockRejectedValueOnce(new Error('Google unavailable'));
    await expect(inspect()).rejects.toThrow('Google unavailable');
    expect(api.create).not.toHaveBeenCalled();
    expect(root().calendarRecovery).toBeUndefined();
  });
  it('si ferma se manca il calendario corretto o mancano i permessi', async () => {
    vi.mocked(api.target).mockRejectedValueOnce(new Error('Configura il calendario'));
    await expect(inspect()).rejects.toThrow('Configura il calendario');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('riconcilia un timeout dopo la creazione senza inserire un secondo evento', async () => {
    const original = api.create;
    api.create = vi.fn(async (...args: Parameters<RecoveryCalendar['create']>) => { await original(...args); throw new Error('timeout'); });
    await expect(recover()).rejects.toThrow('timeout');
    const originalId = root().calendarRecovery.eventId;
    expect(root().calendarRecovery.status).toBe('uncertain');
    expect((await inspect()).action).toBe('link_existing');
    await recover();
    expect(root().googleCalendarEventId).toBe(originalId);
    expect(api.create).toHaveBeenCalledOnce();
  });
  it('dopo un rifiuto Google ritenta usando lo stesso ID, mai un ID nuovo', async () => {
    const original = api.create;
    vi.mocked(api.create).mockRejectedValueOnce(new Error('503'));
    await expect(recover()).rejects.toThrow('503');
    const id = root().calendarRecovery.eventId;
    api.create = vi.fn(original);
    await recover();
    expect(root().googleCalendarEventId).toBe(id);
  });
  it('non ricrea alla cieca un evento cancellato su Google', async () => {
    const plan = await inspect();
    events.set(plan.eventId!, event(plan.eventId!, { status: 'cancelled' }));
    expect((await inspect()).action).toBe('blocked');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('blocca un precedente timeout privo di identità recuperabile', async () => {
    store.seed('bookings/one', { ...booking(), automaticConfirmationError: true });
    expect((await inspect()).action).toBe('blocked');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('non adotta un evento appartenente a un altro cliente', async () => {
    events.set('other', event('other', { summary: 'Shooting: Altro Cliente', description: 'Email: altro@example.test' }));
    expect((await inspect()).action).toBe('blocked');
  });
  it.each([
    { description: 'Email: cliente@example.test\n[booking:other-booking]' },
    { description: 'Email: cliente@example.test', extendedProperties: { private: { crmBookingId: 'other-booking' } } },
    { description: 'Email: cliente@example.test\n[booking:one]', extendedProperties: { private: { crmBookingId: 'other-booking' } } },
    { description: 'Email: cliente@example.test\n[booking:other-booking]', extendedProperties: { private: { crmBookingId: 'one' } } },
    { description: 'Email: cliente@example.test\n[booking:one]\n[booking:other-booking]' },
    { description: 'Email: cliente@example.test\n[booking:]' },
    { description: 'Email: cliente@example.test\n[booking:other-booking' },
    { description: 'Email: cliente@example.test\n[booking:other-booking]', transparency: 'transparent' },
  ])('non condivide l’evento di un’altra prenotazione dello stesso cliente: %j', async patch => {
    const stalePlan = await inspect();
    events.set('other', event('other', patch));
    expect((await inspect()).action).toBe('blocked');
    await expect(recover(stalePlan.inspectionKey)).rejects.toThrow('recupero è bloccato');
    expect(root().googleCalendarEventId).toBeUndefined();
    expect(root().calendarRecovery).toBeUndefined();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('non considera sano un riferimento già salvato con un identificativo esplicito incompatibile', async () => {
    store.seed('bookings/one', { ...booking(), googleCalendarEventId: 'wrong-saved' });
    events.set('wrong-saved', event('wrong-saved', { description: 'Email: cliente@example.test\n[booking:another]' }));
    expect((await inspect()).action).toBe('blocked');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
  });
  it('rifiuta un piano vecchio se cambia il calendario configurato', async () => {
    const plan = await inspect();
    vi.mocked(api.target).mockResolvedValue('another-calendar');
    await expect(recover(plan.inspectionKey)).rejects.toThrow('verifica è cambiata');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('due amministratori non avviano contemporaneamente due recuperi', async () => {
    const plan = await inspect(), original = api.create;
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    api.create = vi.fn(async (...args: Parameters<RecoveryCalendar['create']>) => { entered(); await gate; return original(...args); });
    const first = recover(plan.inspectionKey);
    await started;
    await expect(recover(plan.inspectionKey)).rejects.toThrow('recupero è bloccato');
    release(); await first;
    expect(api.create).toHaveBeenCalledOnce();
  });
  it('un annullamento durante la creazione rimuove solo l’evento appena creato', async () => {
    const original = api.create;
    api.create = vi.fn(async (...args: Parameters<RecoveryCalendar['create']>) => {
      const result = await original(...args);
      await store.db.collection('bookings').doc('one').update({ stato: 'annullata' });
      return result;
    });
    await expect(recover()).rejects.toThrow('modificata durante il recupero');
    expect(root().stato).toBe('annullata');
    expect(root().googleCalendarEventId).toBeUndefined();
    expect(api.remove).toHaveBeenCalledOnce();
    expect(events.size).toBe(0);
    expect(root().depositPayment).toEqual(booking().depositPayment);
  });
  it('non elimina un appuntamento preesistente quando cambia la prenotazione', async () => {
    events.set('legacy', event('legacy'));
    const original = api.scan;
    let scans = 0;
    api.scan = vi.fn(async (...args: Parameters<RecoveryCalendar['scan']>) => {
      if (++scans === 2) await store.db.collection('bookings').doc('one').update({ stato: 'annullata' });
      return original(...args);
    });
    const key = (await inspect()).inspectionKey!;
    await expect(recover(key)).rejects.toThrow('modificata');
    expect(events.has('legacy')).toBe(true);
    expect(api.remove).not.toHaveBeenCalled();
  });
  it.each([
    { stato: 'annullata' }, { stato: 'in_attesa' }, { calendarSyncPending: true },
    { paymentReviewRequired: true }, { customerReschedule: { status: 'pending' } },
    { bookingCancellation: { status: 'working' } },
  ])('non interferisce con stati o worker non idonei: %j', async patch => {
    store.seed('bookings/one', { ...booking(), ...patch });
    expect((await inspect()).action).toBe('blocked');
    expect(api.target).not.toHaveBeenCalled();
  });
});
