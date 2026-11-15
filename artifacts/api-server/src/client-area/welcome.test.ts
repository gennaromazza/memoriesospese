import { describe, expect, it, vi } from 'vitest';
import { clientAreaLinkBlock, withClientAreaLink, welcomeEmailHtml } from './emails';
import { jobClienteIds, sendClientAreaWelcome } from './welcome';

/** Firestore minimo in memoria: solo ciò che usa sendClientAreaWelcome. */
function fakeDb(docs: Record<string, Record<string, any>>) {
  const setPath = (target: Record<string, any>, path: string, value: unknown) => {
    const parts = path.split('.');
    let node = target;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    const last = parts[parts.length - 1];
    const isDelete = value && typeof value === 'object' && (value as any).constructor?.name?.includes('Delete');
    if (isDelete) delete node[last];
    else node[last] = value && typeof value === 'object' && (value as any).constructor?.name?.includes('Timestamp') ? 'NOW' : value;
  };
  const ref = (id: string) => ({
    id,
    update: async (data: Record<string, unknown>) => { for (const [k, v] of Object.entries(data)) setPath(docs[id], k, v); },
  });
  return {
    docs,
    collection: () => ({ doc: ref }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      get: async (r: { id: string }) => ({ exists: Boolean(docs[r.id]), data: () => docs[r.id] }),
      update: (r: { id: string }, data: Record<string, unknown>) => { for (const [k, v] of Object.entries(data)) setPath(docs[r.id], k, v); },
    }),
  } as any;
}

type Send = (to: string, subject: string, html: string) => Promise<unknown>;
const deps = (send: Send = vi.fn(async () => undefined)) => ({
  baseUrl: 'https://studio.example/',
  studioName: 'Studio Prova',
  send,
  isExcludedEmail: (email: string) => email === 'admin@example.com',
});

describe('email di benvenuto area cliente', () => {
  it('invia una sola volta per cliente', async () => {
    const db = fakeDb({ c1: { email: 'Sposa@Example.com', nome: 'Giulia' }, c2: { email: 'sposo@example.com', nome: 'Marco' } });
    const send = vi.fn(async (_to: string, _subject: string, _html: string) => undefined);
    const first = await sendClientAreaWelcome(db, ['c1', 'c2', 'c1'], deps(send), { nomeEvento: 'Matrimonio' });
    expect(first.map(o => o.result)).toEqual(['sent', 'sent']);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBe('sposa@example.com');
    expect(send.mock.calls[0][2]).toContain('https://studio.example/area-cliente');

    const second = await sendClientAreaWelcome(db, ['c1'], deps(send));
    expect(second).toEqual([{ clienteId: 'c1', result: 'skipped', reason: 'already_sent' }]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('con force reinvia anche a chi lo ha già ricevuto', async () => {
    const db = fakeDb({ c1: { email: 'a@example.com', clientArea: { welcomeSentAt: 'ieri' } } });
    const send = vi.fn(async () => undefined);
    expect(await sendClientAreaWelcome(db, ['c1'], deps(send), { force: true })).toEqual([{ clienteId: 'c1', result: 'sent' }]);
  });

  it('salta clienti senza email, inesistenti o esclusi', async () => {
    const db = fakeDb({ c1: { email: '' }, c3: { email: 'admin@example.com' } });
    const send = vi.fn(async () => undefined);
    const out = await sendClientAreaWelcome(db, ['c1', 'c2', 'c3'], deps(send));
    expect(out.map(o => o.result === 'skipped' && o.reason)).toEqual(['no_email', 'not_found', 'excluded']);
    expect(send).not.toHaveBeenCalled();
  });

  it('se l’invio fallisce si potrà riprovare', async () => {
    const db = fakeDb({ c1: { email: 'a@example.com' } });
    const failing = vi.fn(async () => { throw new Error('smtp giù'); });
    const out = await sendClientAreaWelcome(db, ['c1'], deps(failing));
    expect(out[0]).toMatchObject({ result: 'error', message: 'smtp giù' });
    expect(db.docs.c1.clientArea?.welcomeSentAt).toBeUndefined();
    const retry = await sendClientAreaWelcome(db, ['c1'], deps());
    expect(retry[0].result).toBe('sent');
  });

  it('legge i clienti del lavoro dai campi nuovo e legacy', () => {
    expect(jobClienteIds({ clientiIds: ['a', 'b'], clienteId: 'a' })).toEqual(['a', 'b']);
    expect(jobClienteIds({ clienteId: 'x' })).toEqual(['x']);
  });
});

describe('link all’area nelle email', () => {
  it('aggiunge il riquadro prima di </body> una sola volta', () => {
    const html = '<html><body><p>Ciao</p></body></html>';
    const once = withClientAreaLink(html, 'https://studio.example');
    expect(once).toContain('https://studio.example/area-cliente');
    expect(once.indexOf('area-cliente')).toBeLessThan(once.indexOf('</body>'));
    expect(withClientAreaLink(once, 'https://studio.example')).toBe(once);
  });

  it('funziona anche su HTML senza </body> e protegge il testo', () => {
    expect(withClientAreaLink('<p>x</p>', 'https://s.example')).toContain(clientAreaLinkBlock('https://s.example'));
    expect(welcomeEmailHtml({ studioName: 'A & B', nome: '<Giulia>', baseUrl: 'https://s.example' }))
      .toContain('&lt;Giulia&gt;');
  });
});
