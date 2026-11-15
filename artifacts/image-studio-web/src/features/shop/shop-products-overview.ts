import type { Product } from '@shared/booking-types';
import { shopPriceCents } from '@shared/shop-types';
import { isPrintShopManagedProduct } from '@/features/print-shop/product-channel-guard';

export interface ShopProductRow {
  product: Product;
  /** Compare in vetrina ora (attivo e prezzo valido). */
  visible: boolean;
  /** Prezzo finale in centesimi, calcolato come nel catalogo pubblico. */
  finalPriceCents: number | null;
  /** Costo e margine riservati alla gestione admin; null se il costo manca. */
  unitCostCents: number | null;
  unitMarginCents: number | null;
  /** Cose da sistemare o da sapere, in italiano semplice. */
  notes: string[];
}

/** Prodotti del catalogo che stanno in una delle categorie dello shop, con cosa manca a ciascuno. */
export function shopProductRows(
  products: readonly Product[],
  categoryValues: readonly string[],
  needsWeight: boolean,
): ShopProductRow[] {
  return products
    .filter(product => categoryValues.includes(product.categoria) && !isPrintShopManagedProduct(product as { salesChannels?: unknown }))
    .map(product => {
      const notes: string[] = [];
      const price = shopPriceCents(product.prezzo, product.sconto);
      const hasPrice = price !== null;
      const unitCostCents = typeof product.costoUnitario === 'number'
        && Number.isFinite(product.costoUnitario)
        && product.costoUnitario >= 0
        ? Math.round(product.costoUnitario * 100)
        : null;
      if (!product.attivo) notes.push('Non attivo: i clienti non lo vedono.');
      if (!hasPrice) notes.push('Manca il prezzo: non compare in vetrina.');
      if (needsWeight && !(Number(product.pesoGrammi) > 0)) notes.push('Manca il peso: la spedizione non può essere calcolata bene.');
      if (!product.immagini || product.immagini.length === 0) notes.push('Nessuna immagine.');
      return {
        product,
        visible: product.attivo === true && hasPrice,
        finalPriceCents: price?.priceCents ?? null,
        unitCostCents,
        unitMarginCents: price && unitCostCents !== null ? price.priceCents - unitCostCents : null,
        notes,
      };
    });
}
