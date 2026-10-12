import { describe, expect, it } from 'vitest';
import {
  addToCart,
  cartCount,
  cartLines,
  emptyCart,
  parseStoredCart,
  pruneCart,
  removeFromCart,
  serializeCart,
  setCartQuantity,
} from './shop-cart';

const mug = { id: 'mug', photosRequired: 1 };
const card = { id: 'card', photosRequired: 0 };

describe('carrello', () => {
  it('un prodotto con foto è sempre una riga nuova da una unità', () => {
    let cart = addToCart(emptyCart(), mug, 1, 'a');
    cart = addToCart(cart, mug, 5, 'b');
    expect(cart.items).toEqual([
      { key: 'a', productId: 'mug', quantity: 1 },
      { key: 'b', productId: 'mug', quantity: 1 },
    ]);
  });

  it('un prodotto senza foto somma le quantità fino al massimo', () => {
    let cart = addToCart(emptyCart(), card, 2, 'a');
    cart = addToCart(cart, card, 3, 'b');
    expect(cart.items).toEqual([{ key: 'a', productId: 'card', quantity: 5 }]);
    cart = addToCart(cart, card, 100, 'c');
    expect(cart.items[0].quantity).toBe(20);
  });

  it('non supera il numero massimo di righe', () => {
    let cart = emptyCart();
    for (let index = 0; index < 25; index++) cart = addToCart(cart, mug, 1, `k${index}`);
    expect(cart.items).toHaveLength(20);
    const full = addToCart(cart, card, 1, 'x');
    expect(full.items).toHaveLength(20);
  });

  it('toglie righe, cambia quantità entro i limiti e conta i pezzi', () => {
    let cart = addToCart(addToCart(emptyCart(), mug, 1, 'a'), card, 3, 'b');
    expect(cartCount(cart)).toBe(4);
    cart = setCartQuantity(cart, 'b', 0);
    expect(cart.items[1].quantity).toBe(1);
    cart = setCartQuantity(cart, 'b', 99);
    expect(cart.items[1].quantity).toBe(20);
    cart = removeFromCart(cart, 'a');
    expect(cart.items.map(item => item.key)).toEqual(['b']);
  });

  it('produce le righe da mandare al server senza le chiavi interne', () => {
    const cart = addToCart(addToCart(emptyCart(), mug, 1, 'a'), card, 2, 'b');
    expect(cartLines(cart)).toEqual([{ productId: 'mug', quantity: 1 }, { productId: 'card', quantity: 2 }]);
  });

  it('toglie i prodotti non più in vendita', () => {
    const cart = addToCart(addToCart(emptyCart(), mug, 1, 'a'), card, 2, 'b');
    expect(pruneCart(cart, new Set(['card'])).items.map(item => item.productId)).toEqual(['card']);
    expect(pruneCart(cart, new Set(['mug', 'card']))).toBe(cart);
  });
});

describe('carrello salvato', () => {
  it('salva e rilegge lo stesso carrello', () => {
    const cart = addToCart(addToCart(emptyCart(), mug, 1, 'a'), card, 2, 'b');
    expect(parseStoredCart(serializeCart(cart))).toEqual(cart);
  });

  it.each([
    ['vuoto', null],
    ['non JSON', 'non json'],
    ['versione sconosciuta', JSON.stringify({ version: 2, items: [] })],
    ['elenco mancante', JSON.stringify({ version: 1 })],
  ])('con un contenuto non valido (%s) riparte da vuoto', (_label, raw) => {
    expect(parseStoredCart(raw)).toEqual(emptyCart());
  });

  it('scarta le righe rovinate e tiene quelle valide', () => {
    const raw = JSON.stringify({
      version: 1,
      items: [
        { key: 'ok', productId: 'mug', quantity: 1 },
        { key: 'ok', productId: 'doppia', quantity: 1 },
        { key: 'senza-prodotto', quantity: 1 },
        { key: 'barra', productId: 'a/b', quantity: 1 },
        { key: 'decimale', productId: 'card', quantity: 1.5 },
        { key: 'enorme', productId: 'card', quantity: 999 },
        null,
        'testo',
      ],
    });
    expect(parseStoredCart(raw).items).toEqual([
      { key: 'ok', productId: 'mug', quantity: 1 },
      { key: 'enorme', productId: 'card', quantity: 20 },
    ]);
  });

  it('non carica più righe del massimo', () => {
    const items = Array.from({ length: 50 }, (_, index) => ({ key: `k${index}`, productId: 'p', quantity: 1 }));
    expect(parseStoredCart(JSON.stringify({ version: 1, items })).items).toHaveLength(20);
  });
});
