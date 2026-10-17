import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Gift, ShoppingBag } from 'lucide-react';
import { SHOP_FAQS, SHOP_PATH, SHOP_SEO, SHOP_STEPS, shopCategoryPath, shopCategorySeo } from '@shared/shop-landing-content';
import { SHOP_TERMS_PATH } from '@shared/shop-legal';
import {
  formatShopPrice,
  shopDayKey,
  type ShopCatalogDto,
  type ShopProductDto,
} from '@shared/shop-types';
import { isShopShippingByWeight, shopFreeShippingProgress, shopShippingPriceRange } from '@shared/shop-shipping';
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
  descriptionBlocks,
  descriptionIsLong,
  freeShippingMessage,
} from '@/features/shop/shop-storefront';
import { useShopCart } from '@/features/shop/useShopCart';
import '@/components/gift-cards/gift-cards.css';
import '@/features/shop/shop-storefront.css';

const THEME = 'natale' as const;
const ORDER_PATH = '/online-shop/ordine';
const MY_ORDERS_PATH = '/online-shop/i-miei-ordini';

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

/** La vetrina; con `categoryValue` è la pagina di una sola categoria, con indirizzo, titolo e testi propri. */
export default function ShopPage({ categoryValue }: { categoryValue?: string } = {}) {
  const { studioSettings } = useStudio();
  const studioName = studioSettings.name || 'Image Studio';
  const whatsapp = studioSettings.whatsapp?.trim();
  const whatsappUrl = whatsapp ? getWhatsAppLink(whatsapp) : '';
  const studioAddress = studioSettings.address?.trim();
  const studioEmail = studioSettings.email?.trim();

  const catalogQuery = useQuery({ queryKey: ['shop-catalog'], queryFn: shopApi.getCatalog, staleTime: 10_000 });
  const catalog = catalogQuery.data;
  const { cart, count: cartCount, add } = useShopCart();
  const [flash, setFlash] = useState<Flash | null>(null);

  // Il messaggio "aggiunto" sparisce da solo.
  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(current => (current?.n === flash.n ? null : current)), ADDED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const allSections = useMemo(() => {
    if (!catalog) return [];
    return catalog.categories
      .map(category => ({
        category,
        products: catalog.products.filter(product => product.categoria === category.value),
      }))
      .filter(section => section.products.length > 0);
  }, [catalog]);
  const sections = categoryValue ? allSections.filter(section => section.category.value === categoryValue) : allSections;
  const currentCategory = categoryValue ? allSections.find(section => section.category.value === categoryValue)?.category : undefined;
  const otherSections = categoryValue ? allSections.filter(section => section.category.value !== categoryValue) : [];
  const pagePath = categoryValue ? shopCategoryPath(categoryValue) : SHOP_PATH;
  const categorySeo = currentCategory ? shopCategorySeo(currentCategory.nome) : null;
  const categoryMissing = Boolean(categoryValue && catalog && !currentCategory);

  useSEO({
    title: categorySeo?.title ?? SHOP_SEO.title,
    description: categorySeo?.description ?? SHOP_SEO.description,
    canonical: pagePath,
    noindex: Boolean(catalog && (!catalog.enabled || categoryMissing)),
  });

  const summary = useMemo(() => summarizeCart(cart, catalog?.products ?? []), [cart, catalog]);

  const ordersClosedForGood = Boolean(catalog?.lastOrderDate && shopDayKey(new Date()) > catalog.lastOrderDate);
  const contact = whatsappUrl ? (
    <a className="underline" href={whatsappUrl} target="_blank" rel="noopener noreferrer">scrivici su WhatsApp</a>
  ) : (
    <span>scrivici</span>
  );

  const showCatalog = Boolean(catalog?.enabled && (categoryValue ? sections.length > 0 : catalog.products.length > 0));
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
  } else if (categoryMissing && catalog.enabled) {
    body = (
      <div className="gcx-panel gcx-center">
        <h2>Questa categoria non è disponibile</h2>
        <p>Non c'è nessun prodotto in vendita in questa categoria. Guarda tutto lo shop online.</p>
        <div className="gcx-cta-row"><Link href={SHOP_PATH} className="gcx-btn-gold">Vai allo shop online</Link></div>
      </div>
    );
  } else if (!showCatalog) {
    body = (
      <div className="gcx-panel gcx-center">
        <h2>Lo shop online arriva presto</h2>
        <p>In questo momento non c'è nessun prodotto in vendita online. Per un regalo su misura {contact}.</p>
      </div>
    );
  } else {
    body = (
      <>
        {!catalog.orderingOpen ? (
          <div className="gcx-panel gcx-center" role="status">
            <h2>{ordersClosedForGood ? 'Gli ordini sono chiusi' : 'Gli ordini online apriranno a breve'}</h2>
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
          <FreeShippingBanner shipping={catalog.shipping} spentCents={summary.subtotalCents} />
          {!categoryValue && sections.length > 1 ? <ShopCategoryNav sections={sections} label="Categorie dello shop" /> : null}
          {sections.map(section => (
            <div key={section.category.value}>
              {!categoryValue && sections.length > 1 ? (
                <h3 className="gcx-h3">
                  <Link href={shopCategoryPath(section.category.value)}>{section.category.nome}</Link>
                </h3>
              ) : null}
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

        {categoryValue && otherSections.length > 0 ? (
          <section className="gcx-block" aria-labelledby="gcx-shop-others-t">
            <h2 id="gcx-shop-others-t" className="gcx-h2">Altre categorie</h2>
            <ShopCategoryNav sections={otherSections} label="Altre categorie dello shop" />
          </section>
        ) : null}

        {!categoryValue ? (
          <section className="gcx-block" aria-labelledby="gcx-shop-faq-t">
            <h2 id="gcx-shop-faq-t" className="gcx-h2">Domande frequenti</h2>
            {SHOP_FAQS.map(faq => (
              <details key={faq.question} className="gcx-faq">
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </section>
        ) : null}

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
          href={`${pagePath}#prodotti`}
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
        {categoryValue ? (
          <nav className="gcx-shop-crumbs" aria-label="Percorso">
            <Link href={SHOP_PATH}>{SHOP_SEO.breadcrumb}</Link>
            <span aria-hidden="true"> › </span>
            <span aria-current="page">{currentCategory?.nome ?? categoryValue}</span>
          </nav>
        ) : null}
        <header className="gcx-hero">
          <div className="gcx-bulbs" aria-hidden="true" />
          <p className="gcx-eyebrow-l">{studioName}</p>
          <h1>{categorySeo?.h1 ?? SHOP_SEO.h1}<span className="gcx-hero-script">{SHOP_SEO.script}</span></h1>
          <p className="gcx-lede">{categorySeo?.lede ?? SHOP_SEO.lede}</p>
          {showCatalog ? (
            <div className="gcx-cta-row">
              <a className="gcx-btn-gold" href={`${pagePath}#prodotti`} onClick={event => {
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
      {showCartBar ? <ShopCartBar count={summary.count} subtotalCents={summary.subtotalCents} shipping={catalog?.shipping} /> : null}
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
          <Link href="/stampa-foto-aversa" className="gcx-shop-bar-link">Stampa foto</Link>
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
export function ShopCartBar({ count, subtotalCents, shipping }: { count: number; subtotalCents: number; shipping?: ShopCatalogDto['shipping'] }) {
  const free = shopFreeShippingProgress(shipping, subtotalCents);
  return (
    <div className="gcx-shop-cartbar" role="region" aria-label="Il tuo carrello">
      <div className="gcx-shop-cartbar-in">
        <div className="gcx-shop-cartbar-info">
          <strong key={count}>{productsLabel(count)} nel carrello</strong>
          <span>{formatShopPrice(subtotalCents)} di prodotti{free?.unlocked ? ', spedizione gratuita' : ', spedizione esclusa'}</span>
          {free && !free.unlocked ? <span className="gcx-shop-cartbar-free">Ti mancano {formatShopPrice(free.remainingCents)} per la spedizione gratuita</span> : null}
          {free?.unlocked ? <span className="gcx-shop-cartbar-free">Spedizione gratuita sbloccata</span> : null}
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
        {product.descrizione ? <ExpandableDescription id={product.id} text={product.descrizione} /> : null}
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


/** Elenco di collegamenti alle pagine delle categorie, con il numero dei prodotti. */
export function ShopCategoryNav({
  sections,
  label,
}: {
  sections: Array<{ category: { value: string; nome: string }; products: unknown[] }>;
  label: string;
}) {
  return (
    <nav className="gcx-shop-cats" aria-label={label}>
      <ul>
        {sections.map(section => (
          <li key={section.category.value}>
            <Link href={shopCategoryPath(section.category.value)}>
              {section.category.nome} <span>({section.products.length})</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Banner che invita a sbloccare la spedizione gratuita; non compare se l'offerta non c'è. */
export function FreeShippingBanner({ shipping, spentCents }: { shipping: ShopCatalogDto['shipping']; spentCents: number }) {
  const progress = shopFreeShippingProgress(shipping, spentCents);
  if (!progress) return null;
  return (
    <div className="gcx-shop-free" role="status" data-unlocked={progress.unlocked ? 'true' : 'false'}>
      <strong>{freeShippingMessage(progress, spentCents, formatShopPrice)}</strong>
      {!progress.unlocked && spentCents > 0 ? <span>Spedizione gratuita per ordini da {formatShopPrice(progress.thresholdCents)}, a casa tua in tutta Italia.</span> : null}
      {progress.unlocked ? <span>Scegli la spedizione all'ordine e non la paghi.</span> : null}
      <div className="gcx-shop-free-bar" aria-hidden="true"><i style={{ width: `${progress.percent}%` }} /></div>
    </div>
  );
}

/** Descrizione del prodotto: se è lunga se ne vedono poche righe, con «Leggi tutto» per aprirla. */
export function ExpandableDescription({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  const blocks = descriptionBlocks(text);
  if (blocks.length === 0) return null;
  const long = descriptionIsLong(text);
  const bodyId = `descrizione-${id}`;
  return (
    <div className="gcx-shop-desc" data-clamped={long && !open ? 'true' : 'false'}>
      <div className="gcx-shop-desc-body" id={bodyId}>
        {blocks.map((block, index) => {
          const content = block.parts.map((part, partIndex) => (part.bold ? <strong key={partIndex}>{part.text}</strong> : <span key={partIndex}>{part.text}</span>));
          return block.kind === 'heading' ? <h4 key={index}>{content}</h4> : <p key={index}>{content}</p>;
        })}
      </div>
      {long ? (
        <button type="button" className="gcx-shop-desc-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
          {open ? 'Mostra meno' : 'Leggi tutto'}
        </button>
      ) : null}
    </div>
  );
}
