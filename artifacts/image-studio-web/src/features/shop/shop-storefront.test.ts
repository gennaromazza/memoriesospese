import { describe, expect, it } from 'vitest';
import { SHOP_MAX_LINES, SHOP_MAX_QUANTITY } from '@shared/shop-types';
import type { CartState } from './shop-cart';
import {
  addOutcome,
  addedMessage,
  discountPercent,
  photosHint,
  photosLabel,
  productsLabel,
  savingsCents,
  summarizeCart,
} from './shop-storefront';

const cartOf = (items: Array<[string, number]>): CartState => ({
  version: 1,
  items: items.map(([productId, quantity], index) => ({ key: `k${index}`, productId, quantity })),
});
const fullCart = (): CartState => cartOf(Array.from({ length: SHOP_MAX_LINES }, (_, index) => [`p${index}`, 1] as [string, number]));

describe('aggiungere al carrello', () => {
  it('di solito aggiunge', () => {
    expect(addOutcome(cartOf([]), { id: 'mug', photosRequired: 1 })).toBe('added');
    expect(addOutcome(cartOf([['card', 2]]), { id: 'card', photosRequired: 0 })).toBe('added');
  });

  it('con il carrello pieno lo dice invece di non fare nulla', () => {
    expect(addOutcome(fullCart(), { id: 'nuovo', photosRequired: 0 })).toBe('cart_full');
    expect(addOutcome(fullCart(), { id: 'mug', photosRequired: 1 })).toBe('cart_full');
  });

  it('un prodotto già presente senza foto si somma anche a carrello pieno, finché non arriva al massimo', () => {
    const cart = fullCart();
    expect(addOutcome(cart, { id: 'p3', photosRequired: 0 })).toBe('added');
    const atMax = cartOf([['card', SHOP_MAX_QUANTITY]]);
    expect(addOutcome(atMax, { id: 'card', photosRequired: 0 })).toBe('max_quantity');
  });

  it('un prodotto con foto è sempre una riga nuova, quindi conta nel limite delle righe', () => {
    expect(addOutcome(cartOf([['mug', 1]]), { id: 'mug', photosRequired: 1 })).toBe('added');
    expect(addOutcome(fullCart(), { id: 'p3', photosRequired: 1 })).toBe('cart_full');
  });

  it('i messaggi dicono cosa è successo', () => {
    expect(addedMessage('Tazza', 'added')).toBe('Tazza aggiunto al carrello');
    expect(addedMessage('Tazza', 'cart_full')).toContain(String(SHOP_MAX_LINES));
    expect(addedMessage('Tazza', 'max_quantity')).toContain(String(SHOP_MAX_QUANTITY));
  });
});

describe('riepilogo del carrello', () => {
  const products = [
    { id: 'mug', priceCents: 1500 },
    { id: 'card', priceCents: 300 },
  ];

  it('somma pezzi e importo con i prezzi della vetrina', () => {
    expect(summarizeCart(cartOf([['mug', 1], ['mug', 1], ['card', 3]]), products)).toEqual({ count: 5, subtotalCents: 1500 * 2 + 300 * 3 });
  });

  it('un prodotto non più in vendita non si conta', () => {
    expect(summarizeCart(cartOf([['mug', 1], ['sparito', 4]]), products)).toEqual({ count: 1, subtotalCents: 1500 });
  });

  it('un carrello vuoto vale zero', () => {
    expect(summarizeCart(cartOf([]), products)).toEqual({ count: 0, subtotalCents: 0 });
    expect(summarizeCart(cartOf([['mug', 1]]), [])).toEqual({ count: 0, subtotalCents: 0 });
  });
});

describe('sconti e testi', () => {
  it('calcola lo sconto in percentuale e il risparmio', () => {
    expect(discountPercent({ priceCents: 4500, listPriceCents: 5000 })).toBe(10);
    expect(savingsCents({ priceCents: 4500, listPriceCents: 5000 })).toBe(500);
    expect(discountPercent({ priceCents: 3333, listPriceCents: 5000 })).toBe(33);
  });

  it('senza sconto non c\'è nulla da mostrare', () => {
    expect(discountPercent({ priceCents: 1500, listPriceCents: 1500 })).toBe(0);
    expect(savingsCents({ priceCents: 1500, listPriceCents: 1500 })).toBe(0);
    expect(discountPercent({ priceCents: 1500, listPriceCents: 0 })).toBe(0);
    // Un prezzo di listino più basso (dato sbagliato) non produce sconti negativi.
    expect(discountPercent({ priceCents: 2000, listPriceCents: 1500 })).toBe(0);
    expect(savingsCents({ priceCents: 2000, listPriceCents: 1500 })).toBe(0);
  });

  it('dice quante foto servono e rassicura sul momento in cui caricarle', () => {
    expect(photosLabel(0)).toBe('Nessuna foto da caricare');
    expect(photosLabel(1)).toBe('Serve 1 tua foto');
    expect(photosLabel(8)).toBe('Servono 8 tue foto');
    expect(photosHint(0, 7)).toBeNull();
    expect(photosHint(1, 7)).toBe('Le puoi caricare anche dopo il pagamento, entro 7 giorni.');
    expect(photosHint(2, 1)).toBe('Le puoi caricare anche dopo il pagamento, entro 1 giorno.');
    expect(photosHint(2, 0)).toBe('Le puoi caricare anche dopo il pagamento, entro 1 giorno.');
  });

  it('singolare e plurale dei prodotti', () => {
    expect(productsLabel(1)).toBe('1 prodotto');
    expect(productsLabel(3)).toBe('3 prodotti');
  });
});
