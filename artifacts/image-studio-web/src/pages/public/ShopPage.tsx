import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Gift, ShoppingBag } from 'lucide-react';
import { SHOP_FAQS, SHOP_PATH, SHOP_SEO, SHOP_STEPS } from '@shared/shop-landing-content';
import { SHOP_TERMS_PATH } from '@shared/shop-legal';
import {
  formatShopPrice,
  shopDayKey,
  type ShopCatalogDto,
  type ShopProductDto,
} from '@shared/shop-types';
import { isShopShippingByWeight, shopShippingPriceRange } from '@shared/shop-shipping';
import { getWhatsAppLink } from '@shared/phone-utils';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { GiftCardAmbient } from '@/components/gift-cards/GiftCardArt';
import { giftCardThemeVars } from '@/components/gift-cards/giftCardThemes';
import { shopApi } from '@/features/shop/shop-api';
import {
  ADDED_FEEDBACK_MS,
  addOutcome,
  addedMessage,
  discountPercent,
  photosHint,
  photosLabel,
  productsLabel,
  savingsCents,
  summarizeCart,
} from '@/features/shop/shop-storefront';
import { useShopCart } from '@/features/shop/useShopCart';
import '@/components/gift-cards/gift-cards.css';
import '@/features/shop/shop-storefront.css';

const THEME = 'natale' as const;
const ORDER_PATH = '/shop-natale/ordine';
const MY_ORDERS_PATH = '/shop-natale/i-miei-ordini';

