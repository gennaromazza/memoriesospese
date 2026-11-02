import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Timestamp } from 'firebase/firestore';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@shared/booking-types';
import type { GiftCardItemInput } from '@shared/gift-card-types';
import GiftCardItemsEditor from './GiftCardItemsEditor';

vi.mock('@/lib/products', () => ({
  getAllProducts: vi.fn(),
  useActiveProductCategories: () => ({ data: [] }),
}));

const product = {
  id: 'bundle-natale',
  nome: 'Natale completo',
  descrizione: 'Shooting fotografico con ricordi stampati.',
  prezzo: 100,
  sconto: 0,
  prezzoFinale: 100,
  numeroFoto: 20,
  categoria: 'natale',
  attivo: true,
  immagini: [],
  isBundle: true,
  bundleItems: [
    { prodottoId: 'shooting', prodottoNome: 'Shooting', quantita: 1, numeroFoto: 20 },
    { prodottoId: 'album', prodottoNome: 'Album', quantita: 1, numeroFoto: 10 },
  ],
  createdAt: Timestamp.fromDate(new Date(0)),
  updatedAt: Timestamp.fromDate(new Date(0)),
} as Product;

function renderEditor(items: GiftCardItemInput[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['gift-card-products'], [product]);

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <GiftCardItemsEditor items={items} onChange={() => undefined} onUseTotal={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('prodotti associati alle gift card', () => {
  it('mostra descrizione e contenuto del bundle mentre si cerca nel catalogo', () => {
    const html = renderEditor([]);

    expect(html).toContain('Shooting fotografico con ricordi stampati.');
    expect(html).toContain('Include: 1 × Shooting · 1 × Album');
  });

  it('mantiene visibili descrizione e contenuto dopo aver aggiunto il prodotto', () => {
    const html = renderEditor([{ productId: product.id, quantity: 1 }]);

    expect(html).toContain('Shooting fotografico con ricordi stampati.');
    expect(html).toContain('Include: 1 × Shooting · 1 × Album');
  });
});
