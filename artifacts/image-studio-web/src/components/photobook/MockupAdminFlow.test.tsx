import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MockupPayload } from '@shared/mockup-types';

vi.mock('@/lib/firebase', () => ({ auth: { authStateReady: async () => undefined, currentUser: null } }));
vi.mock('@/lib/config', () => ({ createUrl: (p: string) => p }));
import MockupAdminFlow from './MockupAdminFlow';

const render = (props: Partial<Parameters<typeof MockupAdminFlow>[0]> = {}, savedStatus?: string, stateData?: Partial<MockupPayload>) => {
  const client = new QueryClient();
  const initialState = stateData ?? (savedStatus ? { saved: { status: savedStatus, revision: 2 }, offer: null } : undefined);
  if (initialState) client.setQueryData(['photobook-mockup-flow', 'b1', props.version ?? 1], initialState);
  return renderToStaticMarkup(
  <QueryClientProvider client={client}>
    <MockupAdminFlow photobookId="b1" version={1} currentVersion={1} pagesApproved={false} mockupPath="studio" pathBusy={false} onPathChange={() => undefined} emailStatus="non ancora prevista o inviata" readOnly={false} {...props} />
  </QueryClientProvider>,
  );
};

describe('MockupAdminFlow', () => {
  it('mostra i quattro passi in ordine', () => {
    const html = render();
    const order = ['Pagine approvate dal cliente', 'Modello assegnato', 'Percorso del mockup', 'Verifica e invio al cliente'].map(t => html.indexOf(t));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('segnala l’attesa di approvazione e il percorso scelto', () => {
    expect(render()).toContain('In attesa che il cliente approvi la versione 1');
    expect(render({ pagesApproved: true })).toContain('Il cliente ha approvato la versione 1');
    expect(render({ mockupPath: 'client' })).not.toContain('Prepara la bozza');
  });
  it('mostra la preparazione come prossima azione e non duplica il comando 3D', () => {
    const state = {
      offer: { revision: 1, mode: 'fixed', updatedAt: '', options: [{ labId: 'lab', id: 'model', name: 'Album', labName: 'Studio' }] },
      saved: null,
    } as unknown as Partial<MockupPayload>;
    const html = render({}, undefined, state);
    expect(html).toContain('Prossima azione:</strong> Prepara la bozza');
    expect(html).toContain('data-current-step="true"');
    expect(html.match(/>Prepara la bozza<\/button>/g)).toHaveLength(1);
    expect(html).not.toContain('Vedi in 3D');
  });
  it('indica la verifica dopo aver salvato una bozza', () => {
    const state = {
      offer: { revision: 1, mode: 'fixed', updatedAt: '', options: [{ labId: 'lab', id: 'model', name: 'Album', labName: 'Studio' }] },
      saved: { status: 'draft', revision: 2 },
    } as unknown as Partial<MockupPayload>;
    const html = render({}, undefined, state);
    expect(html).toContain('Prossima azione:</strong> Verifica la bozza salvata e conferma il mockup.');
    expect(html).toContain('Verifica e conferma</button>');
  });
  it('indica l’attesa di approvazione pagine dopo la conferma dello studio', () => {
    const state = {
      offer: { revision: 1, mode: 'fixed', updatedAt: '', options: [{ labId: 'lab', id: 'model', name: 'Album', labName: 'Studio' }] },
      saved: { status: 'confirmed', revision: 2 },
    } as unknown as Partial<MockupPayload>;
    const html = render({}, undefined, state);
    expect(html).toContain('Prossima azione:</strong> Mockup confermato: il cliente riceverà il link dopo l’approvazione delle pagine.');
    expect(html).toContain('aria-current="step"');
  });
  it('condivide il link diretto solo per il mockup confermato della versione approvata corrente', () => {
    const props = { clientLink: 'https://example.test/fotolibro/private-token', pagesApproved: true };
    const html = render(props, 'confirmed');
    expect(html).toContain('button-copy-mockup-link');
    expect(html).toContain('https://example.test/fotolibro/private-token/mockup?version=1');
    expect(render(props, 'draft')).not.toContain('button-copy-mockup-link');
    expect(render({ ...props, pagesApproved: false }, 'confirmed')).not.toContain('button-copy-mockup-link');
    expect(render({ ...props, version: 2, currentVersion: 3 }, 'confirmed')).not.toContain('button-copy-mockup-link');
    expect(render({ ...props, readOnly: true }, 'confirmed')).toContain('button-copy-mockup-link');
  });
});
