import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GalleryFooter from './GalleryFooter';

const availability = vi.hoisted(() => ({ printShop: false, shop: false }));

vi.mock('wouter', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ to, children, ...props }: any) => createElement('a', { href: to, ...props }, children),
  };
});
vi.mock('@/lib/basePath', () => ({ createUrl: (path: string) => `/studio${path}` }));
vi.mock('@/hooks/useShopAvailable', () => ({ useShopAvailable: () => availability.shop }));
vi.mock('@/hooks/usePrintShopAvailable', () => ({ usePrintShopAvailable: () => availability.printShop }));
vi.mock('@/components/WeddingIllustrations', () => ({
  FloralCorner: () => null,
  FloralDivider: () => null,
  BackgroundDecoration: () => null,
}));
vi.mock('@/components/WeddingImages', () => ({ WeddingImage: () => null }));

function renderFooter() {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <GalleryFooter studioSettings={{ name: 'Studio', address: '', phone: '', email: '', socialLinks: {} }} />
    </QueryClientProvider>,
  );
}

describe('collegamenti del footer galleria', () => {
  it('mostra solo le vetrine attive con percorsi che rispettano il base path', () => {
    availability.printShop = true;
    availability.shop = true;
    const html = renderFooter();
    expect(html).toContain('href="/studio/stampa-foto-aversa"');
    expect(html).toContain('href="/studio/online-shop"');
    expect(html).toContain('caricale separatamente dal tuo dispositivo');
    expect(html).toContain('ordini e carrelli sono separati dalla galleria');
  });

  it('non lascia collegamenti a vetrine non disponibili', () => {
    availability.printShop = false;
    availability.shop = false;
    const html = renderFooter();
    expect(html).not.toContain('/stampa-foto-aversa');
    expect(html).not.toContain('/online-shop');
  });
});
