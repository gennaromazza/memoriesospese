import type { Product } from '@shared/booking-types';
import type { GiftCardTypeInput } from '@shared/gift-card-types';

const missingDescriptionProduct = (): Product => ({
  id: 'e2e-product-shooting',
  nome: 'Shooting test',
  descrizione: '',
  prezzo: 75,
  sconto: 0,
  prezzoFinale: 75,
  numeroFoto: 10,
  pesoGrammi: 0,
  categoria: 'album',
  attivo: true,
  immagini: [],
  isBundle: false,
  bundleItems: [],
  createdAt: new Date(0) as unknown as Product['createdAt'],
  updatedAt: new Date(0) as unknown as Product['updatedAt'],
});

export const giftCardDescriptionState: {
  products: Product[];
  productUpdates: Array<{ productId: string; description: string }>;
  savedGiftCards: GiftCardTypeInput[];
  listTypesCalls: number;
} = {
  products: [],
  productUpdates: [],
  savedGiftCards: [],
  listTypesCalls: 0,
};

const STORAGE_KEY = 'gift-card-description-e2e-persisted-state';

export function initializeGiftCardDescriptionState() {
  const persisted = window.localStorage.getItem(STORAGE_KEY);
  if (persisted) {
    const saved = JSON.parse(persisted) as Pick<typeof giftCardDescriptionState, 'products' | 'productUpdates' | 'savedGiftCards'>;
    giftCardDescriptionState.products = saved.products;
    giftCardDescriptionState.productUpdates = saved.productUpdates;
    giftCardDescriptionState.savedGiftCards = saved.savedGiftCards;
  } else {
    giftCardDescriptionState.products = [missingDescriptionProduct()];
    giftCardDescriptionState.productUpdates = [];
    giftCardDescriptionState.savedGiftCards = [];
    persistGiftCardDescriptionState();
  }
  giftCardDescriptionState.listTypesCalls = 0;
  (window as any).__giftCardDescriptionE2E = giftCardDescriptionState;
}

export function persistGiftCardDescriptionState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products: giftCardDescriptionState.products,
    productUpdates: giftCardDescriptionState.productUpdates,
    savedGiftCards: giftCardDescriptionState.savedGiftCards,
  }));
}
