import { SHOP_MAX_LINES, SHOP_MAX_QUANTITY } from '@shared/shop-types';

/**
 * Carrello del browser. Contiene solo cosa si vuole comprare (prodotto e
 * quantità): prezzi e foto richieste li decide sempre il server.
 */
export interface CartItem {
  /** Identifica la riga nel carrello (non è l'id della riga dell'ordine). */
  key: string;
  productId: string;
  quantity: number;
}

export interface CartState {
  version: 1;
  items: CartItem[];
}

export const SHOP_CART_STORAGE_KEY = 'shop-cart-v1';
export const SHOP_DRAFT_STORAGE_KEY = 'shop-draft-order-id';

export const emptyCart = (): CartState => ({ version: 1, items: [] });

let counter = 0;
export function newCartKey(): string {
  counter += 1;
  return `c${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const clampQuantity = (value: number) => Math.min(SHOP_MAX_QUANTITY, Math.max(1, Math.trunc(value) || 1));

/**
 * Aggiunge un prodotto. Un prodotto che richiede foto è sempre una riga nuova
 * da una sola unità (ogni esemplare ha le sue foto); gli altri si sommano.
 */
export function addToCart(
  cart: CartState,
  product: { id: string; photosRequired: number },
  quantity = 1,
  key: string = newCartKey(),
): CartState {
  if (product.photosRequired > 0) {
    if (cart.items.length >= SHOP_MAX_LINES) return cart;
    return { ...cart, items: [...cart.items, { key, productId: product.id, quantity: 1 }] };
  }
  const existing = cart.items.find(item => item.productId === product.id);
  if (existing) {
    return {
      ...cart,
      items: cart.items.map(item => (item.key === existing.key ? { ...item, quantity: clampQuantity(item.quantity + quantity) } : item)),
    };
  }
  if (cart.items.length >= SHOP_MAX_LINES) return cart;
  return { ...cart, items: [...cart.items, { key, productId: product.id, quantity: clampQuantity(quantity) }] };
}

export function removeFromCart(cart: CartState, key: string): CartState {
  return { ...cart, items: cart.items.filter(item => item.key !== key) };
}

export function setCartQuantity(cart: CartState, key: string, quantity: number): CartState {
  return { ...cart, items: cart.items.map(item => (item.key === key ? { ...item, quantity: clampQuantity(quantity) } : item)) };
}

/** Numero di pezzi nel carrello. */
export function cartCount(cart: CartState): number {
  return cart.items.reduce((total, item) => total + item.quantity, 0);
}

/** Toglie i prodotti che non sono più in vendita. */
export function pruneCart(cart: CartState, availableProductIds: ReadonlySet<string>): CartState {
  const items = cart.items.filter(item => availableProductIds.has(item.productId));
  return items.length === cart.items.length ? cart : { ...cart, items };
}

/** Righe nel formato che il server si aspetta per creare o aggiornare un ordine. */
export function cartLines(cart: CartState): Array<{ productId: string; quantity: number }> {
  return cart.items.map(item => ({ productId: item.productId, quantity: item.quantity }));
}

/** Legge il carrello salvato ignorando tutto ciò che non è valido (dati vecchi, modificati a mano, corrotti). */
export function parseStoredCart(raw: string | null | undefined): CartState {
  if (!raw) return emptyCart();
  try {
    const data = JSON.parse(raw) as { version?: unknown; items?: unknown };
    if (data?.version !== 1 || !Array.isArray(data.items)) return emptyCart();
    const items: CartItem[] = [];
    const keys = new Set<string>();
    for (const entry of data.items) {
      const item = entry as Partial<CartItem> | null;
      if (
        !item ||
        typeof item.key !== 'string' ||
        !item.key ||
        keys.has(item.key) ||
        typeof item.productId !== 'string' ||
        !item.productId ||
        item.productId.includes('/') ||
        !Number.isSafeInteger(item.quantity)
      ) {
        continue;
      }
      keys.add(item.key);
      items.push({ key: item.key, productId: item.productId, quantity: clampQuantity(item.quantity as number) });
      if (items.length >= SHOP_MAX_LINES) break;
    }
    return { version: 1, items };
  } catch {
    return emptyCart();
  }
}

export function serializeCart(cart: CartState): string {
  return JSON.stringify(cart);
}

/** Lettura e scrittura sicure: il browser può negare l'accesso (modalità privata, dati bloccati). */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Senza memoria locale il carrello vale solo per questa visita.
  }
}
