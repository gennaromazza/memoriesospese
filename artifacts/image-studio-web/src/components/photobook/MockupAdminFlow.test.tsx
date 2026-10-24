import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/firebase', () => ({ auth: { authStateReady: async () => undefined, currentUser: null } }));
vi.mock('@/lib/config', () => ({ createUrl: (p: string) => p }));
import MockupAdminFlow from './MockupAdminFlow';

const render = (props: Partial<Parameters<typeof MockupAdminFlow>[0]> = {}, savedStatus?: string) => {
  const client = new QueryClient();
  if (savedStatus) client.setQueryData(['photobook-mockup-flow', 'b1', props.version ?? 1], {
    saved: { status: savedStatus, revision: 2 }, offer: null,
  });
  return renderToStaticMarkup(
  <QueryClientProvider client={client}>
    <MockupAdminFlow photobookId="b1" version={1} currentVersion={1} pagesApproved={false} mockupPath="studio" pathBusy={false} onPathChange={() => undefined} emailStatus="non ancora prevista o inviata" readOnly={false} {...props} />
  </QueryClientProvider>,
  );
};

describe('MockupAdminFlow', () => {
  it('mostra i quattro passi in ordine', () => {
    const html = render();
    const order = ['Pagine approvate dal cliente', 'Modello assegnato', 'Chi prepara la bozza?', 'Stato e invio al cliente'].map(t => html.indexOf(t));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('segnala l’attesa di approvazione e il percorso scelto', () => {
    expect(render()).toContain('In attesa che il cliente approvi la versione 1');
    expect(render({ pagesApproved: true })).toContain('Il cliente ha approvato la versione 1');
    expect(render({ mockupPath: 'client' })).not.toContain('Prepara la bozza');
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
