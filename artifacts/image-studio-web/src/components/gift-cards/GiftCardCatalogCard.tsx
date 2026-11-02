import {
  formatGiftCardPrice,
  resolveGiftCardVisualStyle,
  type GiftCardShopTypeDto,
} from '@shared/gift-card-types';
import { giftCardThemeVars } from './giftCardThemes';
import './gift-card-catalog-card.css';

interface Props {
  item: GiftCardShopTypeDto;
  studioName: string;
  selected: boolean;
  onSelect: () => void;
}

function includedProductNames(item: GiftCardShopTypeDto): string {
  return item.items
    .map(entry => entry.quantity > 1 ? `${entry.name} × ${entry.quantity}` : entry.name)
    .join(', ');
}

export function GiftCardCatalogCard({ item, studioName, selected, onSelect }: Props) {
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
          <p className="gcx-gift-catalog-includes">
            <strong>Cosa include:</strong> {includedProductNames(item)}
          </p>
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
    </article>
  );
}
