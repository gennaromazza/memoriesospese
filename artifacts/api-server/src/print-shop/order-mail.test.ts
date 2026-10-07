import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore, FakeStorage } from './test-fakes.js';
import { newPrintRecovery, PrintOrderMail, PRINT_REMINDER_DAY as DAY } from './order-mail.js';
import { printOrderPhone, printOrderWhatsAppLink } from '@shared/print-order-contact';

function fixture() {
  const created = Timestamp.fromMillis(Date.UTC(2026, 0, 1));
  let clock = created.toMillis();
  const db = new FakeFirestore();
  const storage = new FakeStorage();
  const mail = {
    studio: vi.fn(async () => ({ name: 'Studio', email: 'fallback@example.test', phone: '' })),
    send: vi.fn(async (..._args: any[]) => undefined),
  };
  db.seed('settings/studio', { email: 'studio@example.test' });
  const build = () => new PrintOrderMail({ db, storage, mail,
    now: () => Timestamp.fromMillis(clock), siteUrl: () => 'https://studio.example.test' });
  function seed(id: string, overrides: any = {}) {
    const recovery = newPrintRecovery(created);
    db.seed(`orders/${id}`, {
      orderType: 'print_shop', id, ownerUid: 'owner', orderNumber: `ST-${id}`,
      customer: { name: '<img src=x>', email: 'owner@example.test', phone: '327 123 4567' },
      payment: { status: 'pending' }, fulfillment: { status: 'draft', method: 'studio_pickup' },
      printShop: { items: [{ productName: '<script>', copyCount: 2, widthMm: 100, heightMm: 150 }] },
      totals: { totalCents: 1234 }, createdAt: created,
      printRecovery: recovery, printRecoveryDueAt: Timestamp.fromMillis(clock + DAY),
      retention: { status: 'scheduled', deleteAfter: recovery.expiresAt },
      ...overrides,
    });
    storage.put(`${id}/original.jpg`, Buffer.from('fake'));
    db.seed(`orders/${id}/assets/photo`, { status: 'ready', storagePath: `${id}/original.jpg` });
  }
  function paid(id: string) {
    seed(id, { payment: { status: 'paid', paypalCaptureId: `capture-${id}` },
      printAdminMail: { status: 'pending', attempts: 0 }, printAdminMailDueAt: created });
  }
  return { db, storage, mail, build, seed, paid, created,
    setDay: (day: number) => { clock = created.toMillis() + day * DAY; },
  };
}

describe('print order contacts', () => {
  it.each([
    ['327 123 4567', '393271234567'], ['+39 (327) 123-4567', '393271234567'],
    ['0039 327 123 4567', '393271234567'], ['393271234567', '393271234567'],
    ['+33 612 345 678', '33612345678'], ['0033 612 345 678', '33612345678'],
    ['+1 555 123 4567', '15551234567'],
  ])('normalizes %s preserving explicit country codes', (phone, normalized) => {
    const url = new URL(printOrderWhatsAppLink({ customer: { phone }, orderNumber: 'ST-42' }));
    expect(url.pathname).toBe(`/${normalized}`);
    expect(url.searchParams.get('text')).toContain('ST-42');
    expect(printOrderPhone({ customer: { phone } })).toBe(phone);
  });
  it.each(['', 'abc3271234567', '123', '+00000000', '123456789012345678'])('rejects %s', phone => {
    expect(printOrderWhatsAppLink({ customer: { phone } })).toBe('');
  });
  it('uses legacy fields without migration', () => {
    expect(printOrderPhone({ telefonoCliente: '327 123 4567' })).toBe('327 123 4567');
    expect(printOrderWhatsAppLink({ whatsappCliente: '00393271234567' })).toContain('/393271234567');
  });
});

