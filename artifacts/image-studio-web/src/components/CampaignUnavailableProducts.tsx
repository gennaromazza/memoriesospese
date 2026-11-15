import type { Product } from '@shared/booking-types';
import { Button } from '@/components/ui/button';

type CatalogProduct = Pick<Product, 'id' | 'nome' | 'attivo'>;

export function unavailableCampaignProducts(products: CatalogProduct[], selectedIds: string[]) {
  const catalog = new Map(products.map(product => [product.id, product]));
  return [...new Set(selectedIds)].flatMap(id => {
    const product = catalog.get(id);
    return product?.attivo ? [] : [{
      id,
      name: product?.nome || `Prodotto non trovato (ID: ${id})`,
      status: product ? 'Disattivato' : 'Non più presente nel catalogo',
    }];
  });
}

export function removeCampaignProduct(selectedIds: string[], id: string) {
  return selectedIds.filter(selectedId => selectedId !== id);
}

export default function CampaignUnavailableProducts({ products, selectedIds, onRemove }: {
  products: CatalogProduct[];
  selectedIds: string[];
  onRemove: (id: string) => void;
}) {
  const unavailable = unavailableCampaignProducts(products, selectedIds);
  if (!unavailable.length) return null;

  return (
    <section aria-label="Prodotti selezionati da verificare" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950" data-testid="campaign-unavailable-products">
      <h3 className="text-sm font-semibold">Prodotti selezionati da verificare ({unavailable.length})</h3>
      <p className="mt-1 text-xs">
        Sono ancora associati alla campagna, ma non compaiono tra i prodotti attivi.
        Restano selezionati finché non li rimuovi. Le modifiche saranno applicate salvando la campagna.
      </p>
      <ul className="mt-3 space-y-2">
        {unavailable.map(product => (
          <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-background p-2">
            <div className="min-w-0 flex-1 basis-40 break-words">
              <p className="text-sm font-medium">{product.name}</p>
              <p className="text-xs">{product.status}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onRemove(product.id)} aria-label={`Rimuovi dalla campagna: ${product.name}`}>
              Rimuovi
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
