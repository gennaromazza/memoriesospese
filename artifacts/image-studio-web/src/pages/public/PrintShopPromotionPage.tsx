import { useMemo } from 'react';
import { Link, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Ticket } from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useSEO } from '@/hooks/useSEO';
import { createUrl } from '@/lib/basePath';
import { apiRequest } from '@/lib/queryClient';
import type { PrintShopPublicPromotion } from '@shared/print-shop-types';
import {
  formatPrintPromotionOffer,
  PRINT_PROMOTION_OG_IMAGE,
} from '@shared/print-shop-promotion';

const promotionsQueryKey = ['/api/print-shop/promotions'] as const;
const socialImageAlt = 'Stampe fotografiche di qualità pronte per conservare i tuoi ricordi';

async function loadPromotions(): Promise<PrintShopPublicPromotion[]> {
  const response = await apiRequest('GET', '/api/print-shop/promotions');
  if (!response.ok) throw new Error('Le promozioni non sono disponibili al momento.');
  const body = await response.json() as { promotions?: PrintShopPublicPromotion[] };
  if (!Array.isArray(body.promotions)) throw new Error('Le promozioni non sono disponibili al momento.');
  return body.promotions;
}

function expiryDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

export default function PrintShopPromotionPage() {
  const { code = '' } = useParams<{ code: string }>();
  const promotionsQuery = useQuery({
    queryKey: promotionsQueryKey,
    queryFn: loadPromotions,
    staleTime: 30_000,
  });
  const promotion = promotionsQuery.data?.find(
    entry => entry.code.toLowerCase() === code.toLowerCase(),
  );
  const canonical = `/stampa-foto-aversa/offerte/${encodeURIComponent(code.toLowerCase())}`;
  const seo = useMemo(() => {
    if (!promotion) {
      return {
        title: 'Offerta non disponibile | Stampa foto ad Aversa',
        description: 'Questa promozione per la stampa foto non è più disponibile. Scopri le offerte e i formati attivi.',
      };
    }
    const title = `Stampe foto ad Aversa: ${promotion.code.slice(0, 12)} | ${formatPrintPromotionOffer(promotion)}`.slice(0, 60);
    const description = `${formatPrintPromotionOffer(promotion)}. Usa il codice ${promotion.code} entro il ${expiryDate(promotion.endsAt)}. Il risparmio sul listino viene calcolato nel carrello prima del pagamento. Ordina online le stampe fotografiche.`;
    return { title, description };
  }, [promotion]);

  useSEO({
    ...seo,
    canonical,
    ogImage: promotion?.graphic?.imageUrl || PRINT_PROMOTION_OG_IMAGE,
    ogImageAlt: socialImageAlt,
    ogImageWidth: promotion?.graphic?.width || 1200,
    ogImageHeight: promotion?.graphic?.height || 630,
    ogImageType: promotion?.graphic?.contentType || 'image/jpeg',
    ogImageSource: 'curated-static',
    noindex: !promotionsQuery.isLoading && !promotion,
    pending: promotionsQuery.isLoading,
  });

  const orderHref = useMemo(() => {
    if (!promotion) return createUrl('/stampa-foto-aversa/ordine');
    const params = new URLSearchParams({ coupon: promotion.code });
    if (promotion.scope === 'selected' && promotion.eligibleFormats.length === 1) {
      params.set('sku', promotion.eligibleFormats[0].sku);
    }
    return createUrl(`/stampa-foto-aversa/ordine?${params.toString()}`);
  }, [promotion]);

  const isFixedPackage = promotion?.discountType === 'fixed_total';

  return (
    <>
      <Navigation />
      <main className="min-h-[70vh] bg-off-white px-4 py-12 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <Link href={createUrl('/stampa-foto-aversa')} className="inline-flex items-center gap-2 text-sm font-semibold text-dark-sage hover:text-terracotta">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Tutte le stampe
          </Link>

          {promotionsQuery.isLoading ? (
            <div className="mt-8 rounded-3xl border border-sage/20 bg-white p-8" role="status">
              Caricamento dell’offerta…
            </div>
          ) : promotionsQuery.isError ? (
            <div className="mt-8 rounded-3xl border border-sage/20 bg-white p-8" role="alert">
              Non riesco a caricare l’offerta. Riprova tra poco.
            </div>
          ) : !promotion ? (
            <section className="mt-8 rounded-3xl border border-sage/20 bg-white p-8 text-center shadow-sm">
              <h1 className="text-3xl font-semibold text-blue-gray">Offerta non disponibile</h1>
              <p className="mt-3 text-blue-gray/70">Il coupon potrebbe essere scaduto, esaurito o non più pubblicato.</p>
              <Button asChild className="mt-6 rounded-full bg-dark-sage text-white hover:bg-blue-gray">
                <Link href={createUrl('/stampa-foto-aversa')}>Vai alle stampe attive</Link>
              </Button>
            </section>
          ) : (
            <article className="mt-8 overflow-hidden rounded-[2rem] border border-sage/20 bg-white shadow-sm">
              <img
                src={promotion.graphic?.imageUrl || createUrl(PRINT_PROMOTION_OG_IMAGE)}
                alt={socialImageAlt}
                width={promotion.graphic?.width || 1200}
                height={promotion.graphic?.height || 630}
                fetchPriority="high"
                className="max-h-[70vh] w-full object-contain bg-off-white"
              />
              <div className="p-6 sm:p-10">
                <p className="inline-flex items-center gap-2 rounded-full bg-terracotta/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
                  <Ticket className="h-4 w-4" aria-hidden="true" /> Promozione stampe
                </p>
                <h1 className="mt-5 text-3xl font-semibold leading-tight text-blue-gray sm:text-5xl">
                  {formatPrintPromotionOffer(promotion)}
                </h1>
                <p className="mt-4 text-lg leading-relaxed text-blue-gray/75">
                  Usa il codice <strong className="font-mono text-terracotta">{promotion.code}</strong> e completa l’ordine entro il {expiryDate(promotion.endsAt)}.
                </p>

                <section className="mt-8 rounded-2xl bg-off-white p-5">
                  <h2 className="text-lg font-semibold text-blue-gray">Condizioni dell’offerta</h2>
                  <p className="mt-2 text-sm leading-relaxed text-blue-gray/70">
                    {promotion.scope === 'selected'
                      ? `Valida per: ${promotion.eligibleFormats.map(format => format.name).join(', ')}.`
                      : 'Valida su tutti i formati di stampa acquistabili nello shop.'}
                  </p>
                  {isFixedPackage ? (
                    <p className="mt-2 text-sm font-semibold text-blue-gray">
                      Quantità esatta: {promotion.minPrintQuantity} stampe totali, senza copie aggiuntive.
                    </p>
                  ) : promotion.minPrintQuantity > 0 ? (
                    <p className="mt-2 text-sm text-blue-gray/70">
                      Quantità minima: {promotion.minPrintQuantity} copie.
                    </p>
                  ) : null}
                  <p className="mt-3 text-sm text-blue-gray/70">
                    Il riepilogo mostra il risparmio effettivo rispetto al listino prima del pagamento. La spedizione è esclusa dallo sconto.
                  </p>
                </section>

                <Button asChild className="mt-8 min-h-12 rounded-full bg-dark-sage px-6 text-white hover:bg-blue-gray">
                  <a href={orderHref}>
                    Scegli le stampe e applica il coupon
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </article>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
