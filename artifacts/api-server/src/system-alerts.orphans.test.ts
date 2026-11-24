import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ send: vi.fn(), lastSentAt: 0 }));
vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: () => ({ doc: () => ({}) }),
    runTransaction: async (fn: any) => fn({
      get: async () => ({ exists: h.lastSentAt > 0, data: () => ({ lastSentAt: h.lastSentAt }) }),
      set: () => {},
    }),
  },
}));
vi.mock('./email-routes.js', () => ({ sendGmailEmail: h.send }));

async function notify(events: any[]) {
  vi.resetModules();
  const { notifyOrphanCalendarEvents } = await import('./system-alerts.js');
  notifyOrphanCalendarEvents(events);
  await vi.waitFor(() => expect(h.send.mock.calls.length + (h.lastSentAt ? 1 : 0)).toBeGreaterThan(0), { timeout: 500 }).catch(() => {});
}

beforeEach(() => { h.send.mockReset(); h.lastSentAt = 0; vi.spyOn(console, 'log').mockImplementation(() => {}); });

describe('notifyOrphanCalendarEvents', () => {
  it('invia un\'email con id e titolo, con HTML escapato', async () => {
    await notify([{ id: 'evt1', summary: '<script>x</script>', kind: 'booking', where: 'sync' }]);
    expect(h.send).toHaveBeenCalledTimes(1);
    const [, subject, html] = h.send.mock.calls[0];
    expect(subject).toContain('1 evento');
    expect(html).toContain('evt1');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('non invia nulla senza eventi o se l\'avviso e\' stato gia\' inviato nelle ultime 12 ore', async () => {
    await notify([]);
    h.lastSentAt = Date.now();
    await notify([{ id: 'evt2' }]);
    expect(h.send).not.toHaveBeenCalled();
  });
});
