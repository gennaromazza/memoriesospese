import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { GIFT_CARD_STATUS_LABELS } from '@shared/gift-card-types';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';

/** Codice regalo passato nell'indirizzo della prenotazione (?regalo=CODICE). */
export function useBookingGiftCard() {
  const code = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('regalo')?.trim() || '';
    } catch {
      return '';
    }
  }, []);
  const query = useQuery({
    queryKey: ['gift-card-public', code],
    queryFn: () => giftCardsApi.getPublic(code),
    enabled: !!code,
    retry: false,
    staleTime: 60_000,
  });
  const usable = query.data?.status === 'attiva';
  return { code, query, usable, usableCode: usable ? code : undefined };
}

/** Avviso in cima alla prenotazione: dice se la gift card copre il pagamento. */
export function GiftCardBookingBanner({ gift }: { gift: ReturnType<typeof useBookingGiftCard> }) {
  if (!gift.code || gift.query.isLoading) return null;
  const card = gift.query.data;
  if (gift.usable && card) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900" role="status">
        <Gift className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Stai usando la tua gift card: {card.title}{card.line2 ? `, ${card.line2}` : ''}</p>
          <p>Scegli giorno e orario: non devi pagare nulla.</p>
          {card.items.length ? <p className="text-emerald-800">Include: {card.items.map(item => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name)).join(', ')}.</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900" role="alert">
      <Gift className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="text-sm">
        {card
          ? `Il codice regalo non si può usare: la card risulta «${GIFT_CARD_STATUS_LABELS[card.status].toLowerCase()}».`
          : 'Non troviamo questo codice regalo.'}{' '}
        Puoi comunque inviare la prenotazione: verrà trattata come una prenotazione normale.
      </p>
    </div>
  );
}
