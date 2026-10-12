import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ShopCatalogDto, ShopProductDto } from '@shared/shop-types';
import ShopPage, { ProductCard, ShopCartBar, ShopTopBar } from './ShopPage';

vi.mock('@/context/StudioContext', () => ({
  useStudio: () => ({ studioSettings: { name: 'Studio di prova', address: 'Via Roma 1, Aversa', whatsapp: '', email: '' } }),
}));

vi.mock('wouter', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ href, to, children, ...props }: any) => createElement('a', { ...props, href: href ?? to }, children),
  };
});

vi.mock('@/hooks/useSEO', () => ({ useSEO: () => undefined }));
vi.mock('@/components/gift-cards/GiftCardArt', () => ({ GiftCardAmbient: () => null }));
vi.mock('@/features/shop/shop-api', () => ({ shopApi: { getCatalog: vi.fn() } }));

const product = (patch: Partial<ShopProductDto> = {}): ShopProductDto => ({
  id: 'p1',
  nome: 'Tazza con la tua foto',
  descrizione: 'Una tazza personalizzata',
  priceCents: 1500,
  listPriceCents: 1500,
  discountPercent: 0,
  photosRequired: 1,
  categoria: 'natale',
  images: [],
  displayOrder: 1,
  ...patch,
});

const card = (props: Partial<Parameters<typeof ProductCard>[0]> = {}) =>
  renderToStaticMarkup(
    <ProductCard product={product()} canOrder waitDays={7} inCart={0} justAdded={false} onAdd={() => undefined} {...props} />,
  );

const catalog = (patch: Partial<ShopCatalogDto> = {}): ShopCatalogDto => ({
  enabled: true,
  orderingOpen: true,
  lastOrderDate: null,
  currency: 'EUR',
  categories: [{ value: 'natale', nome: 'Natale' }],
  products: [product()],
  shipping: { enabled: false, priceCents: 0, estimatedMinDays: 3, estimatedMaxDays: 7 },
  photoWaitDays: 7,
  ...patch,
});

function renderPage(data: ShopCatalogDto | undefined, categoryValue?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data) client.setQueryData(['shop-catalog'], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ShopPage categoryValue={categoryValue} />
    </QueryClientProvider>,
  );
}

