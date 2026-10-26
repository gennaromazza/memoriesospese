import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('wouter', () => ({
  useParams: () => ({ token: 'private-token' }),
  Link: ({ href, children, className, 'data-testid': testId }: {
    href: string;
    children: ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => <a href={href} className={className} data-testid={testId}>{children}</a>,
}));
vi.mock('@/lib/photobooks', () => ({ getPhotobookByToken: vi.fn() }));
vi.mock('@/components/photobook/PhotobookMockup', () => ({
  default: (props: { token: string; version: number; readOnly: boolean; autoOpen: boolean; confirmedOnly: boolean }) =>
    <div data-testid="mockup-viewer" data-token={props.token} data-version={props.version} data-readonly={String(props.readOnly)} data-auto-open={String(props.autoOpen)} data-confirmed-only={String(props.confirmedOnly)} />,
}));
import PhotobookMockupViewPage from './PhotobookMockupViewPage';

afterEach(() => vi.unstubAllGlobals());

function render(approved: boolean, search = '?version=2') {
  vi.stubGlobal('window', { location: { search } });
  const client = new QueryClient();
  client.setQueryData(['/api/photobooks/by-token', 'private-token', 2], {
    photobook: { id: 'book', name: 'Album di prova', currentVersion: 2, approval: approved ? { version: 2 } : null },
    version: 2, pages: [], requests: [],
  });
  return renderToStaticMarkup(<QueryClientProvider client={client}><PhotobookMockupViewPage /></QueryClientProvider>);
}

describe('Link diretto al mockup cliente', () => {
  it('apre il viewer della versione richiesta in sola lettura, solo per mockup confermati', () => {
    const html = render(true);
    expect(html).toContain('Album di prova');
    expect(html).toContain('data-version="2"');
    expect(html).toContain('data-token="private-token"');
    expect(html).toContain('data-readonly="true"');
    expect(html).toContain('data-auto-open="true"');
    expect(html).toContain('data-confirmed-only="true"');
  });
  it('apre il mockup confermato e mostra separatamente lo stato delle pagine non approvate', () => {
    const html = render(false);
    expect(html).toContain('versione 2 non è ancora approvato');
    expect(html).toContain('mockup-viewer');
    expect(html).toContain('data-version="2"');
  });
  it('rifiuta versioni non valide senza ripiegare su un altro fotolibro o versione', () => {
    const html = render(true, '?version=abc');
    expect(html).toContain('Link mockup non disponibile');
    expect(html).not.toContain('mockup-viewer');
  });
});
