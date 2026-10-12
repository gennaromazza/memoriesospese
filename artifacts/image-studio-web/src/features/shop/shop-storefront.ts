import { SHOP_MAX_LINES, SHOP_MAX_QUANTITY, type ShopProductDto } from '@shared/shop-types';
import type { CartState } from './shop-cart';

/** Per quanto tempo il pulsante e il messaggio dicono "aggiunto". */
export const ADDED_FEEDBACK_MS = 2400;

export type AddOutcome = 'added' | 'cart_full' | 'max_quantity';

/**
 * Che cosa succede aggiungendo il prodotto adesso. Serve a dirlo al cliente:
 * con il carrello pieno l'aggiunta non fa nulla, e senza un avviso sembrerebbe rotto.
 */
export function addOutcome(cart: CartState, product: Pick<ShopProductDto, 'id' | 'photosRequired'>): AddOutcome {
  // Un prodotto con foto è sempre una riga nuova (ogni esemplare ha le sue foto).
  if (product.photosRequired > 0) return cart.items.length >= SHOP_MAX_LINES ? 'cart_full' : 'added';
  const existing = cart.items.find(item => item.productId === product.id);
  if (existing) return existing.quantity >= SHOP_MAX_QUANTITY ? 'max_quantity' : 'added';
  return cart.items.length >= SHOP_MAX_LINES ? 'cart_full' : 'added';
}

export function addedMessage(productName: string, outcome: AddOutcome): string {
  switch (outcome) {
    case 'added':
      return `${productName} aggiunto al carrello`;
    case 'cart_full':
      return `Il carrello è pieno: al massimo ${SHOP_MAX_LINES} prodotti per ordine`;
    case 'max_quantity':
      return `Di ${productName} se ne possono ordinare al massimo ${SHOP_MAX_QUANTITY}`;
  }
}

/**
 * Pezzi e importo dei prodotti nel carrello, con i prezzi della vetrina.
 * Un prodotto non più in vendita non si conta. Spedizione esclusa: la sceglie il cliente all'ordine.
 */
export function summarizeCart(
  cart: CartState,
  products: ReadonlyArray<Pick<ShopProductDto, 'id' | 'priceCents'>>,
): { count: number; subtotalCents: number } {
  const prices = new Map(products.map(product => [product.id, product.priceCents]));
  let count = 0;
  let subtotalCents = 0;
  for (const item of cart.items) {
    const price = prices.get(item.productId);
    if (price === undefined) continue;
    count += item.quantity;
    subtotalCents += price * item.quantity;
  }
  return { count, subtotalCents };
}

/** Sconto in percentuale intera, 0 se il prodotto non è scontato. */
export function discountPercent(product: Pick<ShopProductDto, 'priceCents' | 'listPriceCents'>): number {
  if (product.listPriceCents <= 0 || product.priceCents >= product.listPriceCents) return 0;
  return Math.round(((product.listPriceCents - product.priceCents) / product.listPriceCents) * 100);
}

/** Quanto si risparmia rispetto al prezzo di listino, in centesimi. */
export function savingsCents(product: Pick<ShopProductDto, 'priceCents' | 'listPriceCents'>): number {
  return Math.max(0, product.listPriceCents - product.priceCents);
}

export function photosLabel(count: number): string {
  if (count <= 0) return 'Nessuna foto da caricare';
  return count === 1 ? 'Serve 1 tua foto' : `Servono ${count} tue foto`;
}

/** Rassicura chi non ha le foto sotto mano: le può mandare anche dopo aver pagato. */
export function photosHint(count: number, waitDays: number): string | null {
  if (count <= 0) return null;
  const days = Math.max(1, Math.trunc(waitDays) || 1);
  return `Le puoi caricare anche dopo il pagamento, entro ${days} ${days === 1 ? 'giorno' : 'giorni'}.`;
}

export function productsLabel(count: number): string {
  return count === 1 ? '1 prodotto' : `${count} prodotti`;
}

export interface DescriptionPart {
  text: string;
  bold: boolean;
}

export interface DescriptionBlock {
  kind: 'heading' | 'paragraph';
  parts: DescriptionPart[];
}

function boldParts(line: string): DescriptionPart[] {
  return line
    .split(/\*\*(.+?)\*\*/g)
    .map((text, index) => ({ text, bold: index % 2 === 1 }))
    .filter(part => part.text !== '');
}

/**
 * Descrizione del prodotto in blocchi leggibili. Chi scrive la descrizione nel gestionale
 * può usare `#` per un titoletto, `**` per il grassetto e `-` per un elenco: qui diventano
 * testo normale, senza mai trattare il contenuto come HTML.
 */
export function descriptionBlocks(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', parts: boldParts(heading[1]) });
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    blocks.push({ kind: 'paragraph', parts: boldParts(item ? `• ${item[1]}` : line) });
  }
  return blocks.filter(block => block.parts.length > 0);
}

/** Descrizione abbastanza lunga da nascondere in parte, con «Leggi tutto». */
export function descriptionIsLong(text: string): boolean {
  const blocks = descriptionBlocks(text);
  const length = blocks.reduce((total, block) => total + block.parts.reduce((sum, part) => sum + part.text.length, 0), 0);
  return length > 140 || blocks.length > 2;
}

/** Messaggio del banner della spedizione gratuita, in base a quanto c'è nel carrello. */
export function freeShippingMessage(
  progress: { thresholdCents: number; remainingCents: number; unlocked: boolean },
  spentCents: number,
  formatPrice: (cents: number) => string,
): string {
  if (progress.unlocked) return 'Hai sbloccato la spedizione gratuita!';
  if (spentCents <= 0) return `Spedizione gratuita per ordini da ${formatPrice(progress.thresholdCents)}`;
  return `Ti mancano ${formatPrice(progress.remainingCents)} per la spedizione gratuita`;
}
