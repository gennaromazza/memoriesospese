import { describe, expect, it } from 'vitest';
import type { Product } from '@shared/booking-types';
import { shopProductRows } from './shop-products-overview';

const product = (patch: Partial<Product> & { salesChannels?: string[] }): Product => ({
  id: 'p', nome: 'Tazza', descrizione: '', prezzo: 15, sconto: 0, prezzoFinale: 15, numeroFoto: 1, pesoGrammi: 300,
  categoria: 'natale', attivo: true, immagini: ['https://x/y.jpg'], ...patch,
} as Product);

describe('prodotti dello shop', () => {
  it('tiene solo le categorie dello shop e salta i prodotti dello shop stampe', () => {
    const rows = shopProductRows([
      product({ id: 'a' }),
      product({ id: 'b', categoria: 'album' }),
      product({ id: 'c', salesChannels: ['print_shop'] }),
    ], ['natale'], true);
    expect(rows.map(row => row.product.id)).toEqual(['a']);
  });

  it('un prodotto completo non ha note', () => {
    expect(shopProductRows([product({})], ['natale'], true)[0]).toMatchObject({ visible: true, notes: [] });
  });

  it('segnala cosa manca', () => {
    const [row] = shopProductRows([product({ attivo: false, prezzo: 0, prezzoFinale: 0, pesoGrammi: 0, immagini: [] })], ['natale'], true);
    expect(row.visible).toBe(false);
    expect(row.notes).toHaveLength(4);
  });

  it('il peso non serve se la spedizione è spenta', () => {
    expect(shopProductRows([product({ pesoGrammi: 0 })], ['natale'], false)[0].notes).toEqual([]);
  });
});
