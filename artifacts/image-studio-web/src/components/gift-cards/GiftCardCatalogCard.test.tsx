import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GIFT_CARD_VISUAL_STYLE_KEYS,
  type GiftCardShopTypeDto,
} from '@shared/gift-card-types';
import { GiftCardCatalogCard } from './GiftCardCatalogCard';

const sample: GiftCardShopTypeDto = {
  id: 'gift-natale',
  name: 'Foto di Natale + album',
  title: 'Foto di Natale',
  line2: 'Un ricordo da conservare',
  description: 'Un servizio fotografico e un album.',
  kind: 'prodotto',
  priceCents: 7500,
  theme: 'natale',
  visualStyle: 'pacchetto',
  items: [{
    productId: 'album',
    name: 'Album fotografico',
    description: 'Album 20×30',
    quantity: 1,
    imageUrls: ['https://images.example.test/album.jpg'],
  }],
  validUntil: null,
};

describe('GiftCardCatalogCard', () => {
  it('mostra il contenuto del regalo, il prezzo e il comando di selezione in ogni layout', () => {
    for (const visualStyle of GIFT_CARD_VISUAL_STYLE_KEYS) {
      const html = renderToStaticMarkup(
        <GiftCardCatalogCard
          item={{ ...sample, visualStyle }}
          studioName="Studio di prova"
          selected
          onSelect={() => undefined}
        />,
      );

      expect(html).toContain(`data-style="${visualStyle}"`);
      expect(html).toContain('Foto di Natale');
      expect(html).toContain('Album fotografico');
      expect(html).toContain('75 €');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('Scelto');
    }
  });
});
