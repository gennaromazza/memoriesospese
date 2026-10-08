import { useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { SHOP_FAQS, SHOP_PATH, SHOP_SEO, SHOP_STEPS } from '@shared/shop-landing-content';
import {
  formatShopPrice,
  shopDayKey,
  type ShopCatalogDto,
  type ShopProductDto,
} from '@shared/shop-types';
import { getWhatsAppLink } from '@shared/phone-utils';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { GiftCardAmbient } from '@/components/gift-cards/GiftCardArt';
import { giftCardThemeVars } from '@/components/gift-cards/giftCardThemes';
import { shopApi } from '@/features/shop/shop-api';
import { useShopCart } from '@/features/shop/useShopCart';
import '@/components/gift-cards/gift-cards.css';

const THEME = 'natale' as const;

function photosLabel(count: number): string {
  if (count <= 0) return 'Nessuna foto da caricare';
  return count === 1 ? 'Serve 1 tua foto' : `Servono ${count} tue foto`;
}

function longDay(isoDay: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${isoDay}T12:00:00Z`));
}

function shippingLine(shipping: ShopCatalogDto['shipping']): string {
  if (!shipping.enabled) return 'Ritiro gratuito in studio ad Aversa.';
  const days = shipping.estimatedMinDays === shipping.estimatedMaxDays
    ? `${shipping.estimatedMinDays} giorni`
    : `${shipping.estimatedMinDays}-${shipping.estimatedMaxDays} giorni`;
  const price = shipping.priceCents > 0 ? `da ${formatShopPrice(shipping.priceCents)}` : 'gratuita';
  return `Spedizione in tutta Italia ${price}, consegna in circa ${days}. Oppure ritiro gratuito in studio.`;
}

export default function ShopPage() {
  const { studioSettings } = useStudio();
  const studioName = studioSettings.name || 'Image Studio';
  const whatsapp = studioSettings.whatsapp?.trim();
  const whatsappUrl = whatsapp ? getWhatsAppLink(whatsapp) : '';
  const studioAddress = studioSettings.address?.trim();
  const studioEmail = studioSettings.email?.trim();

  const catalogQuery = useQuery({ queryKey: ['shop-catalog'], queryFn: shopApi.getCatalog, staleTime: 60_000 });
  const catalog = catalogQuery.data;
  const { cart, count: cartCount, add } = useShopCart();

  useSEO({
    title: SHOP_SEO.title,
    description: SHOP_SEO.description,
    canonical: SHOP_PATH,
    noindex: Boolean(catalog && !catalog.enabled),
  });

  const sections = useMemo(() => {
    if (!catalog) return [];
    return catalog.categories
      .map(category => ({
        category,
        products: catalog.products.filter(product => product.categoria === category.value),
      }))
      .filter(section => section.products.length > 0);
  }, [catalog]);

  const ordersClosedForGood = Boolean(catalog?.lastOrderDate && shopDayKey(new Date()) > catalog.lastOrderDate);
  const contact = whatsappUrl ? (
    <a className="underline" href={whatsappUrl} target="_blank" rel="noopener noreferrer">scrivici su WhatsApp</a>
  ) : (
    <span>scrivici</span>
  );

  const showCatalog = Boolean(catalog?.enabled && catalog.products.length > 0);

  let body;
  if (catalogQuery.isLoading) {
    body = <p className="gcx-note" role="status">Un momento…</p>;
  } else if (catalogQuery.isError || !catalog) {
    body = (
      <div className="gcx-panel">
        <h2>Lo shop non è disponibile</h2>
        <p>Riprova tra poco.</p>
      </div>
    );
  } else if (!showCatalog) {
    body = (
      <div className="gcx-panel gcx-center">
        <h2>Lo shop di Natale arriva presto</h2>
        <p>In questo momento non c'è nessun prodotto in vendita online. Per un regalo su misura {contact}.</p>
      </div>
    );
  } else {
    body = (
      <>
        {!catalog.orderingOpen ? (
          <div className="gcx-panel gcx-center" role="status">
            <h2>{ordersClosedForGood ? 'Gli ordini di Natale sono chiusi' : 'Gli ordini online apriranno a breve'}</h2>
            <p>
              {ordersClosedForGood
                ? <>Per un regalo dell'ultimo minuto {contact}.</>
                : <>Intanto puoi guardare i prodotti. Per ordinare subito {contact}.</>}
            </p>
          </div>
        ) : catalog.lastOrderDate ? (
          <p className="gcx-note" role="status">Ordina entro il {longDay(catalog.lastOrderDate)} per ricevere il regalo a Natale.</p>
        ) : null}

        {catalog.orderingOpen && cartCount > 0 ? (
          <div className="gcx-panel gcx-center" role="status">
            <h2>Hai {cartCount} {cartCount === 1 ? 'prodotto' : 'prodotti'} nel carrello</h2>
            <div className="gcx-cta-row"><Link href="/shop-natale/ordine" className="gcx-btn-gold">Vai all'ordine</Link></div>
          </div>
        ) : null}

        <section id="prodotti" className="gcx-block" aria-labelledby="gcx-shop-products-t">
          <h2 id="gcx-shop-products-t" className="gcx-h2">I nostri prodotti</h2>
          <p className="gcx-sub">{shippingLine(catalog.shipping)}</p>
          {sections.map(section => (
            <div key={section.category.value}>
              {sections.length > 1 ? <h3 className="gcx-h3">{section.category.nome}</h3> : null}
              <div className="gcx-ideas">
                {section.products.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    canOrder={catalog.orderingOpen}
                    inCart={cart.items.filter(item => item.productId === product.id).reduce((total, item) => total + item.quantity, 0)}
                    onAdd={() => add(product)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="gcx-stripes" aria-hidden="true" />
        <section className="gcx-block" aria-labelledby="gcx-shop-how-t">
          <h2 id="gcx-shop-how-t" className="gcx-h2">Come funziona</h2>
          <ol className="gcx-how">
            {SHOP_STEPS.map((step, index) => (
              <li key={step.title}><b>{index + 1}</b><h3>{step.title}</h3><p>{step.text}</p></li>
            ))}
          </ol>
        </section>

        <section className="gcx-block" aria-labelledby="gcx-shop-faq-t">
          <h2 id="gcx-shop-faq-t" className="gcx-h2">Domande frequenti</h2>
          {SHOP_FAQS.map(faq => (
            <details key={faq.question} className="gcx-faq">
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </section>

        <aside className="gcx-final">
          <p className="gcx-sub gcx-center-text"><Link href="/shop-natale/i-miei-ordini" className="underline">Hai già ordinato? Vedi i tuoi ordini</Link></p>
          <h2 className="gcx-h2 gcx-h2-center">Vuoi regalare un servizio?</h2>
          <p className="gcx-sub gcx-center-text">Shooting, sconti e idee da usare in studio: scegli un'idea regalo.</p>
          <div className="gcx-cta-row"><Link href="/regala" className="gcx-btn-gold">Vedi le idee regalo</Link></div>
        </aside>
      </>
    );
  }

  return (
    <main className="gcx-scene gcx-landing" style={giftCardThemeVars(THEME)}>
      <GiftCardAmbient theme={THEME} />
      <div className="gcx-scene-inner gcx-shop">
        <header className="gcx-hero">
          <div className="gcx-bulbs" aria-hidden="true" />
          <p className="gcx-eyebrow-l">Natale 2026 · {studioName}</p>
          <h1>{SHOP_SEO.h1}<span className="gcx-hero-script">{SHOP_SEO.script}</span></h1>
          <p className="gcx-lede">{SHOP_SEO.lede}</p>
          {showCatalog ? (
            <div className="gcx-cta-row">
              <a className="gcx-btn-gold" href={`${SHOP_PATH}#prodotti`} onClick={event => {
                event.preventDefault();
                document.getElementById('prodotti')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>Scegli il prodotto</a>
              <Link href="/regala" className="gcx-btn-line">Idee regalo</Link>
            </div>
          ) : null}
          <ul className="gcx-proof">
            <li>Paghi in sicurezza con PayPal</li>
            <li>Con le tue foto</li>
          </ul>
        </header>
        {body}
        <footer className="gcx-foot gcx-foot-l">
          <p>{studioName}{studioAddress ? ` · ${studioAddress}` : ''}</p>
          <p>
            {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}
            {whatsappUrl && studioEmail ? ' · ' : null}
            {studioEmail ? <a href={`mailto:${studioEmail}`}>{studioEmail}</a> : null}
          </p>
        </footer>
      </div>
    </main>
  );
}

function ProductCard({ product, canOrder, inCart, onAdd }: { product: ShopProductDto; canOrder: boolean; inCart: number; onAdd: () => void }) {
  const cover = product.images[0];
  const discounted = product.priceCents < product.listPriceCents;
  return (
    <article className="gcx-idea">
      <div className="gcx-idea-ph">
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span>{product.nome}</span>}
      </div>
      <div className="gcx-idea-body">
        <h3>{product.nome}</h3>
        {product.descrizione ? <p>{product.descrizione}</p> : null}
        <p className="gcx-idea-incl">{photosLabel(product.photosRequired)}</p>
        <div className="gcx-idea-row">
          <b>
            {discounted ? <s style={{ opacity: 0.6, marginRight: 8, fontWeight: 400 }}>{formatShopPrice(product.listPriceCents)}</s> : null}
            {formatShopPrice(product.priceCents)}
          </b>
          {canOrder ? (
            <button type="button" className="gcx-btn-gold" onClick={onAdd}>
              {inCart > 0 ? `Aggiungi un altro (${inCart})` : 'Aggiungi al carrello'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
