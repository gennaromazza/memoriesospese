import { useCallback, useSyncExternalStore } from 'react';
import {
  SHOP_CART_STORAGE_KEY,
  addToCart,
  cartCount,
  emptyCart,
  parseStoredCart,
  readStored,
  removeFromCart,
  serializeCart,
  setCartQuantity,
  writeStored,
  type CartState,
} from './shop-cart';

const listeners = new Set<() => void>();
const EMPTY = emptyCart();
// Se il browser nega la memoria locale il carrello vive qui, finché la pagina resta aperta.
let current: CartState | null = null;

function snapshot(): CartState {
  if (current) return current;
  current = parseStoredCart(readStored(SHOP_CART_STORAGE_KEY));
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHOP_CART_STORAGE_KEY || event.key === null) {
      current = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function update(change: (cart: CartState) => CartState): void {
  const next = change(snapshot());
  if (next === current) return;
  current = next;
  writeStored(SHOP_CART_STORAGE_KEY, next.items.length ? serializeCart(next) : null);
  listeners.forEach(listener => listener());
}

/** Carrello condiviso tra le pagine dello shop, conservato nel browser. */
export function useShopCart() {
  const cart = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const add = useCallback((product: { id: string; photosRequired: number }, quantity = 1) => update(state => addToCart(state, product, quantity)), []);
  const remove = useCallback((key: string) => update(state => removeFromCart(state, key)), []);
  const setQuantity = useCallback((key: string, quantity: number) => update(state => setCartQuantity(state, key, quantity)), []);
  const clear = useCallback(() => update(() => emptyCart()), []);
  const replace = useCallback((next: CartState) => update(() => next), []);
  return { cart, count: cartCount(cart), add, remove, setQuantity, clear, replace };
}