describe('uscite verso il sito', () => {
  it('la pagina ha sempre il collegamento per tornare al sito: con lo shop acceso, spento e in caricamento', () => {
    for (const data of [catalog(), catalog({ enabled: false, products: [], categories: [] }), undefined]) {
      const html = renderPage(data);
      expect(html).toContain('Navigazione dello shop');
      expect(html).toMatch(/<a [^>]*href="\/"[^>]*>.*?Torna al sito/s);
    }
  });

  it('in fondo alla pagina ci sono anche il ritorno al sito, le condizioni di vendita e la privacy', () => {
    const html = renderPage(catalog());
    expect(html).toContain('href="/shop-natale/condizioni"');
    expect(html).toContain('href="/privacy"');
    expect(html.match(/Torna al sito/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('la barra mostra il carrello solo quando si può ordinare, con il numero dei prodotti', () => {
    const open = renderToStaticMarkup(<ShopTopBar cartCount={3} showCart showOrders />);
    expect(open).toContain('href="/shop-natale/ordine"');
    expect(open).toContain('Vai al carrello: 3 prodotti');
    expect(open).toContain('I miei ordini');
    const empty = renderToStaticMarkup(<ShopTopBar cartCount={0} showCart showOrders={false} />);
    expect(empty).toContain('Vai al carrello: vuoto');
    expect(empty).not.toContain('I miei ordini');
    const closed = renderToStaticMarkup(<ShopTopBar cartCount={0} showCart={false} showOrders />);
    expect(closed).not.toContain('/shop-natale/ordine');
    expect(closed).toContain('Torna al sito');
  });

  it('c\'è un collegamento per saltare ai prodotti, solo se ci sono', () => {
    expect(renderPage(catalog())).toContain('Vai ai prodotti');
    expect(renderPage(catalog({ products: [] }))).not.toContain('Vai ai prodotti');
  });
});

describe('importi sempre leggibili', () => {
  it('il prezzo e il pulsante stanno su righe separate, il prezzo prima del pulsante', () => {
    const html = card({ product: product({ priceCents: 10_000, listPriceCents: 10_000 }) });
    expect(html).toContain('gcx-shop-buy');
    expect(html).toContain('gcx-shop-price');
    expect(html.indexOf('gcx-shop-price')).toBeGreaterThan(-1);
    expect(html.indexOf('gcx-shop-price')).toBeLessThan(html.indexOf('gcx-shop-add'));
    expect(html).toContain('100,00');
  });

  it('anche un prezzo lungo e uno scontato restano interi, con il prezzo di listino barrato', () => {
    const html = card({ product: product({ priceCents: 1_250_000, listPriceCents: 1_500_000, photosRequired: 0 }) });
    expect(html).toContain('12.500,00');
    expect(html).toContain('<s>15.000,00');
  });
});

describe('feedback quando si aggiunge un prodotto', () => {
  it('prima dell\'aggiunta il pulsante invita ad aggiungere e dice il prodotto a chi usa uno screen reader', () => {
    const html = card();
    expect(html).toContain('Aggiungi al carrello');
    expect(html).toContain('data-added="false"');
    expect(html).toContain('<span class="gcx-sr">: Tazza con la tua foto</span>');
  });

  it('subito dopo, il pulsante cambia in "Aggiunto"', () => {
    const html = card({ justAdded: true });
    expect(html).toContain('Aggiunto');
    expect(html).toContain('data-added="true"');
    expect(html).not.toContain('Aggiungi al carrello');
  });

  it('con il prodotto già nel carrello dice quanti ce ne sono', () => {
    expect(card({ inCart: 2 })).toContain('Aggiungi un altro (2 nel carrello)');
  });

  it('la barra del carrello dà il totale e la strada per ordinare', () => {
    const html = renderToStaticMarkup(<ShopCartBar count={2} subtotalCents={9000} />);
    expect(html).toContain('2 prodotti nel carrello');
    expect(html).toContain('90,00');
    expect(html).toContain('spedizione esclusa');
    expect(html).toContain('href="/shop-natale/ordine"');
    expect(html).toContain('Vai all&#x27;ordine');
    expect(renderToStaticMarkup(<ShopCartBar count={1} subtotalCents={1500} />)).toContain('1 prodotto nel carrello');
  });

  it('la pagina ha un\'area che annuncia i messaggi, vuota finché non si aggiunge nulla', () => {
    const html = renderPage(catalog());
    expect(html).toContain('gcx-shop-toast-region');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('gcx-shop-toast"');
    // Con il carrello vuoto non compare la barra in basso.
    expect(html).not.toContain('Il tuo carrello');
  });
});

describe('altre migliorie della vetrina', () => {
  it('lo sconto si vede subito: etichetta in percentuale e quanto si risparmia', () => {
    const html = card({ product: product({ priceCents: 4500, listPriceCents: 5000, discountPercent: 10 }) });
    expect(html).toContain('-10%');
    expect(html).toContain('Risparmi');
    expect(html).toContain('5,00');
    const plain = card();
    expect(plain).not.toContain('gcx-shop-badge');
    expect(plain).not.toContain('Risparmi');
  });

  it('per i prodotti con foto spiega che si possono caricare anche dopo il pagamento', () => {
    expect(card({ product: product({ photosRequired: 3 }), waitDays: 5 })).toContain('anche dopo il pagamento, entro 5 giorni');
    expect(card({ product: product({ photosRequired: 0 }) })).not.toContain('dopo il pagamento');
  });

  it('con gli ordini non aperti il pulsante c\'è ma è spento e dice perché', () => {
    const early = card({ canOrder: false });
    expect(early).toMatch(/<button[^>]*disabled[^>]*>Ordini non ancora aperti<\/button>/);
    expect(early).not.toContain('Aggiungi al carrello');
    expect(card({ canOrder: false, ordersClosedForGood: true })).toContain('Ordini chiusi');
  });

  it('con più immagini si può scegliere quale guardare; con una sola non ci sono miniature', () => {
    const many = card({ product: product({ images: ['https://img.test/1.jpg', 'https://img.test/2.jpg', 'https://img.test/3.jpg'] }) });
    expect(many).toContain('Mostra la foto 1 di 3');
    expect(many).toContain('Mostra la foto 3 di 3');
    expect(many).toContain('aria-pressed="true"');
    expect(many).toContain('src="https://img.test/1.jpg"');
    const one = card({ product: product({ images: ['https://img.test/1.jpg'] }) });
    expect(one).not.toContain('Mostra la foto');
  });

  it('mentre carica mostra dei segnaposto e non ancora i prodotti', () => {
    const html = renderPage(undefined);
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/gcx-shop-skel/g)).toHaveLength(3);
    expect(html).toContain('Un momento');
  });
});

describe('collegamento alle gift card', () => {
  it('il pulsante che porta a /regala si chiama "Gift card", non "Idee regalo"', () => {
    const html = renderPage(catalog());
    expect(html).toMatch(/<a [^>]*href="\/regala"[^>]*>Gift card<\/a>/);
    expect(html).toContain('Vedi le gift card');
    expect(html).not.toContain('>Idee regalo<');
    expect(html).not.toContain('Vedi le idee regalo');
    const bar = renderToStaticMarkup(<ShopTopBar cartCount={0} showCart showOrders />);
    expect(bar).toMatch(/href="\/regala"[^>]*>Gift card</);
  });

  it('ogni scheda ha un indirizzo proprio, quello citato nei dati per Google', () => {
    expect(card({ product: product({ id: 'tazza' }) })).toContain('id="prodotto-tazza"');
  });
});

describe('pagine per categoria', () => {
  const multi = catalog({
    categories: [{ value: 'natale', nome: 'Natale 2026' }, { value: 'tazze', nome: 'Tazze e mug' }],
    products: [
      product({ id: 'a', nome: 'Album di Natale', categoria: 'natale' }),
      product({ id: 'b', nome: 'Tazza rossa', categoria: 'tazze' }),
      product({ id: 'c', nome: 'Tazza verde', categoria: 'tazze' }),
    ],
  });

  it('la pagina principale con più categorie le elenca come collegamenti, con il numero dei prodotti', () => {
    const html = renderPage(multi);
    expect(html).toContain('aria-label="Categorie dello shop"');
    expect(html).toContain('href="/shop-natale/categoria/tazze"');
    expect(html).toContain('href="/shop-natale/categoria/natale"');
    expect(html).toMatch(/Tazze e mug <span>\(2\)<\/span>/);
    expect(html).toContain('Album di Natale');
    expect(html).toContain('Tazza rossa');
  });

  it("con una sola categoria non mostra l'elenco né i titoli", () => {
    const html = renderPage(catalog());
    expect(html).not.toContain('Categorie dello shop');
    expect(html).not.toContain('/shop-natale/categoria/');
  });

  it('la pagina di una categoria mostra solo i suoi prodotti, con titolo e percorso propri', () => {
    const html = renderPage(multi, 'tazze');
    expect(html).toContain('Tazza rossa');
    expect(html).toContain('Tazza verde');
    expect(html).not.toContain('Album di Natale');
    expect(html).toMatch(/<h1>Tazze e mug<span/);
    expect(html).toContain('aria-label="Percorso"');
    expect(html).toMatch(/<a [^>]*href="\/shop-natale"[^>]*>Shopping di Natale<\/a>/);
    expect(html).toContain('aria-current="page">Tazze e mug<');
  });

  it('la pagina di una categoria rimanda alle altre e non ripete le domande frequenti', () => {
    const html = renderPage(multi, 'tazze');
    expect(html).toContain('Altre categorie');
    expect(html).toContain('href="/shop-natale/categoria/natale"');
    expect(html).not.toContain('Domande frequenti');
    expect(renderPage(multi)).toContain('Domande frequenti');
  });

  it('con una categoria che non esiste lo dice e porta allo shop', () => {
    const html = renderPage(multi, 'inesistente');
    expect(html).toContain('Questa categoria non è disponibile');
    expect(html).toContain('Vai allo shop di Natale');
    expect(html).not.toContain('Tazza rossa');
  });

  it('con la vetrina spenta una categoria mostra solo il messaggio di arrivo', () => {
    const html = renderPage(catalog({ enabled: false, products: [], categories: [] }), 'tazze');
    expect(html).toContain('Lo shop di Natale arriva presto');
    expect(html).toContain('Torna al sito');
  });
});
