import { useQuery } from '@tanstack/react-query';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';

/**
 * Vero quando c'è almeno un regalo in vendita sul sito. Serve a mostrare i
 * collegamenti alla pagina regalo solo quando la vetrina non è vuota.
 * Se la richiesta fallisce i collegamenti restano nascosti.
 */
export function useGiftShopAvailable(): boolean {
  const shop = useQuery({
    queryKey: ['gift-card-shop'],
    queryFn: giftCardsApi.getShop,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return (shop.data?.types.length ?? 0) > 0;
}
