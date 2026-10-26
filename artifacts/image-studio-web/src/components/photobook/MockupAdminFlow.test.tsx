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
  it('mostra lo stato delle pagine separato dai tre passi del mockup', () => {
    const html = render();
    const order = ['Impaginato:', 'Modello assegnato', 'Percorso del mockup', 'Verifica e condivisione'].map(t => html.indexOf(t));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('segnala l’attesa di approvazione e il percorso scelto', () => {
    expect(render()).toContain('versione 1 non ancora approvata');
    expect(render({ pagesApproved: true })).toContain('versione 1 approvata dal cliente');
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
  it('mantiene assegnazione e preparazione in ordine, senza chiedere foto nell’assegnazione', () => {
    const state = {
      offer: { revision: 1, mode: 'fixed', updatedAt: '', options: [{ labId: 'lab', id: 'model', name: 'Album', labName: 'Studio' }] },
      saved: null,
    } as unknown as Partial<MockupPayload>;
    const html = render({}, undefined, state);
    const steps = html.match(/<li class="flex gap-3"[\s\S]*?(?=<li class="flex gap-3"|<\/ol>)/g) || [];

    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain('Cambia modello');
    expect(steps[0]).not.toMatch(/Carica una foto|Scegli dalla galleria/);
    expect(steps[1]).toContain('Prepara la bozza');
    expect(steps[1]).toContain('Le foto della bozza si scelgono dalla galleria o si caricano nel passaggio successivo');
    expect(steps[0]!.indexOf('Cambia modello')).toBeLessThan(steps[1]!.indexOf('Prepara la bozza'));
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
  it('rende disponibile il mockup confermato prima dell’approvazione delle pagine', () => {
    const state = {
      offer: { revision: 1, mode: 'fixed', updatedAt: '', options: [{ labId: 'lab', id: 'model', name: 'Album', labName: 'Studio' }] },
      saved: { status: 'confirmed', revision: 2 },
    } as unknown as Partial<MockupPayload>;
    const html = render({ clientLink: 'https://example.test/fotolibro/private-token' }, undefined, state);
    expect(html).toContain('Prossima azione:</strong> Mockup confermato: controlla l’email o copia il link per condividerlo.');
    expect(html).toContain('button-copy-mockup-link');
    expect(html).toContain('Il riscontro del cliente sul mockup è facoltativo');
    expect(html).toContain('aria-current="step"');
  });
  it('condivide il link diretto per la versione corrente confermata anche senza approvazione pagine', () => {
    const props = { clientLink: 'https://example.test/fotolibro/private-token', pagesApproved: false };
    const html = render(props, 'confirmed');
    expect(html).toContain('button-copy-mockup-link');
    expect(html).toContain('https://example.test/fotolibro/private-token/mockup?version=1');
    expect(render(props, 'draft')).not.toContain('button-copy-mockup-link');
    expect(render({ ...props, version: 2, currentVersion: 3 }, 'confirmed')).not.toContain('button-copy-mockup-link');
    expect(render({ ...props, readOnly: true }, 'confirmed')).toContain('button-copy-mockup-link');
  });
  it('colloca link e verifica nel passo conclusivo e mantiene azioni usabili su schermi stretti', () => {
    const state = {
      offer: { revision: 1, mode: 'fixed', updatedAt: '', options: [{ labId: 'lab', id: 'model', name: 'Album', labName: 'Studio' }] },
      saved: { status: 'confirmed', revision: 2 },
    } as unknown as Partial<MockupPayload>;
    const html = render({ clientLink: 'https://example.test/fotolibro/private-token' }, undefined, state);
    const finalStep = (html.match(/<li class="flex gap-3"[\s\S]*?(?=<li class="flex gap-3"|<\/ol>)/g) || []).at(-1) || '';

    expect(finalStep).toContain('button-copy-mockup-link');
    expect(finalStep).toContain('Email:');
    expect(html.match(/button-copy-mockup-link/g)).toHaveLength(1);
    expect(html).toContain('class="flex flex-wrap gap-2"');
    expect(html).toContain('min-h-11');
    expect(finalStep).toContain('min-h-10');
    expect(finalStep).not.toContain('Vedi in 3D');
  });
});
