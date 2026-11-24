import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { shopApi } from './shop-api';
import { pendingShopOrderCount, readStored, SHOP_DRAFT_STORAGE_KEY, SHOP_STORAGE_EVENT } from './shop-cart';
import { useShopCart } from './useShopCart';

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(SHOP_STORAGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(SHOP_STORAGE_EVENT, listener);
  };
}

/** Il carrello locale e la bozza d'ordine sono due parti dello stesso acquisto. */
export function useShopCartStatus() {
  const { count } = useShopCart();
  const { user } = useFirebaseAuth();
  const draftId = useSyncExternalStore(subscribe, () => readStored(SHOP_DRAFT_STORAGE_KEY), () => null);
  const draft = useQuery({
    queryKey: ['shop-cart-draft', user?.uid, draftId],
    queryFn: () => shopApi.getOrder(draftId!),
    enabled: Boolean(user && draftId),
    staleTime: 0,
    retry: false,
  });
  const draftCount = user ? pendingShopOrderCount(draft.data) : 0;
  const hasDraft = Boolean(draftId && (!user || draft.isLoading || draft.isError || draftCount > 0));
  return { count: count + draftCount, hasDraft };
}