describe('studio confirmed order mail', () => {
  it('uses studio settings, escaped details, protected Admin and WhatsApp links once under concurrent workers', async () => {
    const f = fixture(); f.paid('paid');
    await Promise.all([f.build().run(), f.build().run(), f.build().send('paid', 'admin')]);
    expect(f.mail.send).toHaveBeenCalledTimes(1);
    const [to, subject, html] = f.mail.send.mock.calls[0];
    expect(to).toBe('studio@example.test');
    expect(subject).toContain('ST-paid');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('12.34');
    expect(html).toContain('/admin?printOrderId=paid');
    expect(html).toContain('/393271234567');
    expect(f.db.value('orders/paid').printAdminMail.status).toBe('sent');
    expect(f.db.value('orders/paid').printAdminMailDueAt).toBeUndefined();
  });
  it.each(['pending', 'failed', 'expired', 'refunded'])('never sends a confirmed notice for %s', async status => {
    const f = fixture(); f.paid('x');
    await f.db.collection('orders').doc('x').update({ 'payment.status': status });
    await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it('does not send to a fallback if the configured recipient is absent; can retry after repair', async () => {
    const f = fixture(); f.paid('x');
    await f.db.collection('settings').doc('studio').update({ email: '' });
    await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
    expect(f.db.value('orders/x').printAdminMail.status).toBe('failed');
    await f.db.collection('settings').doc('studio').update({ email: 'repaired@example.test' });
    f.setDay(1 / 24);
    await f.build().run();
    expect(f.mail.send.mock.calls[0][0]).toBe('repaired@example.test');
    expect(f.db.value('orders/x').payment.status).toBe('paid');
  });
  it('limits failed retries and does not mark email sent', async () => {
    const f = fixture(); f.paid('x');
    f.mail.send.mockRejectedValue(new Error('provider failure'));
    for (let hour = 0; hour < 6; hour++) { f.setDay(hour / 24); await f.build().run(); }
    expect(f.mail.send).toHaveBeenCalledTimes(3);
    expect(f.db.value('orders/x').printAdminMail.status).toBe('exhausted');
    expect(f.db.value('orders/x').printAdminMail.sentAt).toBeUndefined();
  });
  it('does not blindly resend an interrupted dispatch; explicit bounded Admin retry is possible', async () => {
    const f = fixture(); f.paid('x');
    await f.db.collection('orders').doc('x').update({
      printAdminMail: { status: 'sending', claimedAt: f.created, attempts: 1, token: 'old' },
    });
    f.setDay(1);
    await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
    expect(f.db.value('orders/x').printAdminMail.status).toBe('uncertain');
    await f.build().retryAdmin('x');
    expect(f.mail.send).toHaveBeenCalledTimes(1);
  });
  it('never starts historical paid notifications without an eligibility marker', async () => {
    const f = fixture(); f.seed('historical', { payment: { status: 'paid' } });
    await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
  });
});

describe('persistent print draft recovery schedule', () => {
  it('sends at 24 hours and at most seven times 24 hours apart, across restarts and concurrent checks', async () => {
    const f = fixture(); f.seed('draft');
    f.setDay(.999); await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
    for (let day = 1; day <= 8; day++) {
      f.setDay(day);
      await Promise.all([f.build().run(), f.build().run()]);
      await f.build().run();
      expect(f.mail.send).toHaveBeenCalledTimes(Math.min(7, day));
    }
    expect(f.db.value('orders/draft').printRecovery.sentCount).toBe(7);
    const html = f.mail.send.mock.calls[0][2];
    expect(html).toContain('Riprendi il tuo ordine');
    expect(html).toContain('https://studio.example.test/stampa-foto-aversa/ordine?orderId=draft');
    expect(html).toContain('acquisto non è ancora completato');
    expect(html).toContain('caricamenti locali non completati');
    expect(html).toContain('stopReminders=1');
  });
  it('does not catch up missed days with bursts or extend expiry', async () => {
    const f = fixture(); f.seed('draft');
    f.setDay(4); await f.build().run();
    await f.build().run();
    expect(f.mail.send).toHaveBeenCalledTimes(1);
    f.setDay(4.9); await f.build().run();
    expect(f.mail.send).toHaveBeenCalledTimes(1);
    f.setDay(5); await f.build().run();
    expect(f.mail.send).toHaveBeenCalledTimes(2);
    expect(f.db.value('orders/draft').retention.deleteAfter.toMillis()).toBe(f.created.toMillis() + 8 * DAY);
    f.setDay(8); await f.build().run();
    expect(f.mail.send).toHaveBeenCalledTimes(2);
  });
  it.each(['paid', 'paid_action_required', 'deferred', 'refunded', 'partially_refunded', 'expired'])('stops on payment %s', async status => {
    const f = fixture(); f.seed('draft');
    await f.db.collection('orders').doc('draft').update({ 'payment.status': status });
    f.setDay(1); await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
    expect(f.db.value('orders/draft').printRecoveryDueAt).toBeUndefined();
  });
  it('stops for cancellation, missing files, purged files, and opt out; rejects another owner', async () => {
    const f = fixture();
    for (const id of ['cancelled', 'missing', 'purged', 'stop']) f.seed(id);
    await f.db.collection('orders').doc('cancelled').update({ 'fulfillment.status': 'cancelled' });
    f.storage.files.delete('missing/original.jpg');
    await f.db.collection('orders').doc('purged').update({ 'retention.status': 'purged' });
    expect(await f.build().stop({ uid: 'intruder' }, 'stop')).toBe(false);
    expect(await f.build().stop({ uid: 'owner' }, 'stop')).toBe(true);
    f.setDay(1); await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
    expect(f.db.value('orders/stop').payment.status).toBe('pending');
  });
  it('rechecks payment after preparing email', async () => {
    const f = fixture(); f.seed('draft');
    f.mail.studio.mockImplementation(async () => {
      await f.db.collection('orders').doc('draft').update({ 'payment.status': 'paid_action_required' });
      return { name: 'Studio', email: 'studio@example.test', phone: '' };
    });
    f.setDay(1); await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
  });
  it('retries a failed dispatch without shortening successful send spacing and without false sent count', async () => {
    const f = fixture(); f.seed('draft');
    f.mail.send.mockRejectedValueOnce(new Error('temporary'));
    f.setDay(1); await f.build().run();
    expect(f.db.value('orders/draft').printRecovery.sentCount).toBe(0);
    f.setDay(1 + 1 / 24); await f.build().run();
    expect(f.db.value('orders/draft').printRecovery.sentCount).toBe(1);
    f.setDay(2); await f.build().run();
    expect(f.mail.send).toHaveBeenCalledTimes(2);
    f.setDay(2 + 1 / 24); await f.build().run();
    expect(f.mail.send).toHaveBeenCalledTimes(3);
  });
  it('never starts historical drafts; batches make progress without starving newer due work', async () => {
    const f = fixture();
    f.seed('historical', { printRecovery: undefined, printRecoveryDueAt: undefined });
    for (let i = 0; i < 6; i++) f.seed(`draft${i}`);
    f.setDay(1);
    await f.build().run(2); await f.build().run(2); await f.build().run(2);
    expect(f.mail.send).toHaveBeenCalledTimes(6);
  });
  it('reserves uncertain interrupted attempts against the seven email budget and does not repeat immediately', async () => {
    const f = fixture(); f.seed('draft');
    await f.db.collection('orders').doc('draft').update({
      'printRecovery.status': 'sending', 'printRecovery.claimedAt': f.created,
      'printRecovery.attempts': 1, 'printRecovery.token': 'lost',
    });
    f.setDay(1); await f.build().run();
    expect(f.mail.send).not.toHaveBeenCalled();
    expect(f.db.value('orders/draft').printRecovery.uncertainCount).toBe(1);
    for (let day = 2; day <= 8; day++) { f.setDay(day); await f.build().run(); }
    expect(f.mail.send).toHaveBeenCalledTimes(6);
  });
});