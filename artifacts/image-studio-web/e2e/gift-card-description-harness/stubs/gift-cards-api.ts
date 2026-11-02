import type { GiftCardTypeDto, GiftCardTypeInput } from '@shared/gift-card-types';
import { giftCardDescriptionState } from './state';

export class GiftCardApiError extends Error {}

export const giftCardsApi = {
  async listTypes(): Promise<GiftCardTypeDto[]> {
    return [];
  },
  async createType(input: GiftCardTypeInput): Promise<GiftCardTypeDto> {
    giftCardDescriptionState.savedGiftCards.push(structuredClone(input));
    return { ...structuredClone(input), id: 'e2e-created-gift-card', createdAt: '', updatedAt: '' } as GiftCardTypeDto;
  },
  async updateType(id: string, input: GiftCardTypeInput): Promise<GiftCardTypeDto> {
    giftCardDescriptionState.savedGiftCards.push(structuredClone(input));
    return { ...structuredClone(input), id, createdAt: '', updatedAt: '' } as GiftCardTypeDto;
  },
  async deleteType(): Promise<{ soldCards: number }> {
    return { soldCards: 0 };
  },
};
