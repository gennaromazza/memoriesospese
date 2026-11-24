import { Link } from 'wouter';
import { ShoppingBag } from 'lucide-react';
import { createUrl } from '@/lib/basePath';
import { useShopCartStatus } from './useShopCartStatus';

/** Accesso al carrello anche dopo aver lasciato lo shop, su desktop e telefono. */
export function ShopCartLink() {
  const { count, hasDraft } = useShopCartStatus();
  if (!count && !hasDraft) return null;
  return (
    <Link
      href={createUrl('/online-shop/ordine')}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-sage/30 bg-white px-3 py-2 text-sm font-semibold text-blue-gray"
      aria-label={count ? `Carrello shop: ${count} articoli` : 'Riprendi il carrello shop salvato'}
    >
      <ShoppingBag className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">Carrello</span>
      <span className="rounded-full bg-sage/15 px-1.5 text-xs">{count || '•'}</span>
    </Link>
  );
}
