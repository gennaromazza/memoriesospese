import type { GiftCardTypeDto, GiftCardTypeInput } from '@shared/gift-card-types';
import { giftCardDescriptionState, persistGiftCardDescriptionState } from './state';

export class GiftCardApiError extends Error {}

export const giftCardsApi = {
  async listTypes(): Promise<GiftCardTypeDto[]> {
    giftCardDescriptionState.listTypesCalls += 1;
    return giftCardDescriptionState.savedGiftCards.map(input => ({
      ...structuredClone(input),
      id: 'e2e-created-gift-card',
      createdAt: '',
      updatedAt: '',
    })) as GiftCardTypeDto[];
  },
  async createType(input: GiftCardTypeInput): Promise<GiftCardTypeDto> {
    giftCardDescriptionState.savedGiftCards.push(structuredClone(input));
    persistGiftCardDescriptionState();
    return { ...structuredClone(input), id: 'e2e-created-gift-card', createdAt: '', updatedAt: '' } as GiftCardTypeDto;
  },
  async updateType(id: string, input: GiftCardTypeInput): Promise<GiftCardTypeDto> {
    const existingIndex = giftCardDescriptionState.savedGiftCards.findIndex((_, index) => index === 0 && id === 'e2e-created-gift-card');
    if (existingIndex < 0) throw new Error(`Gift card non trovata: ${id}`);
    giftCardDescriptionState.savedGiftCards[existingIndex] = structuredClone(input);
    persistGiftCardDescriptionState();
    return { ...structuredClone(input), id, createdAt: '', updatedAt: '' } as GiftCardTypeDto;
  },
  async deleteType(): Promise<{ soldCards: number }> {
    return { soldCards: 0 };
  },
};
