import { useQuery } from '@tanstack/react-query';
import { shopApi } from '@/features/shop/shop-api';

/**
 * Vero quando la vetrina dello shop è accesa e ha almeno un prodotto. Serve a
 * mostrare i collegamenti allo shop solo quando la pagina ha qualcosa da
 * mostrare. Se la richiesta fallisce i collegamenti restano nascosti.
 */
export function useShopAvailable(): boolean {
  const catalog = useQuery({
    queryKey: ['shop-catalog'],
    queryFn: shopApi.getCatalog,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return catalog.data?.enabled === true && (catalog.data.products.length ?? 0) > 0;
}
