import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ShopCatalogDto } from '@shared/shop-types';
import ShopPage from './ShopPage';

vi.mock('@/context/StudioContext', () => ({
  useStudio: () => ({ studioSettings: { name: 'Studio di prova', address: 'Via Roma 1, Aversa', whatsapp: '', email: '' } }),
}));

vi.mock('wouter', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ href, to, children, ...props }: any) =>
      createElement('a', { ...props, href: href ?? to }, children),
  };
});

vi.mock('@/hooks/useSEO', () => ({ useSEO: () => undefined }));
vi.mock('@/components/gift-cards/GiftCardArt', () => ({ GiftCardAmbient: () => null }));
vi.mock('@/features/shop/shop-api', () => ({ shopApi: { getCatalog: vi.fn() } }));

const catalog = (patch: Partial<ShopCatalogDto> = {}): ShopCatalogDto => ({
  enabled: true,
  orderingOpen: true,
  lastOrderDate: null,
  currency: 'EUR',
  categories: [{ value: 'natale', nome: 'Shopping online Natale 2026' }],
  products: [
    {
      id: 'p1', nome: 'Tazza con la tua foto', descrizione: 'Una tazza personalizzata', priceCents: 1500, listPriceCents: 1500,
      discountPercent: 0, photosRequired: 1, categoria: 'natale', images: ['https://img.test/tazza.jpg'], displayOrder: 1,
    },
    {
      id: 'p2', nome: 'Album 20 foto', descrizione: '', priceCents: 4500, listPriceCents: 5000,
      discountPercent: 10, photosRequired: 20, categoria: 'natale', images: [], displayOrder: 2,
    },
    {
      id: 'p3', nome: 'Cartolina', descrizione: '', priceCents: 300, listPriceCents: 300,
      discountPercent: 0, photosRequired: 0, categoria: 'natale', images: [], displayOrder: 3,
    },
  ],
  shipping: { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 },
  photoWaitDays: 7,
  ...patch,
});

function render(data: ShopCatalogDto | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data) client.setQueryData(['shop-catalog'], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ShopPage />
    </QueryClientProvider>,
  );
}

describe('vetrina shop', () => {
  it('mostra prodotti, prezzi, foto richieste e spedizione', () => {
    const html = render(catalog());
    expect(html).toContain('Shopping di Natale');
    expect(html).toContain('Tazza con la tua foto');
    expect(html).toContain('15,00');
    expect(html).toContain('Serve 1 tua foto');
    expect(html).toContain('Servono 20 tue foto');
    expect(html).toContain('Nessuna foto da caricare');
    expect(html).toContain('Spedizione in tutta Italia da');
    expect(html).toContain('href="/regala"');
  });

  it('con la spedizione per peso scrive "da" il costo più basso e che dipende dal peso', () => {
    const html = render(catalog({
      shipping: {
        enabled: true, priceCents: 0, estimatedMinDays: 5, estimatedMaxDays: 8,
        tiers: [{ maxGrams: 1000, priceCents: 590 }, { maxGrams: 3000, priceCents: 790 }],
      },
    }));
    expect(html).toContain('Spedizione in tutta Italia da 5,90');
    expect(html).toContain('il costo dipende dal peso');
    expect(html).toContain('5-8 giorni dal pagamento');
  });

  it('con il costo unico non parla di peso', () => {
    expect(render(catalog())).not.toContain('dipende dal peso');
  });

  it('mostra il prezzo di listino barrato quando c\'è uno sconto', () => {
    const html = render(catalog());
    expect(html).toContain('<s>');
    expect(html).toContain('50,00');
    expect(html).toContain('45,00');
  });

  it('con gli ordini aperti ogni prodotto si può aggiungere al carrello', () => {
    const html = render(catalog());
    expect(html.match(/Aggiungi al carrello/g)).toHaveLength(3);
    expect(html).toContain('/shop-natale/i-miei-ordini');
  });

  it("con gli ordini chiusi non c'è nessun pulsante per ordinare", () => {
    const html = render(catalog({ orderingOpen: false }));
    expect(html).not.toContain('Aggiungi al carrello');
  });

  it('con gli ordini non ancora aperti avvisa e non promette il checkout', () => {
    const html = render(catalog({ orderingOpen: false }));
    expect(html).toContain('Gli ordini online apriranno a breve');
    expect(html).toContain('Tazza con la tua foto');
  });

  it('dopo l\'ultimo giorno dice che gli ordini sono chiusi', () => {
    const html = render(catalog({ orderingOpen: false, lastOrderDate: '2020-12-18' }));
    expect(html).toContain('Gli ordini di Natale sono chiusi');
  });

  it('con la vetrina spenta o vuota mostra solo il messaggio di arrivo', () => {
    for (const data of [catalog({ enabled: false, products: [], categories: [] }), catalog({ products: [] })]) {
      const html = render(data);
      expect(html).toContain('Lo shop di Natale arriva presto');
      expect(html).not.toContain('href="/shop-natale#prodotti"');
    }
  });

  it('con il caricamento in corso non mostra prodotti', () => {
    const html = render(undefined);
    expect(html).toContain('Un momento');
    expect(html).not.toContain('Tazza con la tua foto');
  });
});