function longDay(isoDay: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${isoDay}T12:00:00Z`));
}

function shippingLine(shipping: ShopCatalogDto['shipping']): string {
  if (!shipping.enabled) return 'Ritiro gratuito in studio ad Aversa.';
  const days = shipping.estimatedMinDays === shipping.estimatedMaxDays
    ? `${shipping.estimatedMinDays} giorni`
    : `${shipping.estimatedMinDays}-${shipping.estimatedMaxDays} giorni`;
  const range = shopShippingPriceRange(shipping);
  const byWeight = isShopShippingByWeight(shipping);
  const min = range?.minCents ?? 0;
  const price = min > 0
    ? `da ${formatShopPrice(min)}`
    : byWeight && (range?.maxCents ?? 0) > 0 ? 'gratuita per gli ordini più leggeri' : 'gratuita';
  const weightNote = byWeight ? ' (il costo dipende dal peso)' : '';
  return `Spedizione in tutta Italia ${price}${weightNote}, a casa in circa ${days} dal pagamento. Oppure ritiro gratuito in studio.`;
}

interface Flash {
  id: string;
  message: string;
  tone: 'ok' | 'warn';
  n: number;
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
  const [flash, setFlash] = useState<Flash | null>(null);

  // Il messaggio "aggiunto" sparisce da solo.
  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(current => (current?.n === flash.n ? null : current)), ADDED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

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

  const summary = useMemo(() => summarizeCart(cart, catalog?.products ?? []), [cart, catalog]);

  const ordersClosedForGood = Boolean(catalog?.lastOrderDate && shopDayKey(new Date()) > catalog.lastOrderDate);
  const contact = whatsappUrl ? (
    <a className="underline" href={whatsappUrl} target="_blank" rel="noopener noreferrer">scrivici su WhatsApp</a>
  ) : (
    <span>scrivici</span>
  );

  const showCatalog = Boolean(catalog?.enabled && catalog.products.length > 0);
  const canOrder = Boolean(catalog?.orderingOpen);
  const showCartBar = showCatalog && canOrder && summary.count > 0;

  const handleAdd = (product: ShopProductDto) => {
    const outcome = addOutcome(cart, product);
    if (outcome === 'added') add(product);
    setFlash({ id: product.id, message: addedMessage(product.nome, outcome), tone: outcome === 'added' ? 'ok' : 'warn', n: Date.now() });
  };

  let body;
  if (catalogQuery.isLoading) {
    body = (
      <section className="gcx-block" aria-busy="true" aria-label="Caricamento dei prodotti">
        <div className="gcx-ideas" aria-hidden="true">
          {[0, 1, 2].map(index => <div key={index} className="gcx-shop-skel" />)}
        </div>
        <p className="gcx-note" role="status">Un momento…</p>
      </section>
    );
  } else if (catalogQuery.isError || !catalog) {
    body = (
      <div className="gcx-panel">
        <h2>Lo shop non è disponibile</h2>
        <p>Riprova tra poco.</p>
        <div className="gcx-cta-row">
          <button type="button" className="gcx-btn-gold" onClick={() => void catalogQuery.refetch()}>Riprova</button>
          <Link href="/" className="gcx-btn-line" style={{ color: '#2b0a0e', borderColor: '#2b0a0e' }}>Torna al sito</Link>
        </div>
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
                    ordersClosedForGood={ordersClosedForGood}
                    waitDays={catalog.photoWaitDays}
                    inCart={cart.items.filter(item => item.productId === product.id).reduce((total, item) => total + item.quantity, 0)}
                    justAdded={flash?.id === product.id && flash.tone === 'ok'}
                    onAdd={() => handleAdd(product)}
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
          <p className="gcx-sub gcx-center-text"><Link href={MY_ORDERS_PATH} className="underline">Hai già ordinato? Vedi i tuoi ordini</Link></p>
          <h2 className="gcx-h2 gcx-h2-center">Vuoi regalare un servizio?</h2>
          <p className="gcx-sub gcx-center-text">Shooting, stampe e sconti da usare in studio: scegli una gift card e consegnala quando vuoi.</p>
          <div className="gcx-cta-row"><Link href="/regala" className="gcx-btn-gold">Vedi le gift card</Link></div>
        </aside>
      </>
    );
  }

  return (
    <main className={`gcx-scene gcx-landing gcx-shop-page${showCartBar ? ' has-cartbar' : ''}`} style={giftCardThemeVars(THEME)}>
      <GiftCardAmbient theme={THEME} />
      {showCatalog ? (
        <a
          className="gcx-skip"
          href={`${SHOP_PATH}#prodotti`}
          onClick={event => {
            event.preventDefault();
            document.getElementById('prodotti')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Vai ai prodotti
        </a>
      ) : null}
      <ShopTopBar
        cartCount={catalog ? summary.count : cartCount}
        showCart={Boolean(catalog?.enabled && catalog.orderingOpen)}
        showOrders={Boolean(catalog?.enabled)}
      />
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
              <Link href="/regala" className="gcx-btn-line">Gift card</Link>
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
          <p className="gcx-shop-foot-links">
            <Link href="/">Torna al sito</Link>
            <Link href={SHOP_TERMS_PATH}>Condizioni di vendita</Link>
            <Link href="/privacy">Privacy</Link>
          </p>
        </footer>
      </div>

      <div className="gcx-shop-toast-region" role="status" aria-live="polite">
        {flash ? <p key={flash.n} className={`gcx-shop-toast${flash.tone === 'warn' ? ' is-warn' : ''}`}>{flash.message}</p> : null}
      </div>
      {showCartBar ? <ShopCartBar count={summary.count} subtotalCents={summary.subtotalCents} /> : null}
    </main>
  );
}

