import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useSEO } from '@/hooks/useSEO';
import { shopApi } from '@/features/shop/shop-api';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { printShopApi } from '@/features/print-shop/print-shop-api';
import { SHOP_DIRECTORY_PATH, activeShops, shopIsActive, type ShopActivity } from '@/features/shop/shop-directory';
import { ShopShell } from '@/features/shop/ShopShell';

/** Un solo indirizzo con tutti gli shop attivi. Uno shop spento o senza prodotti non compare. */
async function loadActivity(): Promise<ShopActivity> {
  const [natale, gift, stampe] = await Promise.allSettled([
    shopApi.getCatalog(),
    giftCardsApi.getShop(),
    printShopApi.getCatalog(),
  ]);
  return {
    natale: natale.status === 'fulfilled' ? shopIsActive(natale.value) : null,
    'gift-card': gift.status === 'fulfilled' ? gift.value.types.length > 0 : null,
    stampe: stampe.status === 'fulfilled' ? stampe.value.products.length > 0 : null,
  };
}

export default function ShopDirectoryPage() {
  useSEO({
    title: 'I nostri shop online | Image Studio',
    description: 'Tutti gli shop online di Image Studio ad Aversa: regali di Natale con le tue foto, gift card e stampe fotografiche.',
    canonical: SHOP_DIRECTORY_PATH,
    noindex: true,
  });

  const { data, isLoading } = useQuery({ queryKey: ['shop-directory'], queryFn: loadActivity, staleTime: 60_000 });
  const shops = data ? activeShops(data) : [];

  return (
    <ShopShell eyebrow="Image Studio" title="I nostri shop online" subtitle="Scegli lo shop che ti interessa.">
      {isLoading ? (
        <p className="text-blue-gray/60">Caricamento…</p>
      ) : shops.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold">Al momento nessuno shop è aperto</h2>
          <p className="mt-2 text-blue-gray/60">Torna a trovarci presto, oppure contattaci in studio.</p>
          <Link href="/" className="mt-5 inline-block underline">Torna al sito</Link>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {shops.map(shop => (
            <li key={shop.key} className="flex flex-col rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">{shop.title}</h2>
              <p className="mt-2 flex-1 text-blue-gray/70">{shop.description}</p>
              <Link href={shop.href} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-terracotta px-6 font-semibold text-white">
                {shop.cta}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ShopShell>
  );
}

