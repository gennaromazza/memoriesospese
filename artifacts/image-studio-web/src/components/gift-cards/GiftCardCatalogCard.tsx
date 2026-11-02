import { useState } from 'react';
import {
  formatGiftCardPrice,
  resolveGiftCardVisualStyle,
  type GiftCardItemDto,
  type GiftCardShopTypeDto,
} from '@shared/gift-card-types';
import { giftCardThemeVars } from './giftCardThemes';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './gift-card-catalog-card.css';

interface Props {
  item: GiftCardShopTypeDto;
  studioName: string;
  selected: boolean;
  onSelect: () => void;
}

export function GiftCardCatalogCard({ item, studioName, selected, onSelect }: Props) {
  const [details, setDetails] = useState<GiftCardItemDto | null>(null);
  const visualStyle = resolveGiftCardVisualStyle(item.visualStyle);
  const cover = item.items.find(entry => entry.imageUrls[0])?.imageUrls[0];
  const heading = (
    <h3 className="gcx-gift-catalog-title">
      {item.title}
    </h3>
  );

  return (
    <article
      className={`gcx-gift-catalog-card${selected ? ' is-selected' : ''}`}
      style={giftCardThemeVars(item.theme)}
      data-style={visualStyle}
    >
      <div className={`gcx-gift-catalog-visual gcx-gift-catalog-visual--${visualStyle}`}>
        {visualStyle === 'pacchetto' ? (
          <div className="gcx-gift-package" aria-label="Gift card presentata come pacchetto regalo">
            <span className="gcx-gift-brand">{studioName}</span>
            <div className="gcx-gift-box">
              <div className="gcx-gift-box-face">
                <span className="gcx-gift-box-ribbon" aria-hidden="true" />
                {cover ? <img className="gcx-gift-box-photo" src={cover} alt="" loading="lazy" /> : null}
              </div>
              <div className="gcx-gift-box-lid" aria-hidden="true" />
              <div className="gcx-gift-bow" aria-hidden="true"><i /><i /><b /></div>
            </div>
            <div className="gcx-gift-package-tag">
              <span className="gcx-gift-tag-kicker">Un regalo per te</span>
              {heading}
            </div>
          </div>
        ) : null}

        {visualStyle === 'busta' ? (
          <div className="gcx-gift-envelope" aria-label="Gift card presentata in una busta">
            <div className="gcx-gift-letter">
              <span className="gcx-gift-tag-kicker">Un pensiero speciale</span>
              {heading}
            </div>
            <div className="gcx-gift-envelope-front" aria-hidden="true" />
            <span className="gcx-gift-envelope-seal" aria-hidden="true" />
          </div>
        ) : null}

        {visualStyle === 'cornice' ? (
          <div className="gcx-gift-photo-frame" aria-label={cover ? 'Fotografia del prodotto incluso' : 'Cornice regalo'}>
            <div className="gcx-gift-photo-frame-inner">
              {cover ? <img src={cover} alt="" loading="lazy" /> : <span aria-hidden="true" />}
            </div>
          </div>
        ) : null}

        {visualStyle === 'premium' ? (
          <div className="gcx-gift-premium-art" aria-hidden="true">
            <span className="gcx-gift-premium-brand">{studioName}</span>
            <span className="gcx-gift-premium-rule" />
            <span className="gcx-gift-premium-arch"><i /></span>
            <span className="gcx-gift-premium-label">Gift card</span>
          </div>
        ) : null}
      </div>

      <div className="gcx-gift-catalog-body">
        {visualStyle === 'cornice' || visualStyle === 'premium' ? heading : null}
        {item.line2 ? <p className="gcx-gift-catalog-line">{item.line2}</p> : null}
        {item.description ? <p className="gcx-gift-catalog-description">{item.description}</p> : null}
        {item.items.length ? (
          <div className="gcx-gift-catalog-includes">
            <strong>Cosa include:</strong>
            <ul className="gcx-gift-catalog-products">
              {item.items.map(product => {
                const bundleSummary = product.bundleItems
                  ?.map(component => `${component.quantity} × ${component.name}`)
                  .join(', ');
                return (
                  <li key={product.productId}>
                    <button
                      type="button"
                      className="gcx-gift-catalog-product"
                      onClick={() => setDetails(product)}
                      aria-label={`Apri i dettagli di ${product.name}`}
                    >
                      <span className="gcx-gift-catalog-product-name">
                        {product.name}{product.quantity > 1 ? ` × ${product.quantity}` : ''}
                      </span>
                      {product.description ? <span className="gcx-gift-catalog-product-description">{product.description}</span> : null}
                      {bundleSummary ? <span className="gcx-gift-catalog-product-bundle">Comprende: {bundleSummary}</span> : null}
                      <span className="gcx-gift-catalog-product-link">Scopri i dettagli</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="gcx-gift-catalog-footer">
          <span className="gcx-gift-catalog-price">{formatGiftCardPrice(item.priceCents)}</span>
          <button
            type="button"
            className="gcx-gift-catalog-button"
            aria-pressed={selected}
            onClick={onSelect}
          >
            {selected ? 'Scelto' : 'Scegli'}
          </button>
        </div>
      </div>
      <Dialog open={!!details} onOpenChange={open => { if (!open) setDetails(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {details ? (
            <>
              <DialogHeader>
                <DialogTitle>{details.name}{details.quantity > 1 ? ` × ${details.quantity}` : ''}</DialogTitle>
                <DialogDescription className="whitespace-pre-line text-left">
                  {details.description || (details.bundleItems?.length
                    ? 'Questa bundle comprende i prodotti elencati qui sotto.'
                    : 'Informazioni aggiuntive disponibili su richiesta.')}
                </DialogDescription>
              </DialogHeader>
              {details.imageUrls[0] ? (
                <img src={details.imageUrls[0]} alt={details.name} className="max-h-56 w-full rounded-md object-contain" />
              ) : null}
              {details.bundleItems?.length ? (
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold">Prodotti compresi nella bundle</h4>
                  <ul className="space-y-3">
                    {details.bundleItems.map((component, index) => (
                      <li key={`${component.name}-${index}`} className="flex items-start gap-3 rounded-md border p-3">
                        {component.imageUrls[0] ? (
                          <img src={component.imageUrls[0]} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {component.quantity} × {component.name}
                          </p>
                          {component.description ? (
                            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{component.description}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </article>
  );
}
