import { useQuery } from '@tanstack/react-query';
import { printShopApi } from '@/features/print-shop/print-shop-api';

/** True only when the public print catalog currently contains purchasable products. */
export function usePrintShopAvailable(): boolean {
  const catalog = useQuery({
    queryKey: ['print-shop-catalog'],
    queryFn: ({ signal }) => printShopApi.getCatalog(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return (catalog.data?.products.length ?? 0) > 0;
}