/** Barra in alto: tornare al sito, alle gift card, ai propri ordini e al carrello è sempre a un tocco. */
export function ShopTopBar({ cartCount, showCart, showOrders }: { cartCount: number; showCart: boolean; showOrders: boolean }) {
  return (
    <nav className="gcx-shop-bar" aria-label="Navigazione dello shop">
      <div className="gcx-shop-bar-in">
        <Link href="/" className="gcx-shop-bar-back">
          <ArrowLeft aria-hidden="true" />
          <span>Torna al sito</span>
        </Link>
        <div className="gcx-shop-bar-actions">
          <Link href="/regala" className="gcx-shop-bar-link gcx-shop-bar-link-optional">Gift card</Link>
          {showOrders ? <Link href={MY_ORDERS_PATH} className="gcx-shop-bar-link gcx-shop-bar-link-optional">I miei ordini</Link> : null}
          {showCart ? (
            <Link
              href={ORDER_PATH}
              className="gcx-shop-bar-cart"
              aria-label={cartCount > 0 ? `Vai al carrello: ${productsLabel(cartCount)}` : 'Vai al carrello: vuoto'}
            >
              <ShoppingBag aria-hidden="true" />
              {cartCount > 0 ? <span key={cartCount} className="gcx-shop-bar-badge" aria-hidden="true">{cartCount}</span> : null}
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

/** Riepilogo sempre visibile in basso, con la strada per concludere l'ordine. */
export function ShopCartBar({ count, subtotalCents }: { count: number; subtotalCents: number }) {
  return (
    <div className="gcx-shop-cartbar" role="region" aria-label="Il tuo carrello">
      <div className="gcx-shop-cartbar-in">
        <div className="gcx-shop-cartbar-info">
          <strong key={count}>{productsLabel(count)} nel carrello</strong>
          <span>{formatShopPrice(subtotalCents)} di prodotti, spedizione esclusa</span>
        </div>
        <Link href={ORDER_PATH} className="gcx-btn-gold">Vai all'ordine</Link>
      </div>
    </div>
  );
}

export function ProductCard({
  product,
  canOrder,
  ordersClosedForGood = false,
  waitDays,
  inCart,
  justAdded,
  onAdd,
}: {
  product: ShopProductDto;
  canOrder: boolean;
  ordersClosedForGood?: boolean;
  waitDays: number;
  inCart: number;
  justAdded: boolean;
  onAdd: () => void;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = product.images;
  const cover = images[Math.min(imageIndex, Math.max(0, images.length - 1))];
  const percent = discountPercent(product);
  const savings = savingsCents(product);
  const hint = photosHint(product.photosRequired, waitDays);
  return (
    <article className="gcx-idea" id={`prodotto-${product.id}`}>
      <div className={`gcx-idea-ph${cover ? '' : ' gcx-shop-noimg'}`}>
        {cover ? <img src={cover} alt={product.nome} loading="lazy" /> : <Gift aria-hidden="true" />}
        {percent > 0 ? <span className="gcx-shop-badge">-{percent}%</span> : null}
      </div>
      {images.length > 1 ? (
        <ul className="gcx-shop-thumbs" aria-label={`Foto di ${product.nome}`}>
          {images.slice(0, 6).map((image, index) => (
            <li key={image}>
              <button
                type="button"
                aria-label={`Mostra la foto ${index + 1} di ${images.length}`}
                aria-pressed={index === imageIndex}
                onClick={() => setImageIndex(index)}
              >
                <img src={image} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="gcx-idea-body">
        <h3>{product.nome}</h3>
        {product.descrizione ? <p>{product.descrizione}</p> : null}
        <p className="gcx-idea-incl">{photosLabel(product.photosRequired)}</p>
        {hint ? <p className="gcx-shop-hint">{hint}</p> : null}
        <div className="gcx-shop-buy">
          <div className="gcx-shop-price">
            <b>{formatShopPrice(product.priceCents)}</b>
            {percent > 0 ? <s>{formatShopPrice(product.listPriceCents)}</s> : null}
            {savings > 0 ? <span className="gcx-shop-save">Risparmi {formatShopPrice(savings)}</span> : null}
          </div>
          {canOrder ? (
            <button type="button" className="gcx-btn-gold gcx-shop-add" data-added={justAdded ? 'true' : 'false'} onClick={onAdd}>
              {justAdded ? <Check aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}
              <span>
                {justAdded ? 'Aggiunto' : inCart > 0 ? `Aggiungi un altro (${inCart} nel carrello)` : 'Aggiungi al carrello'}
                <span className="gcx-sr">: {product.nome}</span>
              </span>
            </button>
          ) : (
            <button type="button" className="gcx-btn-gold gcx-shop-add" disabled>
              {ordersClosedForGood ? 'Ordini chiusi' : 'Ordini non ancora aperti'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

