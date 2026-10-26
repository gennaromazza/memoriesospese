import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CampaignUnavailableProducts, { removeCampaignProduct, unavailableCampaignProducts } from './CampaignUnavailableProducts';

const products = [
  { id: 'active', nome: 'Album attivo', attivo: true },
  { id: 'inactive', nome: 'Album precedente', attivo: false },
];

describe('Prodotti non disponibili nelle campagne', () => {
  it('distingue prodotti disattivati e mancanti senza modificare le selezioni', () => {
    const selected = ['active', 'inactive', 'deleted'];
    expect(unavailableCampaignProducts(products, selected)).toEqual([
      { id: 'inactive', name: 'Album precedente', status: 'Disattivato' },
      { id: 'deleted', name: 'Prodotto non trovato (ID: deleted)', status: 'Non più presente nel catalogo' },
    ]);
    expect(selected).toEqual(['active', 'inactive', 'deleted']);
  });

  it('rimuove solo la scelta richiesta preservando attivi e altre scelte non disponibili', () => {
    const selected = ['active', 'inactive', 'deleted'];
    expect(removeCampaignProduct(selected, 'inactive')).toEqual(['active', 'deleted']);
    expect(removeCampaignProduct(selected, 'deleted')).toEqual(['active', 'inactive']);
    expect(selected).toHaveLength(3);
  });

  it('mostra nomi, stato e rimozione esplicita anche senza prodotti attivi', () => {
    const html = renderToStaticMarkup(<CampaignUnavailableProducts products={products.slice(1)} selectedIds={['inactive', 'deleted']} onRemove={() => {}} />);
    expect(html).toContain('Album precedente');
    expect(html).toContain('Disattivato');
    expect(html).toContain('Non più presente nel catalogo');
    expect(html).toContain('Rimuovi dalla campagna: Album precedente');
    expect(html).toContain('salvando la campagna');
  });

  it('non mostra avvisi per scelte valide e riconosce una riattivazione', () => {
    expect(unavailableCampaignProducts(products, ['active'])).toEqual([]);
    expect(unavailableCampaignProducts(products.map(p => ({ ...p, attivo: true })), ['inactive'])).toEqual([]);
    expect(renderToStaticMarkup(<CampaignUnavailableProducts products={products} selectedIds={['active']} onRemove={() => {}} />)).toBe('');
  });
});
