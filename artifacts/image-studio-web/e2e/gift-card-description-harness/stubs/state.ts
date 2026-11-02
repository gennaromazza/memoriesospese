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
} = {
  products: [],
  productUpdates: [],
  savedGiftCards: [],
};

export function resetGiftCardDescriptionState() {
  giftCardDescriptionState.products = [missingDescriptionProduct()];
  giftCardDescriptionState.productUpdates = [];
  giftCardDescriptionState.savedGiftCards = [];
  (window as any).__giftCardDescriptionE2E = giftCardDescriptionState;
}
